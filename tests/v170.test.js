import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createStore } from "../server/store.js";
import { createApi } from "../server/api.js";

const report = {
  category: "queue",
  title: "Coffee queue",
  location: "Market Street",
  description: "Long line this morning.",
  lat: 37.77,
  lng: -122.42,
  severity: 2,
};

const ADMIN = "v170-admin-token";

async function fixture(t, options = {}) {
  const store = createStore(":memory:", false);
  const app = express();
  app.use("/api", createApi(store, { adminToken: ADMIN, ...options }));
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let n = 0;
  const vid = () => `v170-visitor-${++n}-${Date.now()}`;
  const headersFor = (visitor, admin = false) => ({
    "Content-Type": "application/json",
    "X-Visitor-Id": visitor,
    ...(admin ? { "X-Admin-Token": ADMIN } : {}),
  });
  const post = (path, body, visitor = vid(), admin = false) =>
    fetch(base + path, {
      method: "POST",
      headers: headersFor(visitor, admin),
      body: JSON.stringify(body),
    });
  const patch = (path, body, visitor = vid(), admin = false) =>
    fetch(base + path, {
      method: "PATCH",
      headers: headersFor(visitor, admin),
      body: JSON.stringify(body),
    });
  const get = (path, visitor = vid()) =>
    fetch(base + path, { headers: { "X-Visitor-Id": visitor } });
  const adminGet = (path) =>
    fetch(base + path, {
      headers: { "X-Visitor-Id": vid(), "X-Admin-Token": ADMIN },
    });
  return { store, post, patch, get, adminGet, vid, base };
}

let reportOffset = 0;
async function createReport(post, visitor, overrides = {}) {
  // Keep fixtures >90m apart so auto-merge doesn't fold them together.
  reportOffset += 1;
  const res = await post(
    "/reports",
    {
      ...report,
      lat: report.lat + reportOffset * 0.002,
      lng: report.lng + reportOffset * 0.002,
      ...overrides,
    },
    visitor,
  );
  assert.equal(res.status, 201);
  return (await res.json()).report;
}

// ---- Author resolve with a note ----

test("resolve: author resolves with a note; confirmers are notified", async (t) => {
  const { post, get, vid, store } = await fixture(t);
  const author = vid(),
    confirmer = vid();
  const saved = await createReport(post, author);
  const vote = await post(
    `/reports/${saved.id}/vote`,
    { action: "confirm" },
    confirmer,
  );
  assert.equal(vote.status, 200);
  const res = await post(
    `/reports/${saved.id}/resolve`,
    { note: "The elevator is back in service." },
    author,
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, "resolved");
  assert.equal(body.resolvedNote, "The elevator is back in service.");
  assert.ok(body.resolvedAt > 0);
  const detail = await (await get(`/reports/${saved.id}`)).json();
  assert.equal(detail.status, "resolved");
  assert.equal(detail.resolvedNote, "The elevator is back in service.");
  const notes = store.listNotifications(confirmer);
  assert.ok(
    notes.items.some((n) => n.type === "resolved" && n.reportId === saved.id),
    "confirmer should be notified",
  );
  // The author doesn't notify themselves.
  assert.equal(
    store.listNotifications(author).items.filter((n) => n.type === "resolved")
      .length,
    0,
  );
});

test("resolve: non-author is rejected; admin may resolve", async (t) => {
  const { post, vid } = await fixture(t);
  const author = vid(),
    stranger = vid();
  const saved = await createReport(post, author);
  const denied = await post(`/reports/${saved.id}/resolve`, {}, stranger);
  assert.equal(denied.status, 403);
  const admin = await post(
    `/reports/${saved.id}/resolve`,
    { note: "" },
    vid(),
    true,
  );
  assert.equal(admin.status, 200);
  assert.equal((await admin.json()).status, "resolved");
});

test("resolve: already-resolved and overlong notes are rejected", async (t) => {
  const { post, vid } = await fixture(t);
  const author = vid();
  const saved = await createReport(post, author);
  const first = await post(`/reports/${saved.id}/resolve`, {}, author);
  assert.equal(first.status, 200);
  const again = await post(`/reports/${saved.id}/resolve`, {}, author);
  assert.equal(again.status, 409);
  const saved2 = await createReport(post, author);
  const long = await post(
    `/reports/${saved2.id}/resolve`,
    { note: "x".repeat(301) },
    author,
  );
  assert.equal(long.status, 400);
  const missing = await post("/reports/nope/resolve", {}, author);
  assert.equal(missing.status, 404);
});

// ---- Edit own report within 24h ----

test("edit: author updates description/location/category within 24h", async (t) => {
  const { post, patch, vid } = await fixture(t);
  const author = vid();
  const saved = await createReport(post, author);
  const res = await patch(
    `/reports/${saved.id}`,
    {
      description: "Shorter line now, moving fast.",
      location: "Market & 8th Street",
      category: "access",
    },
    author,
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.description, "Shorter line now, moving fast.");
  assert.equal(body.location, "Market & 8th Street");
  assert.equal(body.category, "access");
  assert.ok(body.editedAt > 0);
});

test("edit: PATCH without a JSON content type is rejected", async (t) => {
  const { post, vid, base } = await fixture(t);
  const author = vid();
  const saved = await createReport(post, author);
  const res = await fetch(`${base}/reports/${saved.id}`, {
    method: "PATCH",
    headers: { "X-Visitor-Id": author, "Content-Type": "text/plain" },
    body: "description=x",
  });
  assert.equal(res.status, 415);
});

test("edit: non-author, expired window, and bad input are rejected", async (t) => {
  const { post, patch, vid } = await fixture(t);
  const author = vid();
  const saved = await createReport(post, author);
  assert.equal(
    (await patch(`/reports/${saved.id}`, { description: "hijack" }, vid()))
      .status,
    403,
  );
  assert.equal(
    (await patch(`/reports/${saved.id}`, { category: "nope" }, author)).status,
    400,
  );
  assert.equal((await patch(`/reports/${saved.id}`, {}, author)).status, 400);
  // 25 hours later the window has closed.
  const realNow = Date.now;
  try {
    Date.now = () => realNow() + 25 * 3600 * 1000;
    assert.equal(
      (await patch(`/reports/${saved.id}`, { description: "late" }, author))
        .status,
      403,
    );
  } finally {
    Date.now = realNow;
  }
  // Resolved reports are history.
  await post(`/reports/${saved.id}/resolve`, {}, author);
  assert.equal(
    (await patch(`/reports/${saved.id}`, { description: "after" }, author))
      .status,
    409,
  );
});

// ---- Stale expiry lifecycle ----

test("expiry: quiet reports drop out, confirm revives them", async (t) => {
  const { post, get, vid } = await fixture(t);
  const author = vid();
  const saved = await createReport(post, author);
  const realNow = Date.now;
  try {
    Date.now = () => realNow() + 31 * 86400000;
    const listed = await (await get("/reports?city=sf")).json();
    assert.ok(!listed.some((r) => r.id === saved.id), "expired is excluded");
    const withExpired = await (
      await get("/reports?city=sf&includeExpired=1")
    ).json();
    const stale = withExpired.find((r) => r.id === saved.id);
    assert.ok(stale && stale.expired, "expired flag is set");
    const detail = await (await get(`/reports/${saved.id}`)).json();
    assert.equal(detail.expired, true);
    // A clear vote can't revive it; a confirm can.
    const clear = await post(
      `/reports/${saved.id}/vote`,
      { action: "clear" },
      vid(),
    );
    assert.equal(clear.status, 409);
    const confirm = await post(
      `/reports/${saved.id}/vote`,
      { action: "confirm" },
      vid(),
    );
    assert.equal(confirm.status, 200);
    const revived = await confirm.json();
    assert.equal(revived.expired, false);
    assert.equal(revived.status, "active");
    const listedAgain = await (await get("/reports?city=sf")).json();
    assert.ok(
      listedAgain.some((r) => r.id === saved.id),
      "revived is listed",
    );
  } finally {
    Date.now = realNow;
  }
});

test("expiry: a previous confirmer can refresh without double-counting", async (t) => {
  const { post, get, vid } = await fixture(t);
  const author = vid(),
    confirmer = vid();
  const saved = await createReport(post, author);
  assert.equal(
    (await post(`/reports/${saved.id}/vote`, { action: "confirm" }, confirmer))
      .status,
    200,
  );
  const realNow = Date.now;
  try {
    Date.now = () => realNow() + 31 * 86400000;
    const before = (await (await get(`/reports/${saved.id}`)).json())
      .confirmations;
    // Same visitor again: revives, doesn't double-count.
    const res = await post(
      `/reports/${saved.id}/vote`,
      { action: "confirm" },
      confirmer,
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.expired, false);
    assert.equal(body.confirmations, before);
    // But a duplicate confirm on a fresh report still 409s.
    const dupe = await post(
      `/reports/${saved.id}/vote`,
      { action: "confirm" },
      confirmer,
    );
    assert.equal(dupe.status, 409);
  } finally {
    Date.now = realNow;
  }
});

test("expiry: RSS feed skips stale reports", async (t) => {
  const { post, vid } = await fixture(t);
  const saved = await createReport(post, vid());
  const realNow = Date.now;
  try {
    Date.now = () => realNow() + 31 * 86400000;
    const res = await fetch(
      (
        await post("/reports", { ...report, title: "fresh one" }, vid())
      ).url.replace(/\/reports$/, "/feed.xml?city=sf"),
    );
    const xml = await res.text();
    assert.ok(!xml.includes(saved.id), "stale report excluded from feed");
    assert.ok(xml.includes("fresh one"), "fresh report kept in feed");
  } finally {
    Date.now = realNow;
  }
});

// ---- Bulk moderation ----

test("bulk moderation: hide and restore several reports at once", async (t) => {
  const { post, vid } = await fixture(t);
  const author = vid();
  const a = await createReport(post, author, { title: "spam one" });
  const b = await createReport(post, author, { title: "spam two" });
  await post(`/reports/${a.id}/flag`, { reason: "spam" }, vid());
  await post(`/reports/${b.id}/flag`, { reason: "spam" }, vid());
  const hide = await post(
    "/moderation/bulk",
    { ids: [a.id, b.id, "missing-id"], action: "hide" },
    vid(),
    true,
  );
  assert.equal(hide.status, 200);
  const hidden = await hide.json();
  assert.equal(hidden.results.filter((r) => !r.skipped).length, 2);
  assert.ok(hidden.results.every((r) => r.skipped || r.hidden));
  const restore = await post(
    "/moderation/bulk",
    { ids: [a.id], action: "restore" },
    vid(),
    true,
  );
  assert.equal(restore.status, 200);
  assert.equal((await restore.json()).results[0].hidden, false);
  // Without the token the queue stays locked.
  const denied = await post(
    "/moderation/bulk",
    { ids: [a.id], action: "hide" },
    vid(),
    false,
  );
  assert.equal(denied.status, 403);
  const bad = await post(
    "/moderation/bulk",
    { ids: [a.id], action: "explode" },
    vid(),
    true,
  );
  assert.equal(bad.status, 400);
});

// ---- Merge duplicates ----

test("merge: duplicates fold into the canonical report", async (t) => {
  const { post, get, vid, store } = await fixture(t);
  const author = vid(),
    confirmer = vid(),
    noter = vid();
  const target = await createReport(post, author, {
    title: "Elevator outage downtown",
  });
  const dupe = await createReport(post, author, {
    title: "Elevator broken near Powell",
    lat: 37.7845,
    lng: -122.4079,
  });
  // Distinct visitors so votes/notes/kudos attach to the duplicate.
  await post(`/reports/${dupe.id}/vote`, { action: "confirm" }, confirmer);
  await post(
    `/reports/${dupe.id}/comments`,
    { body: "Still broken at noon." },
    noter,
  );
  await post(`/reports/${dupe.id}/kudos`, {}, confirmer);
  await post(`/reports/${dupe.id}/flag`, { reason: "duplicate" }, noter);
  const res = await post(
    "/moderation/merge",
    { sourceId: dupe.id, targetId: target.id },
    vid(),
    true,
  );
  assert.equal(res.status, 200);
  const merged = await res.json();
  assert.equal(merged.id, target.id);
  assert.equal(merged.merged, dupe.id);
  // author confirmed both, confirmer only the dupe: distinct visitors = 2.
  assert.equal(merged.confirmations, 2);
  const detail = await (await get(`/reports/${target.id}`)).json();
  assert.equal(detail.commentCount, 1);
  assert.equal(detail.kudosCount, 1);
  assert.equal((await get(`/reports/${dupe.id}`)).status, 404);
  const listed = await (await get("/reports?city=sf")).json();
  assert.ok(!listed.some((r) => r.id === dupe.id));
});

test("merge: a visitor who confirmed both reports counts once", async (t) => {
  const { post, get, vid } = await fixture(t);
  const author = vid(),
    both = vid();
  const target = await createReport(post, author, { title: "merge target" });
  const dupe = await createReport(post, author, { title: "merge source" });
  await post(`/reports/${target.id}/vote`, { action: "confirm" }, both);
  await post(`/reports/${dupe.id}/vote`, { action: "confirm" }, both);
  const before = (await (await get(`/reports/${target.id}`)).json())
    .confirmations;
  const res = await post(
    "/moderation/merge",
    { sourceId: dupe.id, targetId: target.id },
    vid(),
    true,
  );
  assert.equal(res.status, 200);
  const merged = await res.json();
  // The votes table holds each visitor once; the counter must match it.
  // `both` already confirmed the target, and the author's dupe vote is a
  // no-op, so the total is unchanged.
  const detail = await (await get(`/reports/${target.id}`)).json();
  assert.equal(detail.confirmations, before);
  assert.equal(merged.confirmations, detail.confirmations);
});

test("merge: rejects self-merge, missing reports, and non-admins", async (t) => {
  const { post, vid } = await fixture(t);
  const author = vid();
  const saved = await createReport(post, author);
  assert.equal(
    (
      await post(
        "/moderation/merge",
        { sourceId: saved.id, targetId: saved.id },
        vid(),
        true,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await post(
        "/moderation/merge",
        { sourceId: saved.id, targetId: "missing" },
        vid(),
        true,
      )
    ).status,
    404,
  );
  const other = await createReport(post, author);
  assert.equal(
    (
      await post(
        "/moderation/merge",
        { sourceId: saved.id, targetId: other.id },
        vid(),
        false,
      )
    ).status,
    403,
  );
});
