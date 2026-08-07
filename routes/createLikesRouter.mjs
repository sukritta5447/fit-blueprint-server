import { Router } from "express";
import { parsePositiveId } from "../utils/api.mjs";

export function createLikesRouter({ authenticate, query }) {
  const router = Router({ mergeParams: true });
  router.use(authenticate);

  router.put("/", async (req, res, next) => {
    try {
      const postId = parsePositiveId(req.params.postId, "postId");
      const result = await query(
        `WITH published_post AS (
           SELECT posts.id
           FROM posts
           JOIN statuses ON statuses.id = posts.status_id
           WHERE posts.id = $1 AND statuses.is_public
         ), inserted AS (
           INSERT INTO post_likes (post_id, user_id)
           SELECT id, $2 FROM published_post
           ON CONFLICT (post_id, user_id) DO NOTHING
           RETURNING post_id
         )
         SELECT
           EXISTS (SELECT 1 FROM published_post) AS post_exists,
           EXISTS (SELECT 1 FROM inserted) AS inserted`,
        [postId, req.auth.userId],
      );

      if (!result.rows[0].post_exists) {
        return res.status(404).json({
          code: "post_not_found",
          message: "The requested published post was not found",
        });
      }

      if (result.rows[0].inserted) {
        await query(
          `INSERT INTO notifications (recipient_id, actor_id, type, post_id, title, body)
           SELECT posts.author_id, $1, 'like', posts.id, 'New article like', 'Someone liked your article'
           FROM posts
           WHERE posts.id = $2
             AND posts.author_id IS NOT NULL
             AND posts.author_id <> $1`,
          [req.auth.userId, postId],
        );
      }

      const countResult = await query(
        "SELECT likes_count FROM posts WHERE id = $1",
        [postId],
      );

      return res.status(result.rows[0].inserted ? 201 : 200).json({
        liked: true,
        likes_count: countResult.rows[0].likes_count,
      });
    } catch (error) {
      return next(error);
    }
  });

  router.delete("/", async (req, res, next) => {
    try {
      const postId = parsePositiveId(req.params.postId, "postId");
      await query(
        `DELETE FROM post_likes
         USING posts, statuses
         WHERE post_likes.post_id = posts.id
           AND posts.status_id = statuses.id
           AND statuses.is_public
           AND post_likes.post_id = $1
           AND post_likes.user_id = $2`,
        [postId, req.auth.userId],
      );
      const countResult = await query(
        `SELECT posts.likes_count
         FROM posts
         JOIN statuses ON statuses.id = posts.status_id
         WHERE posts.id = $1 AND statuses.is_public`,
        [postId],
      );

      if (countResult.rowCount === 0) {
        return res.status(404).json({
          code: "post_not_found",
          message: "The requested published post was not found",
        });
      }

      return res.status(200).json({
        liked: false,
        likes_count: countResult.rows[0].likes_count,
      });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
