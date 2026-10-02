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

/** Escape text for safe interpolation into innerHTML templates. */
export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
