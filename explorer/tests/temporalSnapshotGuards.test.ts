import test from "node:test";
import assert from "node:assert/strict";

import { createTemporalSnapshotGuards } from "../src/workspaces/GraphWorkspace/temporalSnapshotGuards.ts";

const POSITION_1 = new Date("2023-07-02T00:00:00Z").getTime();
const POSITION_2 = new Date("2024-01-02T00:00:00Z").getTime();
const POSITION_3 = new Date("2024-07-02T00:00:00Z").getTime();

// ── shouldRequest: one request per scrubber position ─────────────────────────

test("shouldRequest: false for a never-requested position", () => {
  const guards = createTemporalSnapshotGuards();
  assert.equal(guards.shouldRequest(POSITION_1), false);
});

test("shouldRequest: true once that position has been requested", () => {
  const guards = createTemporalSnapshotGuards();
  guards.begin(POSITION_1);
  assert.equal(guards.shouldRequest(POSITION_1), true);
});

test("shouldRequest: distinct positions are requested independently", () => {
  const guards = createTemporalSnapshotGuards();
  guards.begin(POSITION_1);
  assert.equal(guards.shouldRequest(POSITION_1), true);
  assert.equal(guards.shouldRequest(POSITION_2), false);
});

test("shouldRequest: returning to an earlier position does not re-request (play wrap-around)", () => {
  const guards = createTemporalSnapshotGuards();
  guards.begin(POSITION_1);
  guards.begin(POSITION_2);
  guards.begin(POSITION_3);
  // Play mode wraps back to the min bound; that position was already fetched.
  assert.equal(guards.shouldRequest(POSITION_1), true);
});

// ── begin: monotonically increasing request sequence ─────────────────────────

test("begin: returns an incrementing sequence per request", () => {
  const guards = createTemporalSnapshotGuards();
  assert.equal(guards.begin(POSITION_1), 1);
  assert.equal(guards.begin(POSITION_2), 2);
  assert.equal(guards.begin(POSITION_3), 3);
});

// ── shouldApply: latest-wins ordering guard (chip lag fix) ───────────────────

test("shouldApply: the first response for a position is applied", () => {
  const guards = createTemporalSnapshotGuards();
  const seq = guards.begin(POSITION_1);
  assert.equal(guards.shouldApply(POSITION_1, seq), true);
});

test("shouldApply: a response for an older request is discarded when a newer request exists", () => {
  const guards = createTemporalSnapshotGuards();
  const seq1 = guards.begin(POSITION_1);
  const seq2 = guards.begin(POSITION_2);
  // The slow POSITION_1 response lands after POSITION_2 was requested.
  assert.equal(guards.shouldApply(POSITION_1, seq1), false);
  assert.equal(guards.shouldApply(POSITION_2, seq2), true);
});

test("shouldApply: the same response is never applied twice", () => {
  const guards = createTemporalSnapshotGuards();
  const seq = guards.begin(POSITION_1);
  guards.apply(seq);
  assert.equal(guards.shouldApply(POSITION_1, seq), false);
});

test("shouldApply: full out-of-order sequence keeps only the newest response", () => {
  const guards = createTemporalSnapshotGuards();
  const seq1 = guards.begin(POSITION_1);
  const seq2 = guards.begin(POSITION_2);
  const seq3 = guards.begin(POSITION_3);
  // Responses arrive out of order: POSITION_1 (slowest) first, POSITION_3 last.
  assert.equal(guards.shouldApply(POSITION_1, seq1), false, "stale response must be dropped");
  assert.equal(guards.shouldApply(POSITION_3, seq3), true, "newest response must apply");
  guards.apply(seq3);
  assert.equal(guards.shouldApply(POSITION_2, seq2), false, "late middle response must be dropped");
});

test("shouldApply: a response for an unknown sequence is discarded", () => {
  const guards = createTemporalSnapshotGuards();
  guards.begin(POSITION_1);
  assert.equal(guards.shouldApply(POSITION_1, 99), false);
});
