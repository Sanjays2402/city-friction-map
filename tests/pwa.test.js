import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("web manifest is valid and installable", () => {
  const manifest = JSON.parse(
    readFileSync(join(root, "public/manifest.webmanifest"), "utf8"),
  );
  assert.ok(manifest.name);
  assert.ok(manifest.short_name);
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.display, "standalone");
  assert.match(manifest.theme_color, /^#[0-9a-f]{6}$/);
  assert.ok(manifest.background_color);
  const sizes = manifest.icons.map((i) => i.sizes);
  assert.ok(sizes.includes("192x192"));
  assert.ok(sizes.includes("512x512"));
  for (const icon of manifest.icons) {
    assert.equal(icon.type, "image/png");
    assert.ok(existsSync(join(root, "public", icon.src.replace(/^\//, ""))));
  }
});

test("PWA icons are real PNGs", () => {
  for (const size of [192, 512]) {
    const bytes = readFileSync(join(root, `public/icon-${size}.png`));
    assert.deepEqual(
      [...bytes.subarray(0, 8)],
      [137, 80, 78, 71, 13, 10, 26, 10],
    );
    assert.ok(bytes.length > 500);
  }
});

test("service worker uses cache-first shell and network-first API", () => {
  const sw = readFileSync(join(root, "public/sw.js"), "utf8");
  assert.match(sw, /VERSION = "cfm-/);
  assert.match(sw, /skipWaiting/);
  assert.match(sw, /clients\.claim/);
  // App shell cached on install, served cache-first...
  assert.match(sw, /cache\.addAll/);
  assert.match(sw, /caches\.match/);
  // ...while API requests go network-first with a cache fallback.
  assert.match(sw, /startsWith\("\/api\/"\)/);
  const apiBlock = sw.slice(sw.indexOf('startsWith("/api/")'));
  assert.match(apiBlock, /fetch\(event\.request\)/);
  assert.match(apiBlock, /\.catch\(\(\) => caches\.match/);
});

test("index wires up the PWA metadata and worker", () => {
  const html = readFileSync(join(root, "index.html"), "utf8");
  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(html, /name="theme-color"/);
  assert.match(html, /rel="apple-touch-icon"/);
  assert.match(html, /navigator\.serviceWorker\.register\("\/sw\.js"\)/);
});
