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
import { randomUUID } from "node:crypto";

import {
  SearchFiltersSchema,
  AlternateSourceBodySchema,
  RecomputeFieldBodySchema,
  SubstitutionsBodySchema,
  FeedbackBodySchema,
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
import { callWithWebSearch, callPlain, parseJsonLoose } from "./anthropic";
import { readCache, writeCache, logFeedback } from "./cache";

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
app.use(corsMiddleware);
app.use(express.json({ limit: "1mb" }));

// Tiny request logger — helps debug from the Cloud Run logs.
app.use((req, _res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Async handler wrapper so thrown errors land in our error middleware.
function asyncHandler(
  fn: (req: Request, res: Response) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}

// ----- /api/search-recipes -----

app.post(
  "/api/search-recipes",
  asyncHandler(async (req, res) => {
    const parsed = SearchFiltersSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "invalid_filters", message: parsed.error.message },
      });
    }
    const filters = parsed.data;

    // 1) Cache check.
    const cached = await readCache(filters);
    if (cached) {
      console.log(`cache hit: ${cached.length} recipes`);
      return res.json({ recipes: cached });
    }

    // 2) Call Claude with web search.
    const text = await callWithWebSearch({
      apiKey: ANTHROPIC_API_KEY.value(),
      system: SEARCH_SYSTEM_PROMPT,
      user: buildSearchUserPrompt(filters),
    });

    // 3) Parse and validate every recipe; drop ones that fail.
    const raw = parseJsonLoose<unknown[]>(text);
    if (!Array.isArray(raw)) {
      return res.json({ recipes: [] });
    }
    const recipes: Recipe[] = [];
    for (const item of raw) {
      const valid = safeParseRecipe(reIdRecipe(item));
      if (valid) recipes.push(valid);
    }

    console.log(`search returned ${recipes.length}/${raw.length} valid recipes`);

    // 4) Cache and return.
    await writeCache(filters, recipes);
    return res.json({ recipes });
  }),
);

// ----- /api/find-alternate-source -----

app.post(
  "/api/find-alternate-source",
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
    for (const item of arr) {
      const valid = safeParseRecipe(reIdRecipe(item));
      if (valid) return res.json({ recipe: valid });
    }
    return res
      .status(404)
      .json({ error: { code: "no_alternate", message: "No alternate source found." } });
  }),
);

// ----- /api/recompute-field -----

app.post(
  "/api/recompute-field",
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
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// ----- 404 + error -----
app.use((req, res) => {
  res.status(404).json({
    error: { code: "not_found", message: `No route for ${req.method} ${req.path}` },
  });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled error:", err);
  const message = err.message || "Internal error";
  // CORS rejection → 403 to make the cause obvious in DevTools.
  const status = message.startsWith("Origin not allowed") ? 403 : 500;
  res.status(status).json({
    error: { code: status === 403 ? "cors_blocked" : "internal", message },
  });
});

// ----- Re-id helper -----
// Claude assigns its own ids; we replace with a server-side UUID so the
// frontend can rely on uniqueness across responses.
function reIdRecipe(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  return { ...(raw as Record<string, unknown>), id: randomUUID() };
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
