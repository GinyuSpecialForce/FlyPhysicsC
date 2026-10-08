import { describe, expect, it } from "vitest";
import { describeError } from "../src/ui/dom";

/**
 * `catch` binds anything, and the values that actually arrive in practice are
 * routinely not `Error` instances: the OCR engine rejects with bare strings,
 * and anything posted across a Worker boundary arrives as a plain object. These
 * cases pin the reason-getter so a failure can never be reported as a
 * shrug again.
 */
describe("describeError", () => {
  it("passes through an Error's message", () => {
    expect(describeError(new Error("Could not prepare the picture."))).toBe(
      "Could not prepare the picture.",
    );
  });

  it("keeps a subclass's message rather than its name", () => {
    class OcrUnavailableError extends Error {}
    expect(describeError(new OcrUnavailableError("engine did not load"))).toBe(
      "engine did not load",
    );
  });

  it("reads a bare string rejection", () => {
    // exactly what tesseract's worker rejects with
    expect(describeError("Failed to load language")).toBe("Failed to load language");
  });

  it("reads a cross-realm Error that lost its prototype", () => {
    const cloned = { name: "Error", message: "Network error" };
    expect(describeError(cloned)).toBe("Network error");
  });

  it("prefers message over name", () => {
    expect(describeError({ name: "TypeError", message: "x is not a function" })).toBe(
      "x is not a function",
    );
  });

  it("falls back to name when there is no message", () => {
    expect(describeError({ name: "QuotaExceededError" })).toBe("QuotaExceededError");
  });

  it("serializes a message-less object rather than dropping it", () => {
    expect(describeError({ code: 404, status: "missing" })).toBe(
      '{"code":404,"status":"missing"}',
    );
  });

  it("survives a circular object instead of rethrowing", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => describeError(circular)).not.toThrow();
  });

  it("never returns an empty string, so callers keep a fallback", () => {
    // the verdict line does `describeError(err) || "…squints…"`, so these must
    // be falsy-by-contract or, better, still say something
    for (const value of [null, undefined, 0, NaN]) {
      expect(describeError(value)).toBe(String(value));
    }
    expect(describeError({})).toBe("[object Object]");
  });
});
