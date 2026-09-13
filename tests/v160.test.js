import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createStore } from "../server/store.js";
import { createApi } from "../server/api.js";
import { validateReport } from "../server/domain.js";

const report = {
  category: "queue",
  title: "Coffee queue",
  location: "Market Street",
  description: "",
  lat: 37.77,
  lng: -122.42,
  severity: 2,
};

const PHOTO = "data:image/jpeg;base64," + "a".repeat(100);

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
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let n = 0;
  const vid = () => `v160-visitor-${++n}-${Date.now()}`;
  const post = (path, body, visitor = vid(), headers = {}) =>
    fetch(base + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Visitor-Id": visitor,
        ...headers,
      },
      body: JSON.stringify(body),
    });
  const get = (path, visitor = vid()) =>
    fetch(base + path, { headers: { "X-Visitor-Id": visitor } });
  const getRaw = (path, headers = {}) => fetch(base + path, { headers });
  return { store, base, post, get, getRaw, vid };
}

test("photo attachments: valid data URL is stored and returned", async (t) => {
  const { store, post, get } = await fixture(t);
  const res = await post("/reports", { ...report, photo: PHOTO });
  assert.equal(res.status, 201);
  const { report: saved } = await res.json();
  assert.equal(saved.photo, PHOTO);
  const listed = await (await get("/reports?city=sf")).json();
  assert.equal(listed.find((r) => r.id === saved.id).photo, PHOTO);
  assert.equal(store.get(saved.id).photo, PHOTO);
});

test("photo attachments: oversized, wrong-type, and non-string rejected", async (t) => {
  const { post } = await fixture(t);
  const big = "data:image/jpeg;base64," + "a".repeat(350 * 1024);
  assert.equal((await post("/reports", { ...report, photo: big })).status, 400);
  const gif = "data:image/gif;base64,aaaa";
  assert.equal((await post("/reports", { ...report, photo: gif })).status, 400);
  assert.equal((await post("/reports", { ...report, photo: 42 })).status, 400);
  // photoUrl behavior is unchanged.
  assert.equal(
    (await post("/reports", { ...report, photoUrl: "not a url" })).status,
    400,
  );
});

test("domain: blank photo trims to empty and is allowed", () => {
  const out = validateReport({ ...report, photo: "   " });
  assert.equal(out.photo, "");
});

test("similar endpoint ranks nearby same-category reports", async (t) => {
  const { post, get } = await fixture(t);
  const v = "v160-sim-visitor-1";
  const a = await (
    await post("/reports", { ...report, lat: 37.7749, lng: -122.4194 }, v)
  ).json();
  await post(
    "/reports",
    {
      ...report,
      title: "Different queue far away",
      lat: 37.8049,
      lng: -122.4494,
    },
    "v160-sim-visitor-2",
  );
  await post(
    "/reports",
    {
      ...report,
      category: "noise",
      title: "Noise nearby",
      lat: 37.775,
      lng: -122.4195,
    },
    "v160-sim-visitor-3",
  );
  const res = await get(
    `/reports/similar?lat=37.7751&lng=-122.4196&category=queue&city=sf`,
  );
  assert.equal(res.status, 200);
  const cands = await res.json();
  assert.ok(cands.length >= 1);
  assert.equal(cands[0].id, a.report.id);
  assert.ok(cands[0].distanceM < 100);
  assert.ok(!cands.some((c) => c.category === "noise"));
  // Invalid inputs are rejected.
  assert.equal((await get("/reports/similar?lat=1&lng=2")).status, 400);
  assert.equal(
    (await get("/reports/similar?lat=37.77&lng=-122.42&category=bogus")).status,
    400,
  );
  assert.equal(
    (
      await get(
        "/reports/similar?lat=37.77&lng=-122.42&category=queue&city=nope",
      )
    ).status,
    400,
  );
});

test("kudos toggle thanks, unthanks, and notifies the creator", async (t) => {
  const { store, post, get } = await fixture(t);
  const creator = "v160-kudos-creator-1";
  const { report: saved } = await (
    await post("/reports", report, creator)
  ).json();
  const fan = "v160-kudos-fan-00001";
  const first = await (
    await post(`/reports/${saved.id}/kudos`, {}, fan)
  ).json();
  assert.equal(first.kudoed, true);
  assert.equal(first.kudosCount, 1);
  assert.equal(store.hasKudoed(saved.id, fan), true);
  // The creator gets a notification.
  const notes = store.listNotifications(creator).items;
  assert.ok(notes.some((n) => n.type === "kudos"));
  const second = await (
    await post(`/reports/${saved.id}/kudos`, {}, fan)
  ).json();
  assert.equal(second.kudoed, false);
  assert.equal(second.kudosCount, 0);
  // Unknown and hidden reports are rejected.
  assert.equal((await post("/reports/missing/kudos", {}, fan)).status, 404);
  store.moderate(saved.id, "hide");
  assert.equal((await post(`/reports/${saved.id}/kudos`, {}, fan)).status, 409);
  // Counts ride along on list and get.
  const listed = await (await get("/reports?city=sf")).json();
  assert.equal(
    typeof listed.find((r) => r.id === saved.id).kudosCount,
    "number",
  );
});

test("moderation queue lists flagged reports with reasons", async (t) => {
  const { store, post } = await fixture(t, { adminToken: "v160-secret" });
  const creator = "v160-mod-creator-01";
  const { report: saved } = await (
    await post("/reports", report, creator)
  ).json();
  await post(
    `/reports/${saved.id}/flag`,
    { reason: "spam" },
    "v160-mod-f1-0001",
  );
  await post(
    `/reports/${saved.id}/flag`,
    { reason: "inaccurate" },
    "v160-mod-f2-0001",
  );
  const queue = store.flaggedReports();
  assert.equal(queue.length, 1);
  assert.deepEqual(queue[0].flagReasons, { spam: 1, inaccurate: 1 });
  assert.ok(queue[0].lastFlagAt > 0);
  assert.equal(queue[0].id, saved.id);
});

test("moderation flags endpoint requires the admin token", async (t) => {
  const { post, getRaw, vid } = await fixture(t, { adminToken: "v160-secret" });
  const { report: saved } = await (
    await post("/reports", report, vid())
  ).json();
  await post(`/reports/${saved.id}/flag`, { reason: "spam" }, vid());
  assert.equal((await getRaw("/moderation/flags")).status, 403);
  assert.equal(
    (await getRaw("/moderation/flags", { "X-Admin-Token": "wrong" })).status,
    403,
  );
  const ok = await getRaw("/moderation/flags", {
    "X-Admin-Token": "v160-secret",
  });
  assert.equal(ok.status, 200);
  const queue = await ok.json();
  assert.equal(queue.length, 1);
  assert.equal(queue[0].id, saved.id);
  assert.deepEqual(queue[0].flagReasons, { spam: 1 });
});

test("RSS feed serves recent reports as XML", async (t) => {
  const { post, get } = await fixture(t);
  const { report: saved } = await (
    await post("/reports", { ...report, title: "Feed queue test" })
  ).json();
  const res = await get("/feed.xml?city=sf");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /application\/rss\+xml/);
  const xml = await res.text();
  assert.match(xml, /<rss version="2\.0">/);
  assert.match(xml, /Feed queue test/);
  assert.match(xml, new RegExp(`/r/${saved.id}`));
  // Hidden reports stay out of the feed: three flags hide it.
  const doomed = await (
    await post("/reports", { ...report, title: "Doomed queue blip" })
  ).json();
  await post(
    `/reports/${doomed.report.id}/flag`,
    { reason: "spam" },
    "v160-feed-f1",
  );
  await post(
    `/reports/${doomed.report.id}/flag`,
    { reason: "spam" },
    "v160-feed-f2",
  );
  await post(
    `/reports/${doomed.report.id}/flag`,
    { reason: "spam" },
    "v160-feed-f3",
  );
  const xml2 = await (await get("/feed.xml?city=sf")).text();
  assert.ok(!xml2.includes("Doomed queue blip"));
  const bad = await get("/feed.xml?city=nope");
  assert.equal(bad.status, 400);
});
