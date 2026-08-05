import { Router } from "express";
import { HttpError } from "../utils/httpError.mjs";
import {
  getPagination,
  parsePositiveId,
  pickBody,
} from "../utils/api.mjs";

const adminRoles = new Set(["content_admin", "support_admin", "super_admin"]);

function validateContent(content) {
  if (typeof content !== "string" || content.trim() === "") {
    throw new HttpError(
      400,
      "content must be a non-empty string",
      "invalid_comment_content",
    );
  }

  return content.trim();
}

export function createCommentsRouter({ authenticate, query }) {
  const router = Router({ mergeParams: true });

  router.get("/", async (req, res, next) => {
    try {
      const postId = parsePositiveId(req.params.postId, "postId");
      const { page, limit, offset } = getPagination(req.query);
      const [countResult, rowsResult] = await Promise.all([
        query(
          `SELECT COUNT(*)::int AS total
           FROM comments
           JOIN posts ON posts.id = comments.post_id
           JOIN statuses ON statuses.id = posts.status_id
           WHERE comments.post_id = $1
             AND NOT comments.is_deleted
             AND statuses.is_public`,
          [postId],
        ),
        query(
          `SELECT
             comments.id,
             comments.parent_id,
             comments.content,
             comments.created_at,
             comments.updated_at,
             profiles.id AS author_id,
             profiles.full_name AS author_name,
             profiles.avatar_url AS author_avatar_url
           FROM comments
           JOIN profiles ON profiles.id = comments.author_id
           JOIN posts ON posts.id = comments.post_id
           JOIN statuses ON statuses.id = posts.status_id
           WHERE comments.post_id = $1
             AND NOT comments.is_deleted
             AND statuses.is_public
           ORDER BY comments.created_at, comments.id
           LIMIT $2 OFFSET $3`,
          [postId, limit, offset],
        ),
      ]);
      const total = countResult.rows[0].total;

      return res.status(200).json({
        data: rowsResult.rows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/", authenticate, async (req, res, next) => {
    try {
      const postId = parsePositiveId(req.params.postId, "postId");
      const input = pickBody(req.body, ["content", "parent_id"], ["content"]);
      const content = validateContent(input.content);
      const parentId =
        input.parent_id === undefined || input.parent_id === null
          ? null
          : parsePositiveId(input.parent_id, "parent_id");
      const result = await query(
        `WITH inserted AS (
           INSERT INTO comments (post_id, author_id, parent_id, content)
           SELECT posts.id, $2, $3, $4
           FROM posts
           JOIN statuses ON statuses.id = posts.status_id
           WHERE posts.id = $1 AND statuses.is_public
           RETURNING *
         )
         SELECT
           inserted.id,
           inserted.parent_id,
           inserted.content,
           inserted.created_at,
           inserted.updated_at,
           profiles.id AS author_id,
           profiles.full_name AS author_name,
           profiles.avatar_url AS author_avatar_url
         FROM inserted
         JOIN profiles ON profiles.id = inserted.author_id`,
        [postId, req.auth.userId, parentId, content],
      );

      if (result.rowCount === 0) {
        return res.status(404).json({
          code: "post_not_found",
          message: "The requested published post was not found",
        });
      }

      return res.status(201).json(result.rows[0]);
    } catch (error) {
      return next(error);
    }
  });

  router.patch("/:commentId", authenticate, async (req, res, next) => {
    try {
      const postId = parsePositiveId(req.params.postId, "postId");
      const commentId = parsePositiveId(req.params.commentId, "commentId");
      const input = pickBody(req.body, ["content"], ["content"]);
      const content = validateContent(input.content);
      const isAdmin = adminRoles.has(req.auth.role);
      const result = await query(
        `WITH updated AS (
           UPDATE comments
           SET content = $1
           WHERE id = $2
             AND post_id = $3
             AND NOT is_deleted
             AND (author_id = $4 OR $5)
           RETURNING *
         )
         SELECT
           updated.id,
           updated.parent_id,
           updated.content,
           updated.created_at,
           updated.updated_at,
           profiles.id AS author_id,
           profiles.full_name AS author_name,
           profiles.avatar_url AS author_avatar_url
         FROM updated
         JOIN profiles ON profiles.id = updated.author_id`,
        [content, commentId, postId, req.auth.userId, isAdmin],
      );

      if (result.rowCount === 0) {
        return res.status(404).json({
          code: "comment_not_found",
          message: "The requested comment was not found",
        });
      }

      return res.status(200).json(result.rows[0]);
    } catch (error) {
      return next(error);
    }
  });

  router.delete("/:commentId", authenticate, async (req, res, next) => {
    try {
      const postId = parsePositiveId(req.params.postId, "postId");
      const commentId = parsePositiveId(req.params.commentId, "commentId");
      const isAdmin = adminRoles.has(req.auth.role);
      const result = await query(
        `UPDATE comments
         SET is_deleted = true, content = '[deleted]'
         WHERE id = $1
           AND post_id = $2
           AND NOT is_deleted
           AND (author_id = $3 OR $4)
         RETURNING id`,
        [commentId, postId, req.auth.userId, isAdmin],
      );

      if (result.rowCount === 0) {
        return res.status(404).json({
          code: "comment_not_found",
          message: "The requested comment was not found",
        });
      }

      return res.status(204).send();
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
