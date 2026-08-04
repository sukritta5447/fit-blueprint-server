import { Router } from "express";
import authenticate from "../middlewares/authenticate.mjs";
import { authorizeRoles } from "../middlewares/authorizeRoles.mjs";
import {
  buildUpdateClause,
  parsePositiveId,
  pickBody,
} from "../utils/api.mjs";
import pool from "../utils/db.mjs";

const router = Router();
const authorizeContentAdmin = authorizeRoles("content_admin", "super_admin");
const fields = ["name", "slug", "description", "is_active"];

router.get("/", async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, name, slug, description
       FROM categories
       WHERE is_active
       ORDER BY name`,
    );
    return res.status(200).json({ data: result.rows });
  } catch (error) {
    return next(error);
  }
});

router.get("/:categoryId", async (req, res, next) => {
  try {
    const id = parsePositiveId(req.params.categoryId, "categoryId");
    const result = await pool.query(
      `SELECT id, name, slug, description
       FROM categories
       WHERE id = $1 AND is_active`,
      [id],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        code: "category_not_found",
        message: "The requested category was not found",
      });
    }

    return res.status(200).json(result.rows[0]);
  } catch (error) {
    return next(error);
  }
});

router.post("/", authenticate, authorizeContentAdmin, async (req, res, next) => {
  try {
    const input = pickBody(req.body, fields, ["name", "slug"]);
    const result = await pool.query(
      `INSERT INTO categories (name, slug, description, is_active, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        input.name,
        input.slug,
        input.description ?? "",
        input.is_active ?? true,
        req.auth.userId,
      ],
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    return next(error);
  }
});

router.patch(
  "/:categoryId",
  authenticate,
  authorizeContentAdmin,
  async (req, res, next) => {
    try {
      const id = parsePositiveId(req.params.categoryId, "categoryId");
      const input = pickBody(req.body, fields);
      const { assignments, values } = buildUpdateClause(input);
      const result = await pool.query(
        `UPDATE categories SET ${assignments}
         WHERE id = $${values.length + 1}
         RETURNING *`,
        [...values, id],
      );

      if (result.rowCount === 0) {
        return res.status(404).json({
          code: "category_not_found",
          message: "The requested category was not found",
        });
      }

      return res.status(200).json(result.rows[0]);
    } catch (error) {
      return next(error);
    }
  },
);

router.delete(
  "/:categoryId",
  authenticate,
  authorizeContentAdmin,
  async (req, res, next) => {
    try {
      const id = parsePositiveId(req.params.categoryId, "categoryId");
      const result = await pool.query(
        "DELETE FROM categories WHERE id = $1 RETURNING id",
        [id],
      );

      if (result.rowCount === 0) {
        return res.status(404).json({
          code: "category_not_found",
          message: "The requested category was not found",
        });
      }

      return res.status(204).send();
    } catch (error) {
      return next(error);
    }
  },
);

export default router;
