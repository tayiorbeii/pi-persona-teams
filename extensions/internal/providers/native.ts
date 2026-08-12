export interface NativeFallbackResult<T = unknown> {
  status: "used" | "failed";
  value?: T;
  reason?: string;
}

/** Native Pi tools remain the bounded execution/editing fallback. */
export function nativeFallback<T>(operation: () => T, reason: string): NativeFallbackResult<T> {
  try { return { status: "used", value: operation(), reason }; }
  catch (error) { return { status: "failed", reason: error instanceof Error ? error.message : String(error) }; }
}
