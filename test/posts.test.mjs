import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { errorHandler } from "../middlewares/errorHandler.mjs";

// All database and Auth calls are mocked; no external service is contacted.
process.env.DATABASE_URL ??= "postgresql://localhost/test";
process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY ??= "test-key";
const { default: pool } = await import("../utils/db.mjs");
const { getSupabaseAuthClient } = await import("../utils/supabaseAuth.mjs");
const { default: postsRouter } = await import("../routes/posts.mjs");

async function writePost(t, { method = "POST", wasPublic = false, isPublic = true, failNotification = false, missing = false, publishedAt = null } = {}) {
  const calls = [];
  let notifications = 0;
  let released = false;
  t.mock.method(getSupabaseAuthClient().auth, "getUser", async () => ({ data: { user: { id: "admin-id" } }, error: null }));
  t.mock.method(pool, "query", async () => ({ rows: [{ id: "admin-id", role: "content_admin", status: "active" }] }));
  t.mock.method(pool, "connect", async () => ({
    async query(sql) {
      calls.push(sql);
      if (/SELECT posts.published_at/.test(sql)) return { rows: [{ is_public: wasPublic }] };
      if (/SELECT is_public/.test(sql)) return { rows: [{ is_public: isPublic }] };
      if (/INSERT INTO notifications/.test(sql)) {
        notifications++;
        if (failNotification && notifications === 2) throw Object.assign(new Error("notification rejected"), { code: "23514" });
      }
      return { rowCount: missing ? 0 : 1, rows: missing ? [] : [{ id: 12, title: "Article", status_id: 1, published_at: publishedAt }] };
    },
    release() { released = true; },
  }));
  const app = express();
  app.use(express.json());
  app.use("/posts", postsRouter);
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/posts${method === "PATCH" ? "/12" : ""}`, {
      method,
      headers: { authorization: "Bearer test", "content-type": "application/json" },
      body: JSON.stringify({ title: "Article", category_id: 1, description: "Description", content: "Content", status_id: 1 }),
    });
    return { status: response.status, body: await response.json(), calls, notifications, released };
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

test("creating a public post without published_at notifies and commits", async t => {
  const result = await writePost(t);
  assert.equal(result.status, 201);
  assert.equal(result.notifications, 2);
  assert.equal(result.calls.at(-1), "COMMIT");
  assert.equal(result.released, true);
});

test("creating a draft with published_at does not notify", async t => {
  const result = await writePost(t, { isPublic: false, publishedAt: "2026-09-16T00:00:00Z" });
  assert.equal(result.status, 201);
  assert.equal(result.notifications, 0);
});

test("publishing a draft locks the post and notifies", async t => {
  const result = await writePost(t, { method: "PATCH" });
  assert.equal(result.status, 200);
  assert.equal(result.notifications, 2);
  assert.ok(result.calls.some(sql => /FOR UPDATE OF posts/.test(sql)));
});

test("editing an already public post does not notify again", async t => {
  const result = await writePost(t, { method: "PATCH", wasPublic: true });
  assert.equal(result.status, 200);
  assert.equal(result.notifications, 0);
});

for (const method of ["POST", "PATCH"]) {
  test(`${method} rolls back the post and earlier notification on notification failure`, async t => {
    const result = await writePost(t, { method, failNotification: true });
    assert.equal(result.status, 400);
    assert.equal(result.body.code, "constraint_violation");
    assert.equal(result.calls.at(-1), "ROLLBACK");
    assert.equal(result.calls.includes("COMMIT"), false);
    assert.equal(result.released, true);
  });
}

test("updating a missing post returns 404 and releases the connection", async t => {
  const result = await writePost(t, { method: "PATCH", missing: true });
  assert.equal(result.status, 404);
  assert.equal(result.notifications, 0);
  assert.equal(result.released, true);
});
