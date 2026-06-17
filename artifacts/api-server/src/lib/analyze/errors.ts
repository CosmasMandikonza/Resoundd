import type { AnalyzeErrorKind } from "@workspace/shared-types";

/** A pipeline failure with a machine-readable kind the route maps to HTTP. */
export class AnalyzeError extends Error {
  readonly kind: AnalyzeErrorKind;

  constructor(kind: AnalyzeErrorKind, message: string) {
    super(message);
    this.name = "AnalyzeError";
    this.kind = kind;
  }
}

/** HTTP status for each failure kind. */
export function statusForKind(kind: AnalyzeErrorKind): number {
  switch (kind) {
    case "validation":
      return 400;
    case "auth":
      return 502; // our upstream credential is bad, not the caller's fault
    case "not_found":
      return 404;
    case "restricted":
      return 422;
    case "rate_limit":
      return 429;
    case "timeout":
      return 504;
    case "analysis":
    case "internal":
    default:
      return 500;
  }
}
