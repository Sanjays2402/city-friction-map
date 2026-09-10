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
    get: (path) => fetch(base + "/api" + path),
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
    del: (path, headers = {}) =>
      fetch(base + "/api" + path, {
        method: "DELETE",
        headers: { "X-Visitor-Id": "test-visitor-0001", ...headers },
      }),
  };
}

const tag = (visitor) =>
  `Neighbor ${visitor.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6)}`;

async function createReport(
  request,
  visitor,
  lat = 37.77,
  title = "Coffee queue",
) {
  const res = await request(
    "/reports",
    { ...report, lat, title },
    { "X-Visitor-Id": visitor },
  );
  assert.equal(res.status, 201);
  return (await res.json()).report;
}

test("comment reactions toggle and count in nested output", async (t) => {
  const { get, request } = await fixture(t);
  const saved = await createReport(request, "react-visitor-01");
  const note = await (
    await request(
      `/reports/${saved.id}/comments`,
      { body: "very useful" },
      { "X-Visitor-Id": "react-visitor-02" },
    )
  ).json();

  const on = await request(
    `/comments/${note.id}/react`,
    {},
    { "X-Visitor-Id": "react-visitor-03" },
  );
  assert.equal(on.status, 200);
  assert.deepEqual(await on.json(), {
    id: note.id,
    helpful: true,
    helpfulCount: 1,
  });

  const off = await request(
    `/comments/${note.id}/react`,
    {},
    { "X-Visitor-Id": "react-visitor-03" },
  );
  assert.deepEqual(await off.json(), {
    id: note.id,
    helpful: false,
    helpfulCount: 0,
  });

  const missing = await request("/comments/missing/react", {});
  assert.equal(missing.status, 404);

  const comments = await (await get(`/reports/${saved.id}/comments`)).json();
  assert.equal(comments[0].helpfulCount, 0);
  assert.deepEqual(comments[0].replies, []);
});

test("replies nest one level under their parent note", async (t) => {
  const { get, request } = await fixture(t);
  const saved = await createReport(request, "reply-visitor-01");
  const parent = await (
    await request(
      `/reports/${saved.id}/comments`,
      { body: "parent note" },
      { "X-Visitor-Id": "reply-visitor-02" },
    )
  ).json();

  const replyRes = await request(
    `/reports/${saved.id}/comments`,
    { body: "a reply", parentId: parent.id },
    { "X-Visitor-Id": "reply-visitor-03" },
  );
  assert.equal(replyRes.status, 201);
  const reply = await replyRes.json();
  assert.equal(reply.author, tag("reply-visitor-03"));

  const comments = await (await get(`/reports/${saved.id}/comments`)).json();
  assert.equal(comments.length, 1);
  assert.equal(comments[0].replies.length, 1);
  assert.equal(comments[0].replies[0].body, "a reply");
  assert.equal(comments[0].replies[0].helpfulCount, 0);

  const secondLevel = await request(
    `/reports/${saved.id}/comments`,
    { body: "too deep", parentId: reply.id },
    { "X-Visitor-Id": "reply-visitor-03" },
  );
  assert.equal(secondLevel.status, 400);

  const orphan = await request(
    `/reports/${saved.id}/comments`,
    { body: "lost", parentId: "does-not-exist" },
    { "X-Visitor-Id": "reply-visitor-03" },
  );
  assert.equal(orphan.status, 404);

  const other = await createReport(
    request,
    "reply-visitor-01",
    37.775,
    "Bike dock empty",
  );
  const crossReport = await request(
    `/reports/${other.id}/comments`,
    { body: "wrong thread", parentId: parent.id },
    { "X-Visitor-Id": "reply-visitor-03" },
  );
  assert.equal(crossReport.status, 404);
});

test("area alerts validate, list, match, and delete", async (t) => {
  const { base, request, del } = await fixture(t);
  const inside = await createReport(
    request,
    "alert-visitor-01",
    37.77,
    "Near home",
  );
  await createReport(request, "alert-visitor-01", 37.8, "Far away");

  const zone = await (
    await request(
      "/alerts",
      { label: "Home", radiusM: 500, lat: 37.7705, lng: -122.421 },
      { "X-Visitor-Id": "alert-visitor-02" },
    )
  ).json();
  assert.equal(zone.label, "Home");
  assert.equal(zone.radiusM, 500);

  for (const bad of [
    { label: "", radiusM: 500, lat: 37.7705, lng: -122.421 },
    { label: "x".repeat(61), radiusM: 500, lat: 37.7705, lng: -122.421 },
    { label: "Home", radiusM: 50, lat: 37.7705, lng: -122.421 },
    { label: "Home", radiusM: 500, lat: 40.7, lng: -74.0 },
    { label: "Home", radiusM: "lots", lat: 37.7705, lng: -122.421 },
  ]) {
    const res = await request("/alerts", bad, {
      "X-Visitor-Id": "alert-visitor-02",
    });
    assert.equal(res.status, 400);
  }

  const listed = await (
    await fetch(`${base}/api/alerts`, {
      headers: { "X-Visitor-Id": "alert-visitor-02" },
    })
  ).json();
  assert.equal(listed.length, 1);

  const matches = await (
    await fetch(`${base}/api/alerts/matches`, {
      headers: { "X-Visitor-Id": "alert-visitor-02" },
    })
  ).json();
  assert.equal(matches.length, 1);
  assert.equal(matches[0].matches.length, 1);
  assert.equal(matches[0].matches[0].id, inside.id);
  assert.ok(matches[0].matches[0].distanceM < 500);

  const otherZones = await (
    await fetch(`${base}/api/alerts`, {
      headers: { "X-Visitor-Id": "stranger-visitor-99" },
    })
  ).json();
  assert.deepEqual(otherZones, []);

  assert.equal(
    (await del(`/alerts/${zone.id}`, { "X-Visitor-Id": "stranger-visitor-99" }))
      .status,
    404,
  );
  const gone = await del(`/alerts/${zone.id}`, {
    "X-Visitor-Id": "alert-visitor-02",
  });
  assert.equal(gone.status, 200);
  assert.deepEqual(await gone.json(), { id: zone.id, deleted: true });
  assert.equal(
    (await del(`/alerts/${zone.id}`, { "X-Visitor-Id": "alert-visitor-02" }))
      .status,
    404,
  );
});

test("hidden reports never appear in alert matches", async (t) => {
  const { request, base } = await fixture(t, { adminToken: "secret-admin" });
  const saved = await createReport(
    request,
    "alert-visitor-01",
    37.77,
    "Near home",
  );
  await request(
    "/alerts",
    { label: "Home", radiusM: 500, lat: 37.7705, lng: -122.421 },
    { "X-Visitor-Id": "alert-visitor-02" },
  );
  await request(
    `/reports/${saved.id}/moderate`,
    { action: "hide" },
    {
      "X-Admin-Token": "secret-admin",
    },
  );
  const matches = await (
    await fetch(`${base}/api/alerts/matches`, {
      headers: { "X-Visitor-Id": "alert-visitor-02" },
    })
  ).json();
  assert.deepEqual(matches[0].matches, []);
});

test("contributors ranks neighbors by weighted activity", async (t) => {
  const { get, request } = await fixture(t);
  const saved = await createReport(request, "leader-visitor-01");
  await createReport(request, "leader-visitor-02", 37.775, "Bike dock empty");
  await createReport(request, "leader-visitor-02", 37.78, "Noise on block");
  await request(
    `/reports/${saved.id}/comments`,
    { body: "note one" },
    { "X-Visitor-Id": "leader-visitor-03" },
  );
  await request(
    `/reports/${saved.id}/vote`,
    { action: "confirm" },
    { "X-Visitor-Id": "leader-visitor-04" },
  );
  const leaders = await (await get("/contributors")).json();
  assert.equal(leaders[0].name, tag("leader-visitor-02"));
  assert.equal(leaders[0].reports, 2);
  assert.equal(leaders[0].notes, 0);
  assert.equal(leaders[0].confirmations, 2);
  assert.equal(leaders[0].score, 8);
  const names = leaders.map((l) => l.name);
  assert.ok(names.includes(tag("leader-visitor-01")));
  assert.ok(names.includes(tag("leader-visitor-03")));
  assert.ok(names.includes(tag("leader-visitor-04")));
  assert.ok(!names.some((n) => n.includes("leader-visitor")));
});
