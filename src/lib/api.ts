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

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

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

// ----- Endpoint clients -----

export const api = {
  searchRecipes: (filters: SearchFilters) =>
    post<SearchFilters, { recipes: Recipe[] }>("/api/search-recipes", filters),

  findAlternateSource: (dish: string, excludeUrls: string[]) =>
    post<{ dish: string; excludeUrls: string[] }, { recipe: Recipe }>(
      "/api/find-alternate-source",
      { dish, excludeUrls },
    ),

  recomputeField: (recipe: Recipe, field: "calories" | "time") =>
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

export { ApiError };
