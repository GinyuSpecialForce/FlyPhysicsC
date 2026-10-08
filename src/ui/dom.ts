/**
 * Tiny DOM helpers shared by every view: `byId` with a missing-id error,
 * typed element getters, and an HTML-escaping interpolator. All dynamic UI
 * text passes through esc(), so no view builds HTML from unescaped strings.
 */
export function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}

export function input(id: string): HTMLInputElement {
  return byId(id) as HTMLInputElement;
}

export function select(id: string): HTMLSelectElement {
  return byId(id) as HTMLSelectElement;
}

/**
 * Pull a readable reason out of an arbitrary thrown value.
 *
 * `catch` binds *anything*, and `err instanceof Error` is a much narrower test
 * than it looks: an Error that crossed a realm boundary (a Web Worker posting
 * a rejection, or a structured clone) is a plain object here, and our OCR
 * engine rejects with bare strings. Swallowing those turns a reportable
 * failure into a shrug, so every catch-all in the app routes through this.
 */
export function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (typeof err === "object" && err !== null) {
    // cross-realm errors keep `message` (and `name`) but lose the prototype
    const { message, name } = err as { message?: unknown; name?: unknown };
    if (typeof message === "string" && message) return message;
    if (typeof name === "string" && name) return name;
    try {
      const json = JSON.stringify(err);
      if (json && json !== "{}") return json;
    } catch {
      // circular or otherwise unserializable — fall through to String()
    }
  }
  return String(err);
}

/** Escape text for safe interpolation into innerHTML templates. */
export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
