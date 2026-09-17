/**
 * Event-bus waiter for the pi-subagents structured delegation bridge.
 *
 * Protocol facts this module relies on (verified against pi-subagents
 * 0.47.1/0.60.0/0.67.0):
 * - `…:started` is the acceptance ack: the bridge emits
 *   `{ requestId, ownerRunId, nodeId }` after validation, controller
 *   registration, and duplicate-node checks, immediately before launching the
 *   child. It carries no runId yet.
 * - `…:update` progress payloads carry the child `runId` once the child run
 *   exists; that is the same runId the terminal response reports.
 * - `…:cancel` accepts `{ requestId, ownerRunId, nodeId }` and aborts the
 *   attempt's AbortController (or remembers the cancel pre-launch), so the
 *   child terminals as `cancelled` instead of being orphaned.
 * - `…:response` is the single terminal event per attempt.
 *
 * Liveness is tracked by three independent clocks: an ack bound
 * (`ackTimeoutMs`) that fails fast when the first matching started/update
 * event never arrives (the launch never started, so retrying with the same
 * idempotency key is safe); a sliding no-progress bound
 * (`progressTimeoutMs`) re-armed by every matching started/update event,
 * whose error carries the last progress snapshot; and the non-sliding
 * overall cap (`waitMs`), whose error distinguishes a cap reached while the
 * child was still making progress from a stalled child. The ack and
 * progress bounds arm only when the bridge exposes the update event.
 *
 * Older bridges may not export the started/update/cancel event constants at
 * all; every optional event degrades gracefully when its name is missing.
 */

export interface DelegationWaitBus {
  on(event: string, handler: (payload: any) => void): unknown;
  emit(event: string, payload: unknown): void;
}

export interface DelegationWaitEventNames {
  request: string;
  response: string;
  started?: string;
  update?: string;
  cancel?: string;
}

export interface DelegationWaitIdentity {
  requestId: string;
  ownerRunId: string;
  nodeId: string;
}

/**
 * Early, distinct-from-terminal acknowledgement that the bridge accepted the
 * delegation attempt. Fired once, at the first of {started, update with
 * runId, terminal response}. The object is live: `runId` is filled in when
 * the bridge first reports it, so consumers that hold the reference observe
 * the runId as soon as it exists without needing a second callback.
 */
export interface LaunchedAck {
  requestId: string;
  ownerRunId: string;
  nodeId: string;
  runId?: string;
  /** Ask the bridge to abort the child attempt (no-op on bridges without the cancel event). */
  cancel: () => void;
}

export interface DelegationWaitSuccess {
  runId: string;
  launchContractDigest?: string;
  output?: string;
  warnings?: string[];
  executionStatus?: "completed";
}

/** Tail length kept for `recentOutput` in progress-timeout evidence. */
const PROGRESS_OUTPUT_TAIL_CHARS = 2_000;

/**
 * Evidence from the most recent delegation update, attached to
 * progress-timeout errors so callers can diagnose a stalled child.
 */
export interface DelegationProgressSnapshot {
  currentTool?: string;
  recentOutput?: string;
  toolCount?: number;
  tokens?: number;
  /** Milliseconds between the last progress event and the bound firing. */
  ageMs: number;
}

function enrichedError(message: string, identity: DelegationWaitIdentity, extra: Record<string, unknown>): Error {
  const error = new Error(message);
  Object.assign(error, { ...identity, ...extra });
  return error;
}

export function waitForDelegationResponse(options: {
  bus: DelegationWaitBus;
  eventNames: DelegationWaitEventNames;
  identity: DelegationWaitIdentity;
  delegationRequest: Record<string, unknown>;
  expectedLaunchContractDigest?: string;
  verificationPolicy?: "advisory" | "strict";
  waitMs: number;
  /** Fast-fail bound for the bridge acceptance ack (the first matching started/update event). Ignored on bridges without the update event. */
  ackTimeoutMs?: number;
  /** Sliding no-progress bound re-armed by every matching started/update event. Ignored on bridges without the update event. */
  progressTimeoutMs?: number;
  onLaunched?: (ack: LaunchedAck) => void;
}): Promise<DelegationWaitSuccess> {
  const { bus, eventNames, identity, delegationRequest, expectedLaunchContractDigest, verificationPolicy = "strict", waitMs, ackTimeoutMs, progressTimeoutMs, onLaunched } = options;
  const { requestId, ownerRunId, nodeId } = identity;
  // Older bridges cannot report progress: without the update event neither
  // new bound arms, preserving the historical cap-only behavior so a bridge
  // that cannot signal progress is never fast-failed.
  const progressSupported = typeof eventNames.update === "string" && eventNames.update.length > 0;
  const ackBoundMs = progressSupported && typeof ackTimeoutMs === "number" && Number.isFinite(ackTimeoutMs) ? ackTimeoutMs : undefined;
  const progressBoundMs = progressSupported && typeof progressTimeoutMs === "number" && Number.isFinite(progressTimeoutMs) ? progressTimeoutMs : undefined;
  return new Promise<DelegationWaitSuccess>((resolve, reject) => {
    let settled = false;
    let capTimer: ReturnType<typeof setTimeout> | undefined;
    let ackTimer: ReturnType<typeof setTimeout> | undefined;
    let progressTimer: ReturnType<typeof setTimeout> | undefined;
    let launchedNotified = false;
    let capturedRunId: string | undefined;
    let lastSignalAt = 0;
    let lastActivity: Omit<DelegationProgressSnapshot, "ageMs"> | undefined;
    const unsubscribes: Array<() => void> = [];
    const ack: LaunchedAck = {
      requestId,
      ownerRunId,
      nodeId,
      cancel: emitCancel,
    };

    const matches = (payload: any): boolean =>
      Boolean(payload) && typeof payload === "object" &&
      payload.requestId === requestId && payload.ownerRunId === ownerRunId && payload.nodeId === nodeId;

    const notifyLaunched = (): void => {
      if (launchedNotified || !onLaunched) return;
      launchedNotified = true;
      try {
        onLaunched(ack);
      } catch {
        // Ack consumers must not fail the delegation itself.
      }
    };

    function emitCancel(): void {
      if (typeof eventNames.cancel !== "string") return;
      try {
        // Bridges ignore cancels for already-settled attempts, so this is safe
        // to call speculatively on timeout.
        bus.emit(eventNames.cancel, { requestId, ownerRunId, nodeId });
      } catch {
        // A cancel emission failure must not mask the original outcome.
      }
    }

    const watch = (event: string | undefined, handler: (payload: any) => void): void => {
      if (typeof event !== "string" || event.length === 0) return;
      const unsubscribe = bus.on(event, handler);
      if (typeof unsubscribe === "function") unsubscribes.push(unsubscribe as () => void);
    };
    const unwatchAll = (): void => {
      for (const unsubscribe of unsubscribes) unsubscribe();
      unsubscribes.length = 0;
    };

    const runIdTail = (): string =>
      capturedRunId ? ` (child runId ${capturedRunId}; cancellation requested)` : " (child had not reported a runId yet)";
    const clearWaitTimers = (): void => {
      if (capTimer) clearTimeout(capTimer);
      if (ackTimer) clearTimeout(ackTimer);
      if (progressTimer) clearTimeout(progressTimer);
    };
    const giveUp = (error: Error): void => {
      settled = true;
      clearWaitTimers();
      unwatchAll();
      emitCancel();
      reject(error);
    };
    const armProgressTimer = (boundMs: number): void => {
      if (progressTimer) clearTimeout(progressTimer);
      progressTimer = setTimeout(() => {
        if (settled) return;
        const lastActivitySnapshot: DelegationProgressSnapshot | undefined = lastActivity
          ? { ...lastActivity, ageMs: Date.now() - lastSignalAt }
          : undefined;
        giveUp(enrichedError(`no progress from pi-subagents delegation for ${boundMs}ms${runIdTail()}`, identity, {
          progressTimeoutMs: boundMs,
          status: "progress_timeout",
          cancelled: true,
          ...(capturedRunId ? { runId: capturedRunId } : {}),
          ...(lastActivitySnapshot ? { lastActivity: lastActivitySnapshot } : {}),
        }));
      }, boundMs);
    };
    // Every matching started/update event is a liveness signal: it clears
    // the ack bound and re-arms the sliding no-progress bound.
    const recordProgressSignal = (): void => {
      lastSignalAt = Date.now();
      if (ackTimer) {
        clearTimeout(ackTimer);
        ackTimer = undefined;
      }
      if (progressBoundMs !== undefined) armProgressTimer(progressBoundMs);
    };

    watch(eventNames.started, (payload) => {
      if (settled) return;
      if (matches(payload)) {
        recordProgressSignal();
        notifyLaunched();
      }
    });
    watch(eventNames.update, (payload) => {
      if (settled || !matches(payload)) return;
      recordProgressSignal();
      if (typeof payload?.runId === "string" && payload.runId) {
        capturedRunId = payload.runId;
        ack.runId = payload.runId;
        notifyLaunched();
      }
      lastActivity = {
        ...(typeof payload?.currentTool === "string" && payload.currentTool ? { currentTool: payload.currentTool } : {}),
        ...(typeof payload?.recentOutput === "string" && payload.recentOutput
          ? { recentOutput: payload.recentOutput.slice(-PROGRESS_OUTPUT_TAIL_CHARS) }
          : {}),
        ...(typeof payload?.toolCount === "number" ? { toolCount: payload.toolCount } : {}),
        ...(typeof payload?.tokens === "number" ? { tokens: payload.tokens } : {}),
      };
    });
    watch(eventNames.response, (payload) => {
      const response = payload as {
        requestId?: string;
        ownerRunId?: string;
        nodeId?: string;
        status?: string;
        error?: string;
        runId?: string;
        launchContractDigest?: string;
        result?: { kind?: string; text?: string; value?: unknown };
      };
      // invalid_request terminals may omit ownerRunId/nodeId when the bridge
      // could not parse the full identity; they are still ours by requestId.
      const invalidRequest = payload && typeof payload === "object" &&
        (payload as { requestId?: unknown }).requestId === requestId &&
        (payload as { status?: unknown }).status === "invalid_request";
      if (!invalidRequest && !matches(response)) return;
      if (settled) return;
      settled = true;
      clearWaitTimers();
      unwatchAll();
      notifyLaunched();
      if (invalidRequest) {
        reject(enrichedError(`pi-subagents delegation invalid_request: ${response.error ?? "request rejected by the bridge"}`, identity, { status: "invalid_request" }));
        return;
      }
      if (response.status !== "completed") {
        reject(enrichedError(`pi-subagents delegation ${response.status ?? "failed"}: ${response.error ?? "no terminal response"}`, identity, {
          status: response.status,
          ...(response.runId ? { runId: response.runId } : {}),
        }));
        return;
      }
      if (typeof response.runId !== "string" || !response.runId.trim()) {
        reject(enrichedError("pi-subagents delegation completed without a child run ID", identity, { status: "completed" }));
        return;
      }
      const warnings: string[] = [];
      if (!expectedLaunchContractDigest) warnings.push("preflight launchContractDigest evidence is missing; execution completed but is unverified");
      if (!response.launchContractDigest) warnings.push("launchContractDigest evidence is missing; execution completed but is unverified");
      else if (response.launchContractDigest !== expectedLaunchContractDigest) warnings.push("launchContractDigest does not match the immutable preflight contract; execution completed but is unverified");
      if (warnings.length > 0 && verificationPolicy === "strict") {
        reject(enrichedError(warnings[0]!, identity, { status: "completed", runId: response.runId }));
        return;
      }
      const output = response.result?.kind === "text" ? response.result.text : response.result?.value === undefined ? undefined : JSON.stringify(response.result.value);
      resolve({
        runId: response.runId,
        executionStatus: "completed",
        ...(response.launchContractDigest ? { launchContractDigest: response.launchContractDigest } : {}),
        ...(output !== undefined ? { output } : {}),
        ...(warnings.length > 0 ? { warnings } : {}),
      });
    });

    lastSignalAt = Date.now();
    if (progressBoundMs !== undefined) armProgressTimer(progressBoundMs);
    if (ackBoundMs !== undefined) {
      const bound = ackBoundMs;
      ackTimer = setTimeout(() => {
        if (settled) return;
        giveUp(enrichedError(
          `pi-subagents delegation was not acknowledged within ${bound}ms (ack bound): the launch never started, so retrying with the same runKey is safe`,
          identity,
          { ackTimeoutMs: bound, status: "ack_timeout", cancelled: true },
        ));
      }, bound);
    }
    capTimer = setTimeout(() => {
      if (settled) return;
      // The cap is the only non-sliding clock: when it expires while the
      // child was still reporting progress inside the no-progress bound,
      // say so explicitly instead of blaming a stall.
      const childProgressing = progressBoundMs !== undefined && lastSignalAt > 0 && Date.now() - lastSignalAt < progressBoundMs;
      giveUp(enrichedError(
        childProgressing
          ? `timed out waiting for pi-subagents delegation response after ${waitMs}ms: overall cap reached while the child was still making progress${runIdTail()}`
          : `timed out waiting for pi-subagents delegation response after ${waitMs}ms${runIdTail()}`,
        identity,
        {
          timeoutMs: waitMs,
          status: "timeout",
          cancelled: true,
          ...(capturedRunId ? { runId: capturedRunId } : {}),
        },
      ));
    }, waitMs);

    try {
      bus.emit(eventNames.request, delegationRequest);
    } catch (error) {
      clearWaitTimers();
      unwatchAll();
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
