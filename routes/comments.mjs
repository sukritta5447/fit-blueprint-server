import { Router } from "express";
import authenticate from "../middlewares/authenticate.mjs";
import { parsePositiveId, pickBody } from "../utils/api.mjs";
import pool from "../utils/db.mjs";

const router = Router({ mergeParams: true });
const adminRoles = new Set(["content_admin", "support_admin", "super_admin"]);

router.get("/", async (req, res, next) => {
  try {
    const postId = parsePositiveId(req.params.postId, "postId");
    const result = await pool.query(
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
       ORDER BY comments.created_at, comments.id`,
      [postId],
    );
    return res.status(200).json({ data: result.rows });
  } catch (error) {
    return next(error);
  }
});

router.post("/", authenticate, async (req, res, next) => {
  try {
    const postId = parsePositiveId(req.params.postId, "postId");
    const input = pickBody(req.body, ["content", "parent_id"], ["content"]);
    const result = await pool.query(
      `INSERT INTO comments (post_id, author_id, parent_id, content)
       SELECT posts.id, $2, $3, $4
       FROM posts
       JOIN statuses ON statuses.id = posts.status_id
       WHERE posts.id = $1 AND statuses.is_public
       RETURNING *`,
      [postId, req.auth.userId, input.parent_id ?? null, input.content],
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
    const { content } = pickBody(req.body, ["content"], ["content"]);
    const isAdmin = adminRoles.has(req.auth.role);
    const result = await pool.query(
      `UPDATE comments
       SET content = $1
       WHERE id = $2
         AND post_id = $3
         AND NOT is_deleted
         AND (author_id = $4 OR $5)
       RETURNING *`,
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
    const result = await pool.query(
      `UPDATE comments
       SET is_deleted = true, content = '[deleted]'
       WHERE id = $1
         AND post_id = $2
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

export default router;
