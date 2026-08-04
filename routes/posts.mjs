import { Router } from "express";
import authenticate from "../middlewares/authenticate.mjs";
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

const postSelect = `
  SELECT
    posts.id,
    posts.image,
    posts.slug,
    posts.category_id,
    categories.name AS category,
    posts.title,
    posts.description,
    posts.date,
    posts.published_at,
    posts.content,
    posts.status_id,
    statuses.status,
    posts.likes_count,
    posts.created_at,
    posts.updated_at
  FROM posts
  JOIN categories ON posts.category_id = categories.id
  JOIN statuses ON posts.status_id = statuses.id
`;

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

      return res.status(201).json(result.rows[0]);
    } catch (error) {
      return next(error);
    }
  },
);

router.get("/", async (req, res, next) => {
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
    const listValues = [...values, limit, offset];
    const postsResult = await pool.query(
      `${postSelect}
       ${whereClause}
       ORDER BY posts.date DESC, posts.id DESC
       LIMIT $${values.length + 1}
       OFFSET $${values.length + 2}`,
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
        `${postSelect}
         ORDER BY posts.updated_at DESC, posts.id DESC`,
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
      const result = await pool.query(`${postSelect} WHERE posts.id = $1`, [
        postId,
      ]);

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

router.get("/:postId", async (req, res, next) => {
  try {
    const postId = parsePositiveId(req.params.postId, "postId");
    const result = await pool.query(
      `${postSelect}
       WHERE posts.id = $1
         AND statuses.is_public = true`,
      [postId],
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
