// Cloud Functions entry point for recipy (spec §7.8).
//
// One Express app exposed as a single `api` function, mounted under the
// /api/** Firebase Hosting rewrite. All endpoints live here:
//   - POST /api/search-recipes
//   - POST /api/find-alternate-source
//   - POST /api/recompute-field
//   - POST /api/get-substitutions
//   - POST /api/feedback
//
// Instamart endpoints (/api/check-instamart, /api/add-to-instamart) are
// deferred to M4 — frontend currently doesn't call them in v1 either.
//
// Region: asia-south1 (Mumbai), closest to the user.
// Secret: ANTHROPIC_API_KEY (set via `firebase functions:secrets:set`).

import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { initializeApp, getApps } from "firebase-admin/app";
import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { randomUUID } from "node:crypto";

import {
  SearchFiltersSchema,
  AlternateSourceBodySchema,
  RecomputeFieldBodySchema,
  SubstitutionsBodySchema,
  FeedbackBodySchema,
  RecipeSchema,
  safeParseRecipe,
  type Recipe,
} from "./validation";
import {
  SEARCH_SYSTEM_PROMPT,
  buildSearchUserPrompt,
  buildAlternateSourcePrompt,
  buildRecomputePrompt,
  buildSubstitutionsPrompt,
} from "./prompts";
import {
  callWithWebSearch,
  callPlain,
  parseJsonLoose,
  streamWithWebSearch,
} from "./anthropic";
import { readCache, writeCache, logFeedback } from "./cache";
import { verifyAppCheck } from "./appCheck";
import { JsonArrayStream } from "./streamingJson";

// ----- Firebase admin (lazy init for emulator + production) -----
if (getApps().length === 0) initializeApp();

// ----- Secrets -----
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

// ----- CORS allowlist (spec §12.23) -----
// Production hosting domain, custom subdomain, and local dev only.
const ALLOWED_ORIGINS = new Set<string>([
  "https://recipy-63422.web.app",
  "https://recipy-63422.firebaseapp.com",
  "https://recipy.shankar.design",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

const corsMiddleware = cors({
  origin: (origin, cb) => {
    // Allow no-origin requests (curl, same-origin via hosting rewrite).
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.has(origin)) return cb(null, true);
    return cb(new Error(`Origin not allowed: ${origin}`));
  },
  methods: ["POST", "OPTIONS"],
});

// ----- App -----
const app = express();

// Cloud Run sits behind Google's load balancer. Without trusting one
// proxy hop, Express's `req.ip` reflects the LB's address — every
// request looks like the same client and the rate limiter would block
// everyone after the first N hits. The "1" means "trust exactly one
// proxy in front." If after deploy the limiter blocks after 1–2 hits
// instead of the configured N, bump this to `true`.
app.set("trust proxy", 1);

app.use(corsMiddleware);
app.use(express.json({ limit: "1mb" }));

// Tiny request logger — helps debug from the Cloud Run logs. Also logs
// req.ip so we can verify trust-proxy is reading the real client IP
// (not the LB's) for rate limiting. If every request shows the same
// IP, trust-proxy isn't taking effect.
app.use((req, _res, next) => {
  console.log(`${req.method} ${req.path} ip=${req.ip}`);
  next();
});

// App Check verification — rejects requests without a valid token from our
// real web app. Must run after CORS (so preflight succeeds) and before any
// route handler. The middleware self-skips OPTIONS and /api/health.
app.use(verifyAppCheck);

// ----- Rate limiting (spec §7.2) -----
//
// Per-IP, per-route: a single IP can hit each POST endpoint up to 10
// times per minute, and /api/health up to 30 times per minute. The
// limiter is per-route (not shared across endpoints) so a search
// doesn't compete with a feedback submit. Effective total cap for one
// IP is 10×5 + 30 = 80 requests/minute, well below anything a real
// user would do but tight enough to cap cost if anything goes wrong.
//
// Important: express-rate-limit uses an in-memory store. Cloud
// Functions can scale to maxInstances containers (10 in our config),
// so the EFFECTIVE limit is up to N×limit when traffic spreads across
// warm instances. For a one-user app this is fine — even 10× the
// configured budget is way under what would hurt. If we ever care
// about strict ceilings, swap in a Firestore-backed store.
const RATE_LIMIT_ERROR = {
  error: {
    code: "rate_limited",
    message: "Too many requests. Try again in a minute.",
  },
};

const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: RATE_LIMIT_ERROR,
});

const readLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: RATE_LIMIT_ERROR,
});

// Async handler wrapper so thrown errors land in our error middleware.
function asyncHandler(
  fn: (req: Request, res: Response) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}

/** Normalise a URL to host+path for cross-call equality checks. Strips
 *  query strings, hash fragments, and trailing slashes — Claude occasionally
 *  appends `?utm=...` or rounds a trailing slash differently on a re-search,
 *  which would otherwise count as a "different" URL. Returns null if the
 *  input isn't a parseable URL. */
function normaliseUrlKey(input: string): string | null {
  try {
    const u = new URL(input);
    let path = u.pathname.replace(/\/+$/, "");
    if (path === "") path = "/";
    return `${u.hostname.toLowerCase()}${path}`;
  } catch {
    return null;
  }
}

// ----- /api/search-recipes -----

// /api/search-recipes — STREAMING NDJSON RESPONSE
//
// Response format: one JSON object per line (newline-delimited JSON).
// Object shapes:
//   {"type":"recipe","recipe":<Recipe>}    -- one valid recipe ready to render
//   {"type":"done","count":N,"cached":bool} -- end of stream marker
//   {"type":"error","message":"..."}       -- non-fatal stream error
//
// Cache hits also use the streaming protocol so the frontend has one
// code path. The "cached" flag in the done message lets the UI skip the
// loading copy when content was instant.
app.post(
  "/api/search-recipes",
  writeLimiter,
  asyncHandler(async (req, res) => {
    // `skipCache: true` tells us to bypass the read path entirely —
    // regenerate uses this so "give me other recipes" actually fetches
    // fresh ones instead of returning the same cached batch. We still
    // write to cache afterwards so subsequent fresh searches benefit.
    // Read at the body level (not part of SearchFilters) because including
    // it in the filters would change the cache hash and defeat caching
    // for normal calls. Zod strips unknown fields by default, so the
    // following safeParse won't choke on it.
    const skipCache = req.body?.skipCache === true;

    const parsed = SearchFiltersSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "invalid_filters", message: parsed.error.message },
      });
    }
    const filters = parsed.data;

    // Set headers for NDJSON streaming. X-Accel-Buffering: no asks any
    // proxy in front (Firebase Hosting / Cloud Run frontend) to flush
    // rather than buffer the response.
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("X-Accel-Buffering", "no");

    const writeLine = (obj: unknown) => {
      res.write(JSON.stringify(obj) + "\n");
    };

    // 1) Cache check — emit immediately if hit. Regenerate paths pass
    // skipCache so they always go to Claude.
    const cached = skipCache ? null : await readCache(filters);
    if (cached) {
      console.log(`cache hit: ${cached.length} recipes`);
      for (const recipe of cached) {
        writeLine({ type: "recipe", recipe });
      }
      writeLine({ type: "done", count: cached.length, cached: true });
      return res.end();
    }

    // 2) Stream from Claude with web search; emit each recipe as its
    // closing brace arrives.
    const collected: Recipe[] = [];
    const parser = new JsonArrayStream();

    try {
      for await (const chunk of streamWithWebSearch({
        apiKey: ANTHROPIC_API_KEY.value(),
        system: SEARCH_SYSTEM_PROMPT,
        user: buildSearchUserPrompt(filters),
      })) {
        const objects = parser.push(chunk);
        for (const obj of objects) {
          const withId = reIdRecipe(obj);
          const valid = safeParseRecipe(withId);
          if (valid) {
            collected.push(valid);
            writeLine({ type: "recipe", recipe: valid });
          } else {
            // Log enough to see WHY a recipe was dropped without dumping the
            // whole object. Most common cause historically: difficulty label
            // or score outside the v1 enum.
            const errPreview = RecipeSchema.safeParse(withId);
            const issues = errPreview.success
              ? "n/a"
              : errPreview.error.issues
                  .slice(0, 3)
                  .map((i) => `${i.path.join(".")}=${i.message}`)
                  .join(" · ");
            const titlePreview =
              typeof (withId as { title?: unknown }).title === "string"
                ? (withId as { title: string }).title.slice(0, 80)
                : "<no title>";
            console.warn(`dropped recipe "${titlePreview}": ${issues}`);
          }
        }
      }
    } catch (err) {
      console.error("search stream error:", err);
      writeLine({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
      writeLine({ type: "done", count: collected.length, cached: false });
      return res.end();
    }

    console.log(`search streamed ${collected.length} valid recipes`);

    // Close the response to the client first so they see results
    // immediately. The cache write happens AFTER res.end() but BEFORE the
    // handler returns — Cloud Run keeps the instance alive until the
    // handler resolves, so we don't leak a dangling promise (the cause of
    // the earlier truncated-response bug). Errors inside writeCache are
    // already caught and logged; they can't surface to the user.
    writeLine({ type: "done", count: collected.length, cached: false });
    res.end();
    await writeCache(filters, collected);
    return;
  }),
);

// ----- /api/find-alternate-source -----

app.post(
  "/api/find-alternate-source",
  writeLimiter,
  asyncHandler(async (req, res) => {
    const parsed = AlternateSourceBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "invalid_body", message: parsed.error.message },
      });
    }
    const { dish, excludeUrls } = parsed.data;

    const text = await callWithWebSearch({
      apiKey: ANTHROPIC_API_KEY.value(),
      system: SEARCH_SYSTEM_PROMPT,
      user: buildAlternateSourcePrompt(dish, excludeUrls),
    });

    const raw = parseJsonLoose<unknown[]>(text);
    const arr = Array.isArray(raw) ? raw : [raw];
    // Normalise excluded URLs once so we can compare hostname + pathname
    // (ignoring trailing slashes / query strings) — Claude occasionally
    // appends ?utm=... or strips a trailing slash on the second look.
    const excludedKeys = new Set(
      excludeUrls.map(normaliseUrlKey).filter((k) => k !== null) as string[],
    );
    for (const item of arr) {
      const valid = safeParseRecipe(reIdRecipe(item));
      if (!valid) continue;
      const key = normaliseUrlKey(valid.source.url);
      if (key && excludedKeys.has(key)) {
        console.warn(
          `alternate source matched an excluded URL: ${valid.source.url} — rejecting`,
        );
        continue;
      }
      return res.json({ recipe: valid });
    }
    return res
      .status(404)
      .json({ error: { code: "no_alternate", message: "No alternate source found." } });
  }),
);

// ----- /api/recompute-field -----

app.post(
  "/api/recompute-field",
  writeLimiter,
  asyncHandler(async (req, res) => {
    const parsed = RecomputeFieldBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "invalid_body", message: parsed.error.message },
      });
    }
    const { recipe, field } = parsed.data;

    const ingredientsText = recipe.ingredients
      .map(
        (i) =>
          `- ${i.quantity}${i.unit ? ` ${i.unit}` : ""} ${i.name}${i.group ? ` (${i.group})` : ""}`,
      )
      .join("\n");
    const stepsText = recipe.steps
      .map((s) => `${s.number}. ${s.text}`)
      .join("\n");

    const text = await callPlain({
      apiKey: ANTHROPIC_API_KEY.value(),
      system:
        "You estimate a single integer field for a recipe. Output ONLY a JSON object: { \"value\": <integer> }. No prose.",
      user: buildRecomputePrompt(field, recipe.title, ingredientsText, stepsText),
    });

    const obj = parseJsonLoose<{ value: number }>(text);
    if (typeof obj?.value !== "number" || !Number.isFinite(obj.value)) {
      return res.status(502).json({
        error: { code: "bad_model_output", message: "Could not parse value." },
      });
    }
    return res.json({ value: Math.round(obj.value) });
  }),
);

// ----- /api/get-substitutions -----

app.post(
  "/api/get-substitutions",
  writeLimiter,
  asyncHandler(async (req, res) => {
    const parsed = SubstitutionsBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "invalid_body", message: parsed.error.message },
      });
    }
    const names = parsed.data.ingredients.map((i) => i.name);
    const text = await callPlain({
      apiKey: ANTHROPIC_API_KEY.value(),
      system:
        'You output JSON object mapping ingredient names to substitute strings. No prose, no markdown.',
      user: buildSubstitutionsPrompt(names),
    });

    const obj = parseJsonLoose<Record<string, unknown>>(text);
    // Defensive: ensure each value is a string array of length 1–2.
    const cleaned: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(obj ?? {})) {
      if (Array.isArray(v)) {
        const strs = v.filter((x): x is string => typeof x === "string").slice(0, 2);
        if (strs.length) cleaned[k] = strs;
      }
    }
    return res.json({ substitutions: cleaned });
  }),
);

// ----- /api/feedback -----

app.post(
  "/api/feedback",
  writeLimiter,
  asyncHandler(async (req, res) => {
    const parsed = FeedbackBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "invalid_body", message: parsed.error.message },
      });
    }
    await logFeedback(parsed.data.recipeId, parsed.data.reason);
    return res.json({ ok: true });
  }),
);

// ----- Health check -----
app.get("/api/health", readLimiter, (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// ----- 404 + error -----
app.use((req, res) => {
  res.status(404).json({
    error: { code: "not_found", message: `No route for ${req.method} ${req.path}` },
  });
});

// CORS rejections are surfaced as 403 with the original message — the
// caller knows their own origin and the explicit error helps debugging
// from the browser DevTools. All other errors get a generic message so
// internal details (stack traces, SDK errors, file paths) never leak to
// the client. Real failure context still lands in Cloud Logging via the
// console.error above.
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled error:", err);
  if (err.message?.startsWith("Origin not allowed")) {
    res.status(403).json({
      error: { code: "cors_blocked", message: err.message },
    });
    return;
  }
  res.status(500).json({
    error: { code: "internal", message: "Internal error" },
  });
});

// ----- Re-id helper -----
// Claude assigns its own ids; we replace with a server-side UUID so the
// frontend can rely on uniqueness across responses. We also overwrite
// `source.fetchedAt` with the actual server time — bake-off testing showed
// both Haiku and Sonnet emit timestamps fabricated from prompt context
// rather than the real request time. Shallow-merging the source object
// guards against malformed responses missing it entirely.
function reIdRecipe(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const obj = raw as Record<string, unknown>;
  const source =
    obj.source && typeof obj.source === "object"
      ? (obj.source as Record<string, unknown>)
      : {};
  return {
    ...obj,
    id: randomUUID(),
    source: {
      ...source,
      fetchedAt: new Date().toISOString(),
    },
  };
}

// ----- Export -----

export const api = onRequest(
  {
    secrets: [ANTHROPIC_API_KEY],
    region: "asia-south1",
    cors: false, // we handle CORS via the express middleware (allowlist)
    timeoutSeconds: 60,
    memory: "512MiB",
    maxInstances: 10, // cost guardrail
  },
  app,
);
