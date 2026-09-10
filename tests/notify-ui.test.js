import { test } from "node:test";
import assert from "node:assert/strict";
import {
  typeIcon,
  renderNotificationItem,
  initNotifications,
} from "../src/notify-ui.js";

test("typeIcon maps notification types", () => {
  assert.equal(typeIcon("alert"), "⚐");
  assert.equal(typeIcon("resolved"), "✓");
  assert.equal(typeIcon("comment"), "💬");
  assert.equal(typeIcon("unknown"), "●");
  assert.equal(typeIcon(undefined), "●");
});

test("renderNotificationItem escapes HTML in user content", () => {
  const html = renderNotificationItem({
    id: '1" onmouseover="x',
    type: "comment",
    title: "<script>alert('t')</script>",
    body: "a & b < c > d",
    createdAt: new Date().toISOString(),
    read: false,
  });
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("a &amp; b &lt; c &gt; d"));
  assert.ok(!html.includes('1" onmouseover="x'));
});

test("renderNotificationItem shows unread class and content", () => {
  const unread = renderNotificationItem({
    id: "1",
    type: "alert",
    title: "Trip warning",
    body: "Construction on your route",
    createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    read: false,
  });
  assert.ok(unread.includes('class="notification unread"'));
  assert.ok(unread.includes("Trip warning"));
  assert.ok(unread.includes("Construction on your route"));
  assert.ok(unread.includes("⚐"));
  assert.ok(unread.includes("5m ago"));

  const read = renderNotificationItem({
    id: "2",
    type: "resolved",
    title: "Fixed",
    body: "Your report was resolved",
    createdAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    read: true,
  });
  assert.ok(!read.includes("unread"));
  assert.ok(read.includes("✓"));
  assert.ok(read.includes("2h ago"));
});

test("initNotifications is a safe no-op when document is undefined", async () => {
  const calls = [];
  const api = async (path, body, method) => {
    calls.push([path, body, method]);
    return { items: [], unread: 0 };
  };
  const handle = initNotifications({
    api,
    onOpenReport: () => {},
    mount: null,
  });
  assert.ok(handle);
  await handle.refresh();
  handle.destroy();
  assert.deepEqual(calls, []);
});
