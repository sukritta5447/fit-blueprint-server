import assert from "node:assert/strict";
import test from "node:test";
import {
  createAuthenticate,
  getBearerToken,
} from "../middlewares/authenticate.mjs";
import { authorizeRoles } from "../middlewares/authorizeRoles.mjs";

function createRequest(authorization) {
  return {
    get(headerName) {
      return headerName.toLowerCase() === "authorization"
        ? authorization
        : undefined;
    },
  };
}

function createResponse() {
  return {
    body: undefined,
    statusCode: 200,
    json(body) {
      this.body = body;
      return this;
    },
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
  };
}

test("getBearerToken reads a case-insensitive Bearer token", () => {
  assert.equal(getBearerToken("bearer valid-token"), "valid-token");
  assert.equal(getBearerToken("Basic credentials"), null);
  assert.equal(getBearerToken(undefined), null);
});

test("authenticate returns 401 when the Bearer token is missing", async () => {
  const authenticate = createAuthenticate();
  const req = createRequest();
  const res = createResponse();

  await authenticate(req, res, () => {});

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, "missing_access_token");
});

test("authenticate returns 401 when Supabase rejects the token", async () => {
  const authenticate = createAuthenticate({
    verifyToken: async () => ({
      error: { message: "invalid token", status: 401 },
      user: null,
    }),
  });
  const req = createRequest("Bearer invalid-token");
  const res = createResponse();

  await authenticate(req, res, () => {});

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, "invalid_access_token");
});

test("authenticate passes an unavailable Auth service to the error handler", async () => {
  const authenticate = createAuthenticate({
    verifyToken: async () => ({
      error: { message: "network error", status: 0 },
      user: null,
    }),
  });
  const req = createRequest("Bearer valid-token");
  const res = createResponse();
  let nextError;

  await authenticate(req, res, (error) => {
    nextError = error;
  });

  assert.equal(nextError.statusCode, 503);
  assert.equal(nextError.code, "auth_service_unavailable");
});

test("authenticate attaches verified user and uses the current profile role", async () => {
  const profile = {
    id: "user-1",
    email: "member@example.com",
    role: "content_admin",
    status: "active",
  };
  const authenticate = createAuthenticate({
    findProfile: async () => profile,
    verifyToken: async () => ({
      error: null,
      user: {
        id: "user-1",
        email: "member@example.com",
        app_metadata: { role: "member" },
      },
    }),
  });
  const req = createRequest("Bearer valid-token");
  const res = createResponse();
  let nextCalled = false;

  await authenticate(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(req.auth.userId, "user-1");
  assert.equal(req.auth.role, "content_admin");
  assert.equal(req.auth.profile, profile);
});

test("authenticate returns 403 for an inactive profile", async () => {
  const authenticate = createAuthenticate({
    findProfile: async () => ({ id: "user-1", status: "disabled" }),
    verifyToken: async () => ({
      error: null,
      user: { id: "user-1", app_metadata: { role: "member" } },
    }),
  });
  const req = createRequest("Bearer valid-token");
  const res = createResponse();

  await authenticate(req, res, () => {});

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, "account_inactive");
});

test("authorizeRoles permits an allowed role", () => {
  const authorize = authorizeRoles("content_admin", "super_admin");
  const req = { auth: { role: "content_admin" } };
  const res = createResponse();
  let nextCalled = false;

  authorize(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
});

test("authorizeRoles rejects an authenticated role without permission", () => {
  const authorize = authorizeRoles("content_admin", "super_admin");
  const req = { auth: { role: "member" } };
  const res = createResponse();

  authorize(req, res, () => {});

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, "insufficient_permissions");
});
