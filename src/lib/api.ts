// Frontend HTTP client for the Cloud Functions endpoints (spec §7.2).
// In v1, all endpoints live under /api/* via Firebase Hosting rewrites.
// In dev (vite), API URL is configurable via VITE_API_BASE; defaults to
// the Firebase emulator URL once we wire it up in M2.
//
// Every request attaches an X-Firebase-AppCheck token so the function
// can verify it came from our real web app (see src/lib/firebase.ts and
// functions/src/appCheck.ts).

import type { Recipe, SearchFilters, Ingredient } from "./types";
import { getAppCheckToken } from "./firebase";
import { mockApi } from "./mockApi";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

// Local-dev mock dispatch. Set VITE_USE_MOCKS=true in .env.local to
// short-circuit every endpoint to canned data — keeps Anthropic credits
// untouched while iterating on UI.
const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === "true";

class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function post<TBody, TResponse>(
  path: string,
  body: TBody,
): Promise<TResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const appCheckToken = await getAppCheckToken();
  if (appCheckToken) headers["X-Firebase-AppCheck"] = appCheckToken;

  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let code = "http_error";
    let message = res.statusText;
    try {
      const err = await res.json();
      code = err.error?.code ?? code;
      message = err.error?.message ?? message;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(code, message, res.status);
  }
  return (await res.json()) as TResponse;
}

// ----- Streaming search -----

/**
 * Stream recipes from /api/search-recipes (NDJSON). Each recipe arrives
 * via `onRecipe` as soon as its closing brace lands on the backend; the
 * promise resolves with the full array + cache flag once "done" arrives.
 *
 * Aborts cleanly if `signal` is triggered (e.g. component unmount).
 */
async function searchRecipesStream(
  filters: SearchFilters,
  onRecipe: (recipe: Recipe) => void,
  signal?: AbortSignal,
  options?: { skipCache?: boolean },
): Promise<{ recipes: Recipe[]; cached: boolean }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const appCheckToken = await getAppCheckToken();
  if (appCheckToken) headers["X-Firebase-AppCheck"] = appCheckToken;

  // skipCache lives at the body root, not inside `filters`, so it doesn't
  // contribute to the backend's cache hash. Regenerate sets this so the
  // backend bypasses the cache read but still writes the result afterwards.
  const body =
    options?.skipCache === true
      ? { ...filters, skipCache: true }
      : filters;

  const res = await fetch(`${API_BASE}/api/search-recipes`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    let code = "http_error";
    let message = res.statusText;
    try {
      const err = await res.json();
      code = err.error?.code ?? code;
      message = err.error?.message ?? message;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(code, message, res.status);
  }

  if (!res.body) {
    throw new ApiError("no_body", "Response had no body", 500);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const recipes: Recipe[] = [];
  let cached = false;
  let streamError: string | null = null;

  // Read line-delimited JSON.
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let msg: { type: string; [k: string]: unknown };
      try {
        msg = JSON.parse(line);
      } catch {
        continue; // skip malformed line
      }
      if (msg.type === "recipe" && msg.recipe) {
        const r = msg.recipe as Recipe;
        recipes.push(r);
        onRecipe(r);
      } else if (msg.type === "done") {
        cached = Boolean(msg.cached);
      } else if (msg.type === "error") {
        streamError = String(msg.message ?? "Stream error");
      }
    }
  }

  if (streamError && recipes.length === 0) {
    throw new ApiError("stream_error", streamError, 500);
  }

  return { recipes, cached };
}

// ----- Endpoint clients -----

const realApi = {
  searchRecipes: searchRecipesStream,

  findAlternateSource: (dish: string, excludeUrls: string[]) =>
    post<{ dish: string; excludeUrls: string[] }, { recipe: Recipe }>(
      "/api/find-alternate-source",
      { dish, excludeUrls },
    ),

  recomputeField: (recipe: Recipe, field: "calories" | "time" | "protein") =>
    post<{ recipe: Recipe; field: typeof field }, { value: number }>(
      "/api/recompute-field",
      { recipe, field },
    ),

  getSubstitutions: (ingredients: Ingredient[]) =>
    post<
      { ingredients: Ingredient[] },
      { substitutions: Record<string, string[]> }
    >("/api/get-substitutions", { ingredients }),

  checkInstamart: (ingredients: string[]) =>
    post<
      { ingredients: string[] },
      {
        availability: Record<
          string,
          { available: boolean; productId?: string; price?: number }
        >;
      }
    >("/api/check-instamart", { ingredients }),

  addToInstamart: (ingredients: string[]) =>
    post<{ ingredients: string[] }, { cartUrl: string; addedCount: number }>(
      "/api/add-to-instamart",
      { ingredients },
    ),

  feedback: (recipeId: string, reason: string) =>
    post<{ recipeId: string; reason: string }, { ok: true }>(
      "/api/feedback",
      { recipeId, reason },
    ),
};

// Dispatch: mocks for local dev, real fetch for prod/dev-against-prod.
// Both objects expose the same shape — typescript enforces the contract.
export const api = USE_MOCKS ? mockApi : realApi;

if (USE_MOCKS) {
  // Loud banner so we don't accidentally ship with mocks on.
  // eslint-disable-next-line no-console
  console.warn(
    "%c[recipy] Using MOCK api (.env.local has VITE_USE_MOCKS=true)",
    "background:#FFEB3B;color:#000;padding:2px 6px;font-weight:700",
  );
}

export { ApiError };
