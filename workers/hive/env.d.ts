// Cloudflare Workers runtime globals — provided by the runtime at deploy time.
// Local tsc only; these do not ship with the worker.

declare const KV: KVNamespace;

interface KVNamespace {
  get(key: string, options?: { type?: "json" | "arrayBuffer" | "stream" }): Promise<unknown>;
  put(key: string, value: string | ArrayBuffer | Uint8Array | Record<string, unknown>, options?: { expirationTtl?: number; expiration?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string; start?: string; end?: string }): Promise<{ keys: Array<{ name: string; expiration?: number }>; cursor?: string }>;
}

declare function fetch(request: Request, env: Record<string, unknown>, ctx: ExecutionContext): Response | Promise<Response>;


// Request/Response are global in the Workers runtime (from the "web" compatibility).
declare const crypto: {
  subtle: {
    digest(algorithm: string, data: ArrayBuffer | TypedArray | DataView): Promise<ArrayBuffer>;
  };
};

declare class ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}
