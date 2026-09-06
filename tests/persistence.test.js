import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createStore } from "../server/store.js";
const report = {
  category: "queue",
  title: "Coffee queue",
  location: "Market Street",
  description: "",
  lat: 37.77,
  lng: -122.42,
  severity: 2,
};

test("reports and vote uniqueness survive closing and reopening the database", () => {
  const directory = mkdtempSync(join(tmpdir(), "friction-persistence-"));
  const path = join(directory, "test.sqlite");
  let store = createStore(path, false);
  try {
    const { report: saved } = store.create(report, "visitor");
    store.close();
    store = createStore(path, false);
    assert.equal(store.list()[0].id, saved.id);
    assert.throws(() => store.vote(saved.id, "visitor", "confirm"));
  } finally {
    store.close();
    rmSync(directory, { recursive: true });
  }
});

test("a failed report update rolls back its vote so retrying is safe", () => {
  const directory = mkdtempSync(join(tmpdir(), "friction-atomic-"));
  const path = join(directory, "test.sqlite");
  const store = createStore(path, false);
  const db = new DatabaseSync(path);
  try {
    const { report: saved } = store.create(report, "reporter");
    db.exec(
      "CREATE TRIGGER reject_save BEFORE INSERT ON reports BEGIN SELECT RAISE(ABORT, 'simulated storage failure'); END;",
    );
    assert.throws(
      () => store.vote(saved.id, "voter", "confirm"),
      /simulated storage failure/,
    );
    assert.equal(store.list()[0].confirmations, 1);
    db.exec("DROP TRIGGER reject_save;");
    assert.equal(store.vote(saved.id, "voter", "confirm").confirmations, 2);
  } finally {
    db.close();
    store.close();
    rmSync(directory, { recursive: true });
  }
});
