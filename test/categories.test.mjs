import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { authorizeRoles } from "../middlewares/authorizeRoles.mjs";
import { errorHandler } from "../middlewares/errorHandler.mjs";
import { createCategoriesRouter } from "../routes/createCategoriesRouter.mjs";

function authenticateForTest(req, res, next) {
  const authorization = req.get("authorization");

  if (!authorization) {
    return res.status(401).json({
      code: "missing_access_token",
      message: "A Bearer access token is required",
    });
  }

  req.auth = {
    role: authorization.replace(/^Bearer\s+/i, ""),
    userId: "admin-user-id",
  };
  return next();
}

function createTestApp(query) {
  const app = express();
  app.use(express.json());
  app.use(
    "/categories",
    createCategoriesRouter({
      authenticate: authenticateForTest,
      authorizeContentAdmin: authorizeRoles("content_admin", "super_admin"),
      query,
    }),
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

test("GET /categories returns active categories", async () => {
  const categories = [
    {
      description: "Workout articles",
      id: 1,
      name: "Workout",
      slug: "workout",
    },
  ];
  let executedSql;
  const app = createTestApp(async (sql) => {
    executedSql = sql;
    return { rowCount: categories.length, rows: categories };
  });

  const response = await request(app, "/categories");

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { data: categories });
  assert.match(executedSql, /WHERE is_active/);
});

test("GET /categories/:categoryId returns one category or 404", async () => {
  const calls = [];
  const app = createTestApp(async (sql, values) => {
    calls.push({ sql, values });
    return values[0] === 1
      ? { rowCount: 1, rows: [{ id: 1, name: "Workout", slug: "workout" }] }
      : { rowCount: 0, rows: [] };
  });

  const found = await request(app, "/categories/1");
  const missing = await request(app, "/categories/999");

  assert.equal(found.status, 200);
  assert.equal(found.body.slug, "workout");
  assert.equal(missing.status, 404);
  assert.equal(missing.body.code, "category_not_found");
  assert.deepEqual(
    calls.map(({ values }) => values),
    [[1], [999]],
  );
});

test("GET /categories/:categoryId rejects an invalid id before querying", async () => {
  let queryCalled = false;
  const app = createTestApp(async () => {
    queryCalled = true;
    return { rowCount: 0, rows: [] };
  });

  const response = await request(app, "/categories/not-an-id");

  assert.equal(response.status, 400);
  assert.equal(response.body.code, "invalid_id");
  assert.equal(queryCalled, false);
});

test("category write routes require authentication and an admin role", async () => {
  let queryCalled = false;
  const app = createTestApp(async () => {
    queryCalled = true;
    return { rowCount: 1, rows: [] };
  });
  const input = { name: "Nutrition", slug: "nutrition" };

  const unauthenticated = await request(app, "/categories", {
    body: input,
    method: "POST",
  });
  const member = await request(app, "/categories", {
    body: input,
    headers: { authorization: "Bearer member" },
    method: "POST",
  });

  assert.equal(unauthenticated.status, 401);
  assert.equal(unauthenticated.body.code, "missing_access_token");
  assert.equal(member.status, 403);
  assert.equal(member.body.code, "insufficient_permissions");
  assert.equal(queryCalled, false);
});

test("POST /categories creates a category for a content admin", async () => {
  let queryCall;
  const createdCategory = {
    created_by: "admin-user-id",
    description: "Food and nutrition",
    id: 2,
    is_active: true,
    name: "Nutrition",
    slug: "nutrition",
  };
  const app = createTestApp(async (sql, values) => {
    queryCall = { sql, values };
    return { rowCount: 1, rows: [createdCategory] };
  });

  const response = await request(app, "/categories", {
    body: {
      description: "Food and nutrition",
      name: "Nutrition",
      slug: "nutrition",
    },
    headers: { authorization: "Bearer content_admin" },
    method: "POST",
  });

  assert.equal(response.status, 201);
  assert.deepEqual(response.body, createdCategory);
  assert.match(queryCall.sql, /INSERT INTO categories/);
  assert.deepEqual(queryCall.values, [
    "Nutrition",
    "nutrition",
    "Food and nutrition",
    true,
    "admin-user-id",
  ]);
});

test("POST /categories reports a duplicate slug as a conflict", async () => {
  const app = createTestApp(async () => {
    const error = new Error("duplicate key value violates unique constraint");
    error.code = "23505";
    throw error;
  });

  const response = await request(app, "/categories", {
    body: { name: "Workout", slug: "workout" },
    headers: { authorization: "Bearer super_admin" },
    method: "POST",
  });

  assert.equal(response.status, 409);
  assert.equal(response.body.code, "resource_conflict");
});

test("PATCH /categories/:categoryId updates only supplied fields", async () => {
  let queryCall;
  const app = createTestApp(async (sql, values) => {
    queryCall = { sql, values };
    return {
      rowCount: 1,
      rows: [{ id: 2, name: "Healthy Eating", slug: "nutrition" }],
    };
  });

  const response = await request(app, "/categories/2", {
    body: { name: "Healthy Eating" },
    headers: { authorization: "Bearer content_admin" },
    method: "PATCH",
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.name, "Healthy Eating");
  assert.match(queryCall.sql, /SET name = \$1/);
  assert.deepEqual(queryCall.values, ["Healthy Eating", 2]);
});

test("DELETE /categories/:categoryId deletes an existing category", async () => {
  let queryCall;
  const app = createTestApp(async (sql, values) => {
    queryCall = { sql, values };
    return { rowCount: 1, rows: [{ id: 2 }] };
  });

  const response = await request(app, "/categories/2", {
    headers: { authorization: "Bearer super_admin" },
    method: "DELETE",
  });

  assert.equal(response.status, 204);
  assert.equal(response.body, undefined);
  assert.match(queryCall.sql, /DELETE FROM categories/);
  assert.deepEqual(queryCall.values, [2]);
});
