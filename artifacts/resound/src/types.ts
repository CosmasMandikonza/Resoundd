/**
 * The Resound domain contract now lives in the shared lib so the Express
 * analysis server and this client validate/type against the exact same shapes.
 * Keeping this re-export means every existing `@/types` import keeps working.
 */
export * from "@workspace/shared-types";
