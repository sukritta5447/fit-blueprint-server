import { pickBody } from "../utils/api.mjs";

export const postFields = [
  "title",
  "slug",
  "image",
  "category_id",
  "description",
  "content",
  "status_id",
  "date",
  "published_at",
];

const requiredPostFields = [
  "title",
  "category_id",
  "description",
  "content",
  "status_id",
];

export function validatePost({ partial = false } = {}) {
  return function validate(req, res, next) {
    try {
      req.validatedBody = pickBody(
        req.body,
        postFields,
        partial ? [] : requiredPostFields,
      );
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export default validatePost();
