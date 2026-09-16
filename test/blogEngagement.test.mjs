import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { errorHandler } from "../middlewares/errorHandler.mjs";
import { createCommentsRouter } from "../routes/createCommentsRouter.mjs";
import { createLikesRouter } from "../routes/createLikesRouter.mjs";

function authenticateForTest(req, res, next) {
  const authorization = req.get("authorization");

  if (!authorization) {
    return res.status(401).json({
      code: "missing_access_token",
      message: "A Bearer access token is required",
    });
  }

  const token = authorization.replace(/^Bearer\s+/i, "");
  req.auth = {
    role: token === "admin" ? "super_admin" : "member",
    userId: token === "admin" ? "admin-user-id" : "member-user-id",
  };
  return next();
}

function createTestApp(query) {
  const app = express();
  app.use(express.json());
  app.use(
    "/posts/:postId/comments",
    createCommentsRouter({ authenticate: authenticateForTest, query }),
  );
  app.use(
    "/posts/:postId/like",
    createLikesRouter({ authenticate: authenticateForTest, query }),
  );
  app.use(errorHandler);
  return app;
}

async function request(app, path, { body, headers, method = "GET" } = {}) {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...headers,
      },
      method,
    });
    const responseText = await response.text();

    return {
      body: responseText ? JSON.parse(responseText) : undefined,
      status: response.status,
    };
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test("Like and comment writes require authentication", async () => {
  let queryCalled = false;
  const app = createTestApp(async () => {
    queryCalled = true;
    return { rowCount: 0, rows: [] };
  });

  const likeResponse = await request(app, "/posts/1/like", { method: "PUT" });
  const commentResponse = await request(app, "/posts/1/comments", {
    body: { content: "Hello" },
    method: "POST",
  });

  assert.equal(likeResponse.status, 401);
  assert.equal(commentResponse.status, 401);
  assert.equal(queryCalled, false);
});

test("PUT /posts/:postId/like creates an idempotent Like and returns the count", async () => {
  const calls = [];
  const app = createTestApp(async (sql, values) => {
    calls.push({ sql, values });
    return calls.length === 1
      ? { rowCount: 1, rows: [{ inserted: true, post_exists: true }] }
      : { rowCount: 1, rows: [{ likes_count: 4 }] };
  });

  const response = await request(app, "/posts/12/like", {
    headers: { authorization: "Bearer member" },
    method: "PUT",
  });

  assert.equal(response.status, 201);
  assert.deepEqual(response.body, { liked: true, likes_count: 4 });
  assert.match(calls[0].sql, /ON CONFLICT \(post_id, user_id\) DO NOTHING/);
  assert.deepEqual(calls[0].values, [12, "member-user-id"]);
  assert.match(calls[0].sql, /notified AS/);
  assert.match(calls[0].sql, /FROM inserted\s+JOIN posts/);
  assert.equal(calls.length, 2);
});

test("PUT /posts/:postId/like returns 200 when the Like already exists", async () => {
  let callNumber = 0;
  const app = createTestApp(async () => {
    callNumber += 1;
    return callNumber === 1
      ? { rowCount: 1, rows: [{ inserted: false, post_exists: true }] }
      : { rowCount: 1, rows: [{ likes_count: 4 }] };
  });

  const response = await request(app, "/posts/12/like", {
    headers: { authorization: "Bearer member" },
    method: "PUT",
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { liked: true, likes_count: 4 });
});

test("DELETE /posts/:postId/like returns the latest count", async () => {
  const calls = [];
  const app = createTestApp(async (sql, values) => {
    calls.push({ sql, values });
    return calls.length === 1
      ? { rowCount: 1, rows: [] }
      : { rowCount: 1, rows: [{ likes_count: 3 }] };
  });

  const response = await request(app, "/posts/12/like", {
    headers: { authorization: "Bearer member" },
    method: "DELETE",
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { liked: false, likes_count: 3 });
  assert.match(calls[0].sql, /statuses\.is_public/);
});

test("Like rejects a post that is not published", async () => {
  const app = createTestApp(async () => ({
    rowCount: 1,
    rows: [{ inserted: false, post_exists: false }],
  }));

  const response = await request(app, "/posts/12/like", {
    headers: { authorization: "Bearer member" },
    method: "PUT",
  });

  assert.equal(response.status, 404);
  assert.equal(response.body.code, "post_not_found");
});

test("GET /posts/:postId/comments returns pagination metadata", async () => {
  const comment = {
    author_id: "member-user-id",
    author_name: "Member",
    content: "Hello",
    id: 5,
    parent_id: null,
  };
  const app = createTestApp(async (sql, values) => {
    if (/COUNT\(\*\)/.test(sql)) {
      return { rowCount: 1, rows: [{ total: 1 }] };
    }
    assert.deepEqual(values, [12, 5, 5]);
    return { rowCount: 1, rows: [comment] };
  });

  const response = await request(app, "/posts/12/comments?page=2&limit=5");

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.data, [comment]);
  assert.deepEqual(response.body.pagination, {
    page: 2,
    limit: 5,
    total: 1,
    totalPages: 1,
  });
});

test("POST /posts/:postId/comments validates and trims content", async () => {
  let queryCall;
  const createdComment = {
    author_id: "member-user-id",
    author_name: "Member",
    content: "Hello",
    id: 5,
    parent_id: null,
  };
  const app = createTestApp(async (sql, values) => {
    queryCall = { sql, values };
    return { rowCount: 1, rows: [createdComment] };
  });

  const response = await request(app, "/posts/12/comments", {
    body: { content: "  Hello  " },
    headers: { authorization: "Bearer member" },
    method: "POST",
  });

  assert.equal(response.status, 201);
  assert.deepEqual(response.body, createdComment);
  assert.deepEqual(queryCall.values, [12, "member-user-id", null, "Hello"]);
  assert.match(queryCall.sql, /profiles\.full_name AS author_name/);
});

test("POST /posts/:postId/comments rejects blank content before querying", async () => {
  let queryCalled = false;
  const app = createTestApp(async () => {
    queryCalled = true;
    return { rowCount: 0, rows: [] };
  });

  const response = await request(app, "/posts/12/comments", {
    body: { content: "   " },
    headers: { authorization: "Bearer member" },
    method: "POST",
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.code, "invalid_comment_content");
  assert.equal(queryCalled, false);
});

test("Comment creation rejects a post that is not published", async () => {
  const app = createTestApp(async () => ({ rowCount: 0, rows: [] }));

  const response = await request(app, "/posts/12/comments", {
    body: { content: "Hidden post comment" },
    headers: { authorization: "Bearer member" },
    method: "POST",
  });

  assert.equal(response.status, 404);
  assert.equal(response.body.code, "post_not_found");
});

test("PATCH and DELETE comments scope writes to their owner or an admin", async () => {
  const calls = [];
  const app = createTestApp(async (sql, values) => {
    calls.push({ sql, values });
    return /RETURNING id/.test(sql)
      ? { rowCount: 1, rows: [{ id: 8 }] }
      : {
          rowCount: 1,
          rows: [{ author_id: "member-user-id", content: "Edited", id: 8 }],
        };
  });

  const patchResponse = await request(app, "/posts/12/comments/8", {
    body: { content: "Edited" },
    headers: { authorization: "Bearer member" },
    method: "PATCH",
  });
  const deleteResponse = await request(app, "/posts/12/comments/8", {
    headers: { authorization: "Bearer admin" },
    method: "DELETE",
  });

  assert.equal(patchResponse.status, 200);
  assert.equal(deleteResponse.status, 204);
  assert.deepEqual(calls[0].values, [
    "Edited",
    8,
    12,
    "member-user-id",
    false,
  ]);
  assert.deepEqual(calls[1].values, [8, 12, "admin-user-id", true]);
});

test("comment Like and notification are written together and repeated Likes are idempotent", async () => {
  for (const inserted of [true, false]) {
    const calls = [];
    const app = createTestApp(async (sql, values) => {
      calls.push({ sql, values });
      return calls.length === 1
        ? { rows: [{ comment_exists: true, inserted }] }
        : { rows: [{ likes_count: 4 }] };
    });
    const response = await request(app, "/posts/12/comments/8/like", {
      method: "PUT", headers: { authorization: "Bearer member" },
    });
    assert.equal(response.status, inserted ? 201 : 200);
    assert.deepEqual(response.body, { liked: true, likes_count: 4 });
    assert.deepEqual(calls[0].values, [8, 12, "member-user-id"]);
    assert.match(calls[0].sql, /notified AS/);
    assert.match(calls[0].sql, /FROM inserted\s+CROSS JOIN LATERAL/);
    assert.equal(calls.length, 2);
  }
});

test("a failed atomic Like write stops before fetching the count", async () => {
  for (const path of ["/posts/12/like", "/posts/12/comments/8/like"]) {
    let calls = 0;
    const app = createTestApp(async () => {
      calls++;
      throw Object.assign(new Error("notification rejected"), { code: "23514" });
    });
    const response = await request(app, path, { method: "PUT", headers: { authorization: "Bearer member" } });
    assert.equal(response.status, 400);
    assert.equal(response.body.code, "constraint_violation");
    assert.equal(calls, 1);
  }
});
