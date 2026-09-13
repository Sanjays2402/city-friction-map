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

test("HTTP creation, merging, conflicts and missing reports use meaningful statuses", async (t) => {
  const { base, request } = await fixture(t);
  const created = await request("/reports", report);
  assert.equal(created.status, 201);
  const { report: saved } = await created.json();
  assert.equal(
    (await request("/reports", report, { "X-Visitor-Id": "test-visitor-0002" }))
      .status,
    200,
  );
  assert.equal(
    (await request(`/reports/${saved.id}/vote`, { action: "confirm" })).status,
    409,
  );
  assert.equal(
    (await request("/reports/missing/vote", { action: "confirm" })).status,
    404,
  );
  const list = await fetch(base + "/api/reports");
  assert.equal(list.headers.get("cache-control"), "no-store");
  assert.equal((await list.json()).length, 1);
});

test("HTTP rejects invalid bodies, missing identities and cross-origin writes", async (t) => {
  const { base, request } = await fixture(t);
  assert.equal(
    (await request("/reports", report, { "X-Visitor-Id": "" })).status,
    400,
  );
  assert.equal(
    (await request("/reports", report, { Origin: "https://foreign.example" }))
      .status,
    403,
  );
  assert.equal(
    (await request("/reports", report, { Origin: "null" })).status,
    403,
  );
  assert.equal((await request("/reports", { ...report, lat: 0 })).status, 400);
  assert.equal(
    (await request("/reports", report, { "Content-Type": "text/plain" }))
      .status,
    415,
  );
  assert.equal(
    (await request("/reports", { ...report, description: "a".repeat(9000) }))
      .status,
    400,
  );
  assert.equal(
    (
      await request("/reports", {
        ...report,
        photo: "data:image/jpeg;base64," + "a".repeat(500 * 1024),
      })
    ).status,
    413,
  );
  const malformed = await fetch(base + "/api/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });
  assert.equal(malformed.status, 400);
  assert.equal(
    (await malformed.json()).error,
    "Request body must be valid JSON.",
  );
  const accepted = await request("/reports", report, { Origin: base });
  assert.equal(accepted.status, 201);
});

test("comments are listed per report and reject bad input", async (t) => {
  const { base, request } = await fixture(t);
  const created = await request("/reports", report);
  const { report: saved } = await created.json();
  assert.equal(saved.commentCount, 0);

  const missing = await request("/reports/does-not-exist/comments", {
    body: "hello",
  });
  assert.equal(missing.status, 404);

  for (const body of [
    { body: "" },
    { body: "   " },
    { body: "x".repeat(301) },
  ]) {
    const bad = await request(`/reports/${saved.id}/comments`, body);
    assert.equal(bad.status, 400);
  }

  const posted = await request(`/reports/${saved.id}/comments`, {
    body: "Still queued at noon",
  });
  assert.equal(posted.status, 201);
  const comment = await posted.json();
  assert.equal(comment.body, "Still queued at noon");
  assert.match(comment.author, /^Neighbor /);
  assert.ok(!JSON.stringify(comment).includes("test-visitor-0001"));

  const listed = await fetch(base + `/api/reports/${saved.id}/comments`);
  assert.equal(listed.status, 200);
  assert.equal((await listed.json()).length, 1);

  const reports = await (await fetch(base + "/api/reports")).json();
  assert.equal(reports[0].commentCount, 1);

  const missingList = await fetch(
    base + "/api/reports/does-not-exist/comments",
  );
  assert.equal(missingList.status, 404);
});

test("reports accept an optional photo URL", async (t) => {
  const { base, request } = await fixture(t);
  const withPhoto = await request("/reports", {
    ...report,
    photoUrl: "https://example.com/obstacle.jpg",
  });
  assert.equal(withPhoto.status, 201);
  assert.equal(
    (await withPhoto.json()).report.photoUrl,
    "https://example.com/obstacle.jpg",
  );
  const badPhoto = await request("/reports", {
    ...report,
    lat: 37.781,
    photoUrl: "javascript:alert(1)",
  });
  assert.equal(badPhoto.status, 400);
});
