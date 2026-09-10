import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createStore } from "../server/store.js";
import { createApi } from "../server/api.js";

const report = {
  category: "queue",
  title: "Coffee queue",
  location: "Market Street",
  description: "",
  lat: 37.77,
  lng: -122.42,
  severity: 2,
};

async function fixture(t) {
  const store = createStore(":memory:", false);
  const app = express();
  app.use("/api", createApi(store));
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    request: (path, body, headers = {}) =>
      fetch(base + "/api" + path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Visitor-Id": "test-visitor-0001",
          ...headers,
        },
        body: JSON.stringify(body),
      }),
  };
}

test("trends on an empty database has zeroed days and null average", async (t) => {
  const { base } = await fixture(t);
  const trends = await (await fetch(base + "/api/trends")).json();
  assert.equal(trends.days.length, 14);
  for (const day of trends.days) {
    assert.match(day.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(day.queue, 0);
    assert.equal(day.noise, 0);
  }
  assert.equal(trends.avgResolutionMinutes, null);
  assert.deepEqual(trends.totals, {
    active: 0,
    resolved: 0,
    notes: 0,
    confirmations: 0,
  });
});

test("trends counts reports, notes, and resolution times", async (t) => {
  const { base, request } = await fixture(t);
  const first = await (
    await request("/reports", report, { "X-Visitor-Id": "trend-visitor-01" })
  ).json();
  await request(
    "/reports",
    { ...report, lat: 37.775, title: "Bike dock empty", category: "bikes" },
    { "X-Visitor-Id": "trend-visitor-02" },
  );
  await request(
    `/reports/${first.report.id}/comments`,
    { body: "still here" },
    { "X-Visitor-Id": "trend-visitor-03" },
  );
  for (const visitor of ["trend-visitor-04", "trend-visitor-05"])
    await request(
      `/reports/${first.report.id}/vote`,
      { action: "clear" },
      { "X-Visitor-Id": visitor },
    );

  const trends = await (await fetch(base + "/api/trends")).json();
  const today = trends.days[trends.days.length - 1];
  assert.equal(today.queue, 1);
  assert.equal(today.bikes, 1);
  assert.ok(trends.avgResolutionMinutes >= 0);
  assert.equal(trends.totals.active, 1);
  assert.equal(trends.totals.resolved, 1);
  assert.equal(trends.totals.notes, 1);
  assert.ok(trends.totals.confirmations >= 2);
});
