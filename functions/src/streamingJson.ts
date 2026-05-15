// Incremental JSON-array stream parser.
//
// As text chunks arrive from a streamed Anthropic response, we keep a
// rolling buffer and emit each complete top-level object as soon as its
// closing brace lands. Brace depth + string/escape state are preserved
// across chunks so an object split mid-stream still emits correctly.
//
// We don't care about the array's `[` / `]` themselves — they're treated
// as syntactic noise. Anything before the first `[` is also skipped, so
// markdown fences (```json) work without special handling.

export class JsonArrayStream {
  private buffer = "";
  private cursor = 0;
  private arrayOpened = false;
  private depth = 0;
  private inString = false;
  private escape = false;
  private objectStart = -1;

  /**
   * Append `chunk` to the buffer and return an array of newly completed
   * top-level objects (parsed). Malformed objects are silently dropped
   * — the caller decides whether to validate each.
   */
  push(chunk: string): unknown[] {
    this.buffer += chunk;
    const completed: unknown[] = [];

    for (; this.cursor < this.buffer.length; this.cursor++) {
      const ch = this.buffer[this.cursor];

      // Skip everything until the array opens (handles ```json prefix etc).
      if (!this.arrayOpened) {
        if (ch === "[") this.arrayOpened = true;
        continue;
      }

      // String + escape state machine — needed so braces inside strings
      // don't move depth.
      if (this.escape) {
        this.escape = false;
        continue;
      }
      if (ch === "\\") {
        this.escape = true;
        continue;
      }
      if (ch === '"') {
        this.inString = !this.inString;
        continue;
      }
      if (this.inString) continue;

      if (ch === "{") {
        if (this.depth === 0) this.objectStart = this.cursor;
        this.depth++;
      } else if (ch === "}") {
        this.depth--;
        if (this.depth === 0 && this.objectStart !== -1) {
          const objStr = this.buffer.slice(this.objectStart, this.cursor + 1);
          try {
            completed.push(JSON.parse(objStr));
          } catch {
            // Partial / malformed — skip and keep scanning. Most likely
            // the closing brace was inside a still-unbalanced parent.
          }
          this.objectStart = -1;
        }
      }
    }

    return completed;
  }
}
