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

async function fixture(t, options = {}) {
  const store = createStore(":memory:", false);
  const app = express();
  app.use("/api", createApi(store, options));
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
    store,
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

async function createReport(request, visitor, lat = 37.77) {
  const res = await request(
    "/reports",
    { ...report, lat },
    { "X-Visitor-Id": visitor },
  );
  assert.equal(res.status, 201);
  return (await res.json()).report;
}

test("flagging hides a report after three distinct visitors", async (t) => {
  const { base, request } = await fixture(t);
  const saved = await createReport(request, "flag-visitor-01");

  const first = await request(
    `/reports/${saved.id}/flag`,
    { reason: "spam" },
    { "X-Visitor-Id": "flag-visitor-01" },
  );
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), {
    id: saved.id,
    flagCount: 1,
    hidden: false,
  });

  const repeat = await request(
    `/reports/${saved.id}/flag`,
    { reason: "spam" },
    { "X-Visitor-Id": "flag-visitor-01" },
  );
  assert.equal(repeat.status, 409);

  for (const visitor of ["flag-visitor-02", "flag-visitor-03"]) {
    const res = await request(
      `/reports/${saved.id}/flag`,
      { reason: "inaccurate" },
      { "X-Visitor-Id": visitor },
    );
    assert.equal(res.status, 200);
  }
  const third = await (await fetch(base + `/api/reports/${saved.id}`)).json();
  assert.equal(third.hidden, true);
  assert.equal(third.flagCount, 3);

  const listed = await (await fetch(base + "/api/reports")).json();
  const listedReport = listed.find((r) => r.id === saved.id);
  assert.equal(listedReport.hidden, true);
  assert.equal(listedReport.flagCount, 3);

  const vote = await request(
    `/reports/${saved.id}/vote`,
    { action: "confirm" },
    { "X-Visitor-Id": "flag-visitor-04" },
  );
  assert.equal(vote.status, 409);
  const note = await request(
    `/reports/${saved.id}/comments`,
    { body: "hello" },
    { "X-Visitor-Id": "flag-visitor-04" },
  );
  assert.equal(note.status, 409);
});

test("flagging validates the reason and the report", async (t) => {
  const { request } = await fixture(t);
  const saved = await createReport(request, "flag-visitor-01");
  assert.equal(
    (await request(`/reports/${saved.id}/flag`, { reason: "bogus" })).status,
    400,
  );
  assert.equal((await request(`/reports/${saved.id}/flag`, {})).status, 400);
  assert.equal(
    (await request("/reports/missing/flag", { reason: "spam" })).status,
    404,
  );
});

test("single reports are fetchable by id, including hidden ones", async (t) => {
  const { base, request } = await fixture(t);
  const saved = await createReport(request, "flag-visitor-01");
  const fetched = await (await fetch(base + `/api/reports/${saved.id}`)).json();
  assert.equal(fetched.id, saved.id);
  assert.equal(fetched.hidden, false);
  assert.equal(fetched.flagCount, 0);
  assert.ok(fetched.prediction);
  assert.equal((await fetch(base + "/api/reports/does-not-exist")).status, 404);
});

test("moderation requires the admin token", async (t) => {
  const { request } = await fixture(t);
  const saved = await createReport(request, "flag-visitor-01");
  assert.equal(
    (await request(`/reports/${saved.id}/moderate`, { action: "hide" })).status,
    403,
  );
  assert.equal(
    (
      await request(
        `/reports/${saved.id}/moderate`,
        { action: "hide" },
        { "X-Admin-Token": "wrong" },
      )
    ).status,
    403,
  );
});

test("moderation can hide, restore, and reject bad actions", async (t) => {
  const { base, request } = await fixture(t, { adminToken: "secret-admin" });
  const saved = await createReport(request, "flag-visitor-01");
  const admin = { "X-Admin-Token": "secret-admin" };

  const hide = await request(
    `/reports/${saved.id}/moderate`,
    { action: "hide" },
    admin,
  );
  assert.equal(hide.status, 200);
  assert.equal((await hide.json()).hidden, true);

  const restore = await request(
    `/reports/${saved.id}/moderate`,
    { action: "restore" },
    admin,
  );
  assert.equal(restore.status, 200);
  assert.equal((await restore.json()).hidden, false);

  assert.equal(
    (await request(`/reports/${saved.id}/moderate`, { action: "nuke" }, admin))
      .status,
    400,
  );
  assert.equal(
    (await request("/reports/missing/moderate", { action: "hide" }, admin))
      .status,
    404,
  );
  assert.equal(
    (await (await fetch(base + `/api/reports/${saved.id}`)).json()).hidden,
    false,
  );
});

test("moderation delete removes the report and its data", async (t) => {
  const { base, request } = await fixture(t, { adminToken: "secret-admin" });
  const saved = await createReport(request, "flag-visitor-01");
  const admin = { "X-Admin-Token": "secret-admin" };
  await request(
    `/reports/${saved.id}/vote`,
    { action: "confirm" },
    { "X-Visitor-Id": "flag-visitor-02" },
  );
  await request(
    `/reports/${saved.id}/comments`,
    { body: "a note" },
    { "X-Visitor-Id": "flag-visitor-02" },
  );
  await request(
    `/reports/${saved.id}/flag`,
    { reason: "spam" },
    { "X-Visitor-Id": "flag-visitor-03" },
  );
  const deleted = await request(
    `/reports/${saved.id}/moderate`,
    { action: "delete" },
    admin,
  );
  assert.equal(deleted.status, 200);
  assert.deepEqual(await deleted.json(), { id: saved.id, deleted: true });
  assert.equal((await fetch(base + `/api/reports/${saved.id}`)).status, 404);
  assert.equal((await (await fetch(base + "/api/reports")).json()).length, 0);
});

test("rate limiting rejects excessive writes with JSON", async (t) => {
  const { request } = await fixture(t, {
    writeLimit: { windowMs: 60000, limit: 2 },
  });
  const headers = { "X-Visitor-Id": "limited-visitor" };
  assert.equal(
    (await request("/reports/missing/flag", { reason: "spam" }, headers))
      .status,
    404,
  );
  assert.equal(
    (await request("/reports/missing/flag", { reason: "spam" }, headers))
      .status,
    404,
  );
  const limited = await request(
    "/reports/missing/flag",
    { reason: "spam" },
    headers,
  );
  assert.equal(limited.status, 429);
  assert.match((await limited.json()).error, /too many/i);
  const other = await request(
    "/reports/missing/flag",
    { reason: "spam" },
    { "X-Visitor-Id": "other-visitor" },
  );
  assert.equal(other.status, 404);
});
