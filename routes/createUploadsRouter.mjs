import { randomUUID } from "node:crypto";
import { Router } from "express";
import { pickBody } from "../utils/api.mjs";
import { HttpError } from "../utils/httpError.mjs";

const CONTENT_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);
const CONTENT_ADMIN_ROLES = new Set(["content_admin", "super_admin"]);
const UPLOAD_TYPES = {
  avatar: "avatars",
  "post-image": "post-images",
};

function getUploadInput(body) {
  const input = pickBody(
    body,
    ["type", "fileName", "contentType"],
    ["type", "fileName", "contentType"],
  );

  if (!UPLOAD_TYPES[input.type]) {
    throw new HttpError(
      400,
      "type must be avatar or post-image",
      "invalid_upload_type",
    );
  }

  if (typeof input.fileName !== "string" || !input.fileName.trim()) {
    throw new HttpError(400, "fileName is required", "invalid_file_name");
  }

  if (input.fileName.length > 255) {
    throw new HttpError(
      400,
      "fileName must be 255 characters or fewer",
      "invalid_file_name",
    );
  }

  const extension = CONTENT_TYPES.get(input.contentType);

  if (!extension) {
    throw new HttpError(
      415,
      "Only JPEG, PNG, and WebP images are supported",
      "unsupported_media_type",
    );
  }

  return {
    bucket: UPLOAD_TYPES[input.type],
    extension,
    type: input.type,
  };
}

function getStorageError(error) {
  const status = Number(error?.statusCode ?? error?.status);

  if (status === 401 || status === 403) {
    return new HttpError(
      403,
      "You do not have permission to upload this file",
      "storage_access_denied",
    );
  }

  return new HttpError(
    502,
    "The storage service could not create an upload URL",
    "storage_service_error",
  );
}

export function createUploadsRouter({
  authenticate,
  createSignedUpload,
  generateId = randomUUID,
}) {
  const router = Router();

  router.post("/signed-url", authenticate, async (req, res, next) => {
    try {
      const input = getUploadInput(req.body);

      if (
        input.type === "post-image" &&
        !CONTENT_ADMIN_ROLES.has(req.auth.role)
      ) {
        return res.status(403).json({
          code: "insufficient_permissions",
          message: "You do not have permission to upload post images",
        });
      }

      const path = `${req.auth.userId}/${generateId()}.${input.extension}`;
      const { data, error } = await createSignedUpload({
        accessToken: req.auth.accessToken,
        bucket: input.bucket,
        path,
      });

      if (error) return next(getStorageError(error));

      return res.status(200).json({
        bucket: input.bucket,
        expiresIn: 7200,
        path,
        publicUrl: data.publicUrl,
        signedUrl: data.signedUrl,
        token: data.token,
      });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
