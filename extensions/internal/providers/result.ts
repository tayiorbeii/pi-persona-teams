export interface ProviderResult<T = unknown> { status: "available" | "unavailable" | "failed"; value?: T; reason?: string; }
