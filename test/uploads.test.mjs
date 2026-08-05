import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { errorHandler } from "../middlewares/errorHandler.mjs";
import { createUploadsRouter } from "../routes/createUploadsRouter.mjs";

function authenticateForTest(req, res, next) {
  const authorization = req.get("authorization");

  if (!authorization) {
    return res.status(401).json({
      code: "missing_access_token",
      message: "A Bearer access token is required",
    });
  }

  req.auth = {
    accessToken: "test-access-token",
    role: authorization.replace(/^Bearer\s+/i, ""),
    userId: "user-id",
  };
  return next();
}

function createTestApp(createSignedUpload) {
  const app = express();
  app.use(express.json());
  app.use(
    "/uploads",
    createUploadsRouter({
      authenticate: authenticateForTest,
      createSignedUpload,
      generateId: () => "generated-id",
    }),
  );
  app.use(errorHandler);
  return app;
}

async function request(app, body, role) {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();

  try {
    const response = await fetch(
      `http://127.0.0.1:${port}/uploads/signed-url`,
      {
        body: JSON.stringify(body),
        headers: {
          "content-type": "application/json",
          ...(role ? { authorization: `Bearer ${role}` } : {}),
        },
        method: "POST",
      },
    );
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

function successfulSigner() {
  return {
    data: {
      publicUrl: "https://example.supabase.co/storage/public/file.png",
      signedUrl: "https://example.supabase.co/storage/upload/sign/file.png",
      token: "signed-token",
    },
    error: null,
  };
}

test("POST /uploads/signed-url requires authentication", async () => {
  let signerCalled = false;
  const app = createTestApp(async () => {
    signerCalled = true;
    return successfulSigner();
  });

  const response = await request(app, {
    contentType: "image/png",
    fileName: "avatar.png",
    type: "avatar",
  });

  assert.equal(response.status, 401);
  assert.equal(response.body.code, "missing_access_token");
  assert.equal(signerCalled, false);
});

test("POST /uploads/signed-url creates an avatar upload in the user folder", async () => {
  let signerInput;
  const app = createTestApp(async (input) => {
    signerInput = input;
    return successfulSigner();
  });

  const response = await request(
    app,
    {
      contentType: "image/png",
      fileName: "My unsafe avatar name.png",
      type: "avatar",
    },
    "member",
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.bucket, "avatars");
  assert.equal(response.body.path, "user-id/generated-id.png");
  assert.equal(response.body.expiresIn, 7200);
  assert.equal(response.body.token, "signed-token");
  assert.deepEqual(signerInput, {
    accessToken: "test-access-token",
    bucket: "avatars",
    path: "user-id/generated-id.png",
  });
});

test("POST /uploads/signed-url permits post images for content admins", async () => {
  let signerInput;
  const app = createTestApp(async (input) => {
    signerInput = input;
    return successfulSigner();
  });

  const response = await request(
    app,
    {
      contentType: "image/webp",
      fileName: "article.webp",
      type: "post-image",
    },
    "content_admin",
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.bucket, "post-images");
  assert.equal(response.body.path, "user-id/generated-id.webp");
  assert.equal(signerInput.bucket, "post-images");
});

test("POST /uploads/signed-url rejects post images from members", async () => {
  let signerCalled = false;
  const app = createTestApp(async () => {
    signerCalled = true;
    return successfulSigner();
  });

  const response = await request(
    app,
    {
      contentType: "image/jpeg",
      fileName: "article.jpg",
      type: "post-image",
    },
    "member",
  );

  assert.equal(response.status, 403);
  assert.equal(response.body.code, "insufficient_permissions");
  assert.equal(signerCalled, false);
});

test("POST /uploads/signed-url validates upload type and MIME type", async () => {
  const app = createTestApp(async () => successfulSigner());

  const invalidType = await request(
    app,
    {
      contentType: "image/png",
      fileName: "file.png",
      type: "documents",
    },
    "super_admin",
  );
  const invalidMime = await request(
    app,
    {
      contentType: "image/gif",
      fileName: "file.gif",
      type: "avatar",
    },
    "super_admin",
  );

  assert.equal(invalidType.status, 400);
  assert.equal(invalidType.body.code, "invalid_upload_type");
  assert.equal(invalidMime.status, 415);
  assert.equal(invalidMime.body.code, "unsupported_media_type");
});

test("POST /uploads/signed-url maps Storage failures to an API error", async () => {
  const app = createTestApp(async () => ({
    data: null,
    error: { message: "Storage unavailable", statusCode: "500" },
  }));
  const originalConsoleError = console.error;
  console.error = () => {};

  try {
    const response = await request(
      app,
      {
        contentType: "image/png",
        fileName: "avatar.png",
        type: "avatar",
      },
      "member",
    );

    assert.equal(response.status, 502);
    assert.equal(response.body.code, "storage_service_error");
  } finally {
    console.error = originalConsoleError;
  }
});
