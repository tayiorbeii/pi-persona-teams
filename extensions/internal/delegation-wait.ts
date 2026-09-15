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
  launchContractDigest: string;
  output?: string;
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
  expectedLaunchContractDigest: string;
  waitMs: number;
  onLaunched?: (ack: LaunchedAck) => void;
}): Promise<DelegationWaitSuccess> {
  const { bus, eventNames, identity, delegationRequest, expectedLaunchContractDigest, waitMs, onLaunched } = options;
  const { requestId, ownerRunId, nodeId } = identity;
  return new Promise<DelegationWaitSuccess>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let launchedNotified = false;
    let capturedRunId: string | undefined;
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

    watch(eventNames.started, (payload) => {
      if (settled) return;
      if (matches(payload)) notifyLaunched();
    });
    watch(eventNames.update, (payload) => {
      if (settled || !matches(payload)) return;
      if (typeof payload?.runId === "string" && payload.runId) {
        capturedRunId = payload.runId;
        ack.runId = payload.runId;
        notifyLaunched();
      }
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
      if (timer) clearTimeout(timer);
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
      if (!response.runId) {
        reject(enrichedError("pi-subagents delegation completed without a child run ID", identity, { status: "completed" }));
        return;
      }
      if (!response.launchContractDigest) {
        reject(enrichedError("pi-subagents delegation completed without launchContractDigest evidence", identity, { status: "completed", runId: response.runId }));
        return;
      }
      if (response.launchContractDigest !== expectedLaunchContractDigest) {
        reject(enrichedError("pi-subagents delegation launchContractDigest does not match the immutable preflight contract", identity, { status: "completed", runId: response.runId }));
        return;
      }
      const output = response.result?.kind === "text" ? response.result.text : response.result?.value === undefined ? undefined : JSON.stringify(response.result.value);
      resolve({
        runId: response.runId,
        launchContractDigest: response.launchContractDigest,
        ...(output !== undefined ? { output } : {}),
      });
    });

    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      unwatchAll();
      emitCancel();
      const runIdSuffix = capturedRunId ? ` (child runId ${capturedRunId}; cancellation requested)` : " (child had not reported a runId yet)";
      reject(enrichedError(`timed out waiting for pi-subagents delegation response after ${waitMs}ms${runIdSuffix}`, identity, {
        timeoutMs: waitMs,
        cancelled: true,
        ...(capturedRunId ? { runId: capturedRunId } : {}),
      }));
    }, waitMs);

    try {
      bus.emit(eventNames.request, delegationRequest);
    } catch (error) {
      if (timer) clearTimeout(timer);
      unwatchAll();
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
