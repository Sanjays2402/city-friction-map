import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isOnline,
  onOnline,
  pendingCount,
  pendingReports,
  queueReport,
  removeReport,
  syncPending,
} from "../src/offline.js";

async function drain() {
  const reports = await pendingReports();
  for (const report of reports) {
    await removeReport(report.id);
  }
}

test("queueReport adds reports and pendingReports/pendingCount reflect them", async () => {
  await drain();
  const idA = await queueReport({ type: "pothole", lat: 37.77 });
  const idB = await queueReport({ type: "graffiti", lat: 37.78 });

  assert.equal(typeof idA, "number");
  assert.equal(typeof idB, "number");
  assert.notEqual(idA, idB);
  assert.equal(await pendingCount(), 2);

  const pending = await pendingReports();
  assert.equal(pending.length, 2);
  assert.equal(pending[0].id, idA);
  assert.equal(pending[1].id, idB);
  assert.deepEqual(pending[0].data, { type: "pothole", lat: 37.77 });
  assert.deepEqual(pending[1].data, { type: "graffiti", lat: 37.78 });
  assert.equal(typeof pending[0].queuedAt, "number");

  await drain();
});

test("syncPending posts oldest-first and clears the queue", async () => {
  await drain();
  await queueReport({ n: 1 });
  await queueReport({ n: 2 });
  await queueReport({ n: 3 });

  const posted = [];
  const result = await syncPending(async (data) => {
    posted.push(data);
  });

  assert.deepEqual(posted, [{ n: 1 }, { n: 2 }, { n: 3 }]);
  assert.deepEqual(result, { synced: 3, failed: 0, remaining: 0 });
  assert.equal(await pendingCount(), 0);

  await drain();
});

test("a failing postFn stops the sync and keeps the remaining items", async () => {
  await drain();
  await queueReport({ n: 1 });
  await queueReport({ n: 2 });
  await queueReport({ n: 3 });

  const posted = [];
  const result = await syncPending(async (data) => {
    if (data.n === 2) throw new Error("network down");
    posted.push(data);
  });

  assert.deepEqual(posted, [{ n: 1 }]);
  assert.deepEqual(result, { synced: 1, failed: 1, remaining: 2 });
  assert.equal(await pendingCount(), 2);

  const pending = await pendingReports();
  assert.deepEqual(
    pending.map((report) => report.data),
    [{ n: 2 }, { n: 3 }],
  );

  await drain();
});

test("removeReport removes only the given id", async () => {
  await drain();
  const idA = await queueReport({ n: "a" });
  const idB = await queueReport({ n: "b" });

  await removeReport(idA);
  assert.equal(await pendingCount(), 1);
  const pending = await pendingReports();
  assert.equal(pending[0].id, idB);
  assert.deepEqual(pending[0].data, { n: "b" });

  await removeReport(idB);
  assert.equal(await pendingCount(), 0);
  await removeReport(999999); // unknown id is a no-op
  assert.equal(await pendingCount(), 0);

  await drain();
});

test("onOnline and isOnline are safe no-ops in node", () => {
  assert.equal(isOnline(), true);
  const unsubscribe = onOnline(() => {});
  assert.equal(typeof unsubscribe, "function");
  unsubscribe(); // must not throw
});
