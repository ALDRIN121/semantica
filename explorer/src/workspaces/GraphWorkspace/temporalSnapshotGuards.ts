/**
 * Guards for the temporal snapshot fetch/apply lifecycle.
 *
 * The snapshot effect previously fetched /api/temporal/snapshot with no
 * idempotency or ordering protection. Upstream re-render churn (timeline
 * recreation when bounds settle, play ticks resetting the playhead, drag
 * events, bounds refetch) could re-request the same `at` repeatedly, and
 * out-of-order responses could overwrite a newer active-node count with an
 * older one (chip lagging the scrubber).
 *
 * `createTemporalSnapshotGuards()` is stateful by design: it tracks which
 * timestamps have been requested and the request/apply sequence so the
 * caller gets one request per scrubber position and latest-wins application.
 */

export interface TemporalSnapshotGuards {
  /** True when a snapshot for `atMs` has already been requested; skip the fetch. */
  shouldRequest(atMs: number): boolean;
  /** Record that a request for `atMs` is starting; returns the request sequence. */
  begin(atMs: number): number;
  /** True when the response for `atMs`/`seq` is the latest request and may be applied. */
  shouldApply(atMs: number, seq: number): boolean;
  /** Record that the response `seq` has been applied. */
  apply(seq: number): void;
}

export function createTemporalSnapshotGuards(): TemporalSnapshotGuards {
  const requestedAtMs = new Set<number>();
  let latestRequestSeq = 0;
  let latestRequestAtMs: number | null = null;
  let lastAppliedSeq = 0;

  return {
    shouldRequest(atMs: number): boolean {
      return requestedAtMs.has(atMs);
    },

    begin(atMs: number): number {
      requestedAtMs.add(atMs);
      latestRequestSeq += 1;
      latestRequestAtMs = atMs;
      return latestRequestSeq;
    },

    shouldApply(atMs: number, seq: number): boolean {
      if (seq > latestRequestSeq) return false;
      if (atMs !== latestRequestAtMs) return false;
      return seq > lastAppliedSeq;
    },

    apply(seq: number): void {
      lastAppliedSeq = seq;
    },
  };
}
