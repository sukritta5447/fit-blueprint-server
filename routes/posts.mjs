import { Router } from "express";
import authenticate, {
  optionalAuthenticate,
} from "../middlewares/authenticate.mjs";
import { authorizeRoles } from "../middlewares/authorizeRoles.mjs";
import validatePost, {
  postFields,
  validatePost as createPostValidator,
} from "../middlewares/validatePost.mjs";
import {
  buildUpdateClause,
  getPagination,
  parsePositiveId,
} from "../utils/api.mjs";
import pool from "../utils/db.mjs";

const router = Router();
const authorizeContentAdmin = authorizeRoles("content_admin", "super_admin");

function getPostSelect(likedByPlaceholder) {
  const isLikedExpression = likedByPlaceholder
    ? `EXISTS (
        SELECT 1
        FROM post_likes
        WHERE post_likes.post_id = posts.id
          AND post_likes.user_id = ${likedByPlaceholder}
      )`
    : "false";

  return `
  SELECT
    posts.id,
    posts.image,
    posts.slug,
    posts.category_id,
    categories.name AS category,
    COALESCE(
      NULLIF(BTRIM(profiles.full_name), ''),
      profiles.username,
      'JB Fit Blueprint'
    ) AS author,
    profiles.avatar_url AS author_avatar_url,
    profiles.bio AS author_bio,
    posts.title,
    posts.description,
    posts.date,
    posts.published_at,
    posts.content,
    posts.status_id,
    statuses.status,
    posts.likes_count,
    ${isLikedExpression} AS is_liked,
    posts.created_at,
    posts.updated_at
  FROM posts
  JOIN categories ON posts.category_id = categories.id
  JOIN statuses ON posts.status_id = statuses.id
  LEFT JOIN profiles ON posts.author_id = profiles.id
`;
}

router.post(
  "/",
  authenticate,
  authorizeContentAdmin,
  validatePost,
  async (req, res, next) => {
    try {
      const input = req.validatedBody;
      const fields = ["author_id", ...Object.keys(input)];
      const values = [req.auth.userId, ...Object.values(input)];
      const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
      const result = await pool.query(
        `INSERT INTO posts (${fields.join(", ")})
         VALUES (${placeholders})
         RETURNING *`,
        values,
      );

      if (result.rows[0].published_at) {
        await pool.query(
          `INSERT INTO notifications (recipient_id, actor_id, type, post_id, title, body)
           SELECT profiles.id, $1, 'publish', $2, 'New article published', $3
           FROM profiles
           WHERE profiles.id <> $1`,
          [req.auth.userId, result.rows[0].id, result.rows[0].title],
        );
        await pool.query(
          `INSERT INTO notifications (recipient_id, actor_id, type, post_id, title, body)
           VALUES ($1, $1, 'publish', $2, 'Post published successfully', $3)`,
          [req.auth.userId, result.rows[0].id, result.rows[0].title],
        );
      }

      return res.status(201).json(result.rows[0]);
    } catch (error) {
      return next(error);
    }
  },
);

router.get("/", optionalAuthenticate, async (req, res, next) => {
  const { page: currentPage, limit, offset } = getPagination(req.query, 6);
  const values = [];
  const conditions = ["statuses.is_public = true"];

  if (req.query.category) {
    values.push(req.query.category);
    conditions.push(`categories.slug = $${values.length}`);
  }

  if (req.query.keyword) {
    values.push(`%${req.query.keyword}%`);
    conditions.push(`(
      posts.title ILIKE $${values.length}
      OR posts.description ILIKE $${values.length}
      OR posts.content ILIKE $${values.length}
    )`);
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  try {
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM posts
       JOIN categories ON posts.category_id = categories.id
       JOIN statuses ON posts.status_id = statuses.id
       ${whereClause}`,
      values,
    );

    const totalPosts = countResult.rows[0].total;
    const totalPages = Math.ceil(totalPosts / limit);
    const listValues = [...values];
    const likedByPlaceholder = req.auth
      ? `$${listValues.push(req.auth.userId)}`
      : null;
    listValues.push(limit, offset);
    const postsResult = await pool.query(
      `${getPostSelect(likedByPlaceholder)}
       ${whereClause}
       ORDER BY posts.date DESC, posts.id DESC
       LIMIT $${listValues.length - 1}
       OFFSET $${listValues.length}`,
      listValues,
    );

    return res.status(200).json({
      totalPosts,
      totalPages,
      currentPage,
      limit,
      posts: postsResult.rows,
      nextPage: currentPage < totalPages ? currentPage + 1 : null,
    });
  } catch (error) {
    return next(error);
  }
});

router.get(
  "/manage",
  authenticate,
  authorizeContentAdmin,
  async (req, res, next) => {
    try {
      const result = await pool.query(
        `${getPostSelect("$1")}
         ORDER BY posts.updated_at DESC, posts.id DESC`,
        [req.auth.userId],
      );
      return res.status(200).json({ data: result.rows });
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  "/manage/:postId",
  authenticate,
  authorizeContentAdmin,
  async (req, res, next) => {
    try {
      const postId = parsePositiveId(req.params.postId, "postId");
      const result = await pool.query(
        `${getPostSelect("$2")} WHERE posts.id = $1`,
        [postId, req.auth.userId],
      );

      if (result.rowCount === 0) {
        return res.status(404).json({
          code: "post_not_found",
          message: "The requested post was not found",
        });
      }

      return res.status(200).json(result.rows[0]);
    } catch (error) {
      return next(error);
    }
  },
);

router.get("/:postId", optionalAuthenticate, async (req, res, next) => {
  try {
    const postId = parsePositiveId(req.params.postId, "postId");
    const values = [postId];
    const likedByPlaceholder = req.auth
      ? `$${values.push(req.auth.userId)}`
      : null;
    const result = await pool.query(
      `${getPostSelect(likedByPlaceholder)}
       WHERE posts.id = $1
         AND statuses.is_public = true`,
      values,
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "Server could not find a requested post",
      });
    }

    return res.status(200).json(result.rows[0]);
  } catch (error) {
    return next(error);
  }
});

router.patch(
  "/:postId",
  authenticate,
  authorizeContentAdmin,
  createPostValidator({ partial: true }),
  async (req, res, next) => {
    try {
      const postId = parsePositiveId(req.params.postId, "postId");
      const previousResult = await pool.query(
        `SELECT posts.published_at, statuses.is_public
         FROM posts
         JOIN statuses ON statuses.id = posts.status_id
         WHERE posts.id = $1`,
        [postId],
      );
      const input = Object.fromEntries(
        postFields
          .filter((field) => req.validatedBody[field] !== undefined)
          .map((field) => [field, req.validatedBody[field]]),
      );
      const { assignments, values } = buildUpdateClause(input);
      const result = await pool.query(
        `UPDATE posts
         SET ${assignments}
         WHERE id = $${values.length + 1}
         RETURNING *`,
        [...values, postId],
      );

      if (result.rowCount === 0) {
        return res.status(404).json({
          message: "Server could not find a requested post to update",
        });
      }

      const wasPublic = previousResult.rows[0]?.is_public === true;
      const currentStatusResult = await pool.query(
        "SELECT is_public FROM statuses WHERE id = $1",
        [result.rows[0].status_id],
      );
      const isNowPublic = currentStatusResult.rows[0]?.is_public === true;
      if (!wasPublic && isNowPublic) {
        await pool.query(
          `INSERT INTO notifications (recipient_id, actor_id, type, post_id, title, body)
           SELECT profiles.id, $1, 'publish', $2, 'New article published', $3
           FROM profiles
           WHERE profiles.id <> $1`,
          [req.auth.userId, result.rows[0].id, result.rows[0].title],
        );
        await pool.query(
          `INSERT INTO notifications (recipient_id, actor_id, type, post_id, title, body)
           VALUES ($1, $1, 'publish', $2, 'Post published successfully', $3)`,
          [req.auth.userId, result.rows[0].id, result.rows[0].title],
        );
      }

      return res.status(200).json(result.rows[0]);
    } catch (error) {
      return next(error);
    }
  },
);

router.delete(
  "/:postId",
  authenticate,
  authorizeContentAdmin,
  async (req, res, next) => {
    try {
      const postId = parsePositiveId(req.params.postId, "postId");
      const result = await pool.query(
        "DELETE FROM posts WHERE id = $1 RETURNING id",
        [postId],
      );

      if (result.rowCount === 0) {
        return res.status(404).json({
          message: "Server could not find a requested post to delete",
        });
      }

      return res.status(200).json({
        message: "Deleted post successfully",
      });
    } catch (error) {
      return next(error);
    }
  },
);

export default router;
