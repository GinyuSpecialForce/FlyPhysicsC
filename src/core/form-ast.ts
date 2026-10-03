/**
 * The form language: a tiny, safe expression grammar for the `form` strings in
 * `equation-sheet.ts` — `+ - * / ^ ( )`, numbers, and identifiers.
 *
 * It lives apart from `dimension-solver.ts` on purpose. Both the dimensional
 * rescue and the symbolic answer printer need to walk the SAME tree, and this
 * module is what they both agree on: keeping the parser here means neither
 * evaluator has to import the other.
 *
 * This is a hand-written recursive-descent parser, not `eval`, so it is safe to
 * run on anything.
 */
export type Node =
  | { kind: "num"; value: number }
  | { kind: "var"; name: string }
  | { kind: "neg"; arg: Node }
  | { kind: "bin"; op: string; left: Node; right: Node }
  | { kind: "call"; name: string; args: Node[] };

/** The numeric functions a `form` may call. */
export const FORM_FUNCS: Record<string, (...args: number[]) => number> = {
  sqrt: (a) => Math.sqrt(a),
  cbrt: (a) => Math.cbrt(a),
  abs: (a) => Math.abs(a),
  sin: (a) => Math.sin(a),
  cos: (a) => Math.cos(a),
  tan: (a) => Math.tan(a),
};

/** Parse a form. Throws on anything that isn't plain arithmetic. */
export function parseForm(form: string): Node {
  const src = form.replace(/\s+/g, "");
  let i = 0;
  const peek = (): string => src[i] ?? "";
  const eat = (ch: string): void => {
    if (peek() !== ch) throw new Error(`expected ${ch} at ${i} in ${form}`);
    i++;
  };
  const readIdent = (): string => {
    const start = i;
    while (i < src.length && /[A-Za-z_0-9]/.test(src[i])) i++;
    if (start === i) throw new Error(`expected a name at ${i} in ${form}`);
    return src.slice(start, i);
  };
  const expr = (): Node => {
    let left = term();
    for (;;) {
      const op = peek();
      if (op === "+" || op === "-") {
        i++;
        left = { kind: "bin", op, left, right: term() };
      } else return left;
    }
  };
  const term = (): Node => {
    let left = factor();
    for (;;) {
      const op = peek();
      if (op === "*" || op === "/") {
        i++;
        left = { kind: "bin", op, left, right: factor() };
      } else return left;
    }
  };
  const factor = (): Node => {
    const base = unary();
    if (peek() === "^") {
      i++;
      return { kind: "bin", op: "^", left: base, right: factor() };
    }
    return base;
  };
  const unary = (): Node => {
    if (peek() === "-") {
      i++;
      return { kind: "neg", arg: unary() };
    }
    return primary();
  };
  const primary = (): Node => {
    if (peek() === "(") {
      i++;
      const inner = expr();
      eat(")");
      return inner;
    }
    if (/[0-9.]/.test(peek())) {
      const start = i;
      while (i < src.length && /[0-9.]/.test(src[i])) i++;
      const value = parseFloat(src.slice(start, i));
      if (!Number.isFinite(value)) throw new Error(`bad number in ${form}`);
      return { kind: "num", value };
    }
    const name = readIdent();
    if (peek() === "(") {
      i++;
      const args: Node[] = [];
      if (peek() !== ")") {
        args.push(expr());
        while (peek() === ",") {
          i++;
          args.push(expr());
        }
      }
      eat(")");
      return { kind: "call", name, args };
    }
    return { kind: "var", name };
  };
  const node = expr();
  if (i !== src.length) throw new Error(`trailing input at ${i} in ${form}`);
  return node;
}
