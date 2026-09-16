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

export function createCommentsRouter({ authenticate, optionalAuthenticate, query }) {
  const router = Router({ mergeParams: true });
  const viewerMiddleware = optionalAuthenticate || ((req, res, next) => next());
  const viewerExpression = optionalAuthenticate
    ? `EXISTS (
               SELECT 1 FROM comment_likes
               WHERE comment_likes.comment_id = comments.id
                 AND comment_likes.user_id = $4
             )`
    : "false";

  router.get("/", viewerMiddleware, async (req, res, next) => {
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
             profiles.avatar_url AS author_avatar_url,
             (SELECT COUNT(comment_likes.comment_id)::int FROM comment_likes WHERE comment_likes.comment_id = comments.id) AS likes_count,
             ${viewerExpression} AS is_liked
           FROM comments
           JOIN profiles ON profiles.id = comments.author_id
           JOIN posts ON posts.id = comments.post_id
           JOIN statuses ON statuses.id = posts.status_id
           WHERE comments.post_id = $1
             AND NOT comments.is_deleted
             AND statuses.is_public
           ORDER BY comments.created_at, comments.id
           LIMIT $2 OFFSET $3`,
          optionalAuthenticate
            ? [postId, limit, offset, req.auth?.userId ?? null]
            : [postId, limit, offset],
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

  router.put("/:commentId/like", authenticate, async (req, res, next) => {
    try {
      const postId = parsePositiveId(req.params.postId, "postId");
      const commentId = parsePositiveId(req.params.commentId, "commentId");
      const result = await query(
        `WITH valid_comment AS (
           SELECT comments.id, comments.author_id
           FROM comments
           JOIN posts ON posts.id = comments.post_id
           JOIN statuses ON statuses.id = posts.status_id
           WHERE comments.id = $1
             AND comments.post_id = $2
             AND NOT comments.is_deleted
             AND statuses.is_public
         ), inserted AS (
           INSERT INTO comment_likes (comment_id, user_id)
           SELECT id, $3 FROM valid_comment
           ON CONFLICT (comment_id, user_id) DO NOTHING
           RETURNING comment_id
         ), notified AS (
           INSERT INTO notifications (recipient_id, actor_id, type, post_id, comment_id, title, body)
           SELECT recipients.recipient_id, $3, 'comment_like', $2, inserted.comment_id,
             'Comment liked', 'Someone liked your comment'
           FROM inserted
           CROSS JOIN LATERAL (
             SELECT valid_comment.author_id AS recipient_id
             FROM valid_comment
             WHERE valid_comment.author_id <> $3
             UNION
             SELECT profiles.id AS recipient_id
             FROM profiles
             WHERE profiles.role IN ('content_admin', 'support_admin', 'super_admin')
               AND profiles.id <> $3
           ) AS recipients
         )
         SELECT
           EXISTS (SELECT 1 FROM valid_comment) AS comment_exists,
           EXISTS (SELECT 1 FROM inserted) AS inserted`,
        [commentId, postId, req.auth.userId],
      );

      if (!result.rows[0].comment_exists) {
        return res.status(404).json({
          code: "comment_not_found",
          message: "The requested comment was not found",
        });
      }

      const countResult = await query(
        "SELECT COUNT(*)::int AS likes_count FROM comment_likes WHERE comment_id = $1",
        [commentId],
      );

      return res.status(result.rows[0].inserted ? 201 : 200).json({
        liked: true,
        likes_count: countResult.rows[0].likes_count,
      });
    } catch (error) {
      return next(error);
    }
  });

  router.delete("/:commentId/like", authenticate, async (req, res, next) => {
    try {
      const postId = parsePositiveId(req.params.postId, "postId");
      const commentId = parsePositiveId(req.params.commentId, "commentId");
      await query(
        `DELETE FROM comment_likes
         USING comments, posts, statuses
         WHERE comment_likes.comment_id = comments.id
           AND comments.post_id = posts.id
           AND posts.status_id = statuses.id
           AND statuses.is_public
           AND comments.id = $1
           AND comments.post_id = $2
           AND comment_likes.user_id = $3`,
        [commentId, postId, req.auth.userId],
      );
      const countResult = await query(
        "SELECT COUNT(*)::int AS likes_count FROM comment_likes WHERE comment_id = $1",
        [commentId],
      );

      return res.status(200).json({
        liked: false,
        likes_count: countResult.rows[0].likes_count,
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
         ), notified AS (
           INSERT INTO notifications (recipient_id, actor_id, type, post_id, comment_id, title, body)
           SELECT DISTINCT recipients.recipient_id, $2, recipients.type, $1, inserted.id,
             CASE recipients.type
               WHEN 'comment_reply' THEN 'New reply to your comment'
               ELSE 'New comment on your article'
             END,
             inserted.content
           FROM inserted
           CROSS JOIN LATERAL (
             SELECT posts.author_id AS recipient_id, 'comment' AS type
             FROM posts
             WHERE posts.id = $1 AND posts.author_id <> $2
             UNION ALL
             SELECT comments.author_id AS recipient_id, 'comment_reply' AS type
             FROM comments
             WHERE comments.id = inserted.parent_id
               AND comments.author_id <> $2
           ) AS recipients
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
