// Thin wrapper around the Anthropic SDK.
//
// Centralises model name, max_tokens, the web_search tool definition, and
// the "pull text out of an interleaved response" helper. Endpoints call
// these helpers instead of touching the SDK directly.

import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 4096;

let cachedClient: Anthropic | null = null;
let cachedKey: string | null = null;

/** Lazy client; re-created when the secret value changes (function cold start). */
export function getClient(apiKey: string): Anthropic {
  if (cachedClient && cachedKey === apiKey) return cachedClient;
  cachedClient = new Anthropic({ apiKey });
  cachedKey = apiKey;
  return cachedClient;
}

/** Call the model with web search enabled — used by search + alternate-source. */
export async function callWithWebSearch(opts: {
  apiKey: string;
  system: string;
  user: string;
}): Promise<string> {
  const client = getClient(opts.apiKey);
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    // The web_search tool is a server-side tool — the model invokes it and
    // we get the final assistant text once it has finished its tool loop.
    tools: [
      { type: "web_search_20250305", name: "web_search", max_uses: 5 },
    ] as unknown as Anthropic.Tool[], // SDK types lag the server-tool schema
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
  });
  return extractFinalText(response);
}

/** Call the model without tools — used by recompute + substitutions. */
export async function callPlain(opts: {
  apiKey: string;
  system: string;
  user: string;
}): Promise<string> {
  const client = getClient(opts.apiKey);
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
  });
  return extractFinalText(response);
}

/**
 * Pull the concatenated text from the assistant's final response. The
 * response.content array can have interleaved text and tool_use blocks;
 * we only want the text.
 */
function extractFinalText(response: Anthropic.Message): string {
  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

/**
 * Parse JSON tolerantly: strip code fences, find the first balanced [...]
 * or {...}, and JSON.parse it. The system prompt tells Claude not to wrap
 * in fences, but defence-in-depth.
 */
export function parseJsonLoose<T = unknown>(text: string): T {
  let cleaned = text.trim();

  // Strip ```json or ``` fences if present.
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  }

  // Find first { or [ and the matching close.
  const firstObj = cleaned.indexOf("{");
  const firstArr = cleaned.indexOf("[");
  let start = -1;
  let open = "";
  let close = "";
  if (firstArr !== -1 && (firstObj === -1 || firstArr < firstObj)) {
    start = firstArr;
    open = "[";
    close = "]";
  } else if (firstObj !== -1) {
    start = firstObj;
    open = "{";
    close = "}";
  }

  if (start !== -1) {
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) {
          cleaned = cleaned.slice(start, i + 1);
          break;
        }
      }
    }
  }

  return JSON.parse(cleaned) as T;
}
