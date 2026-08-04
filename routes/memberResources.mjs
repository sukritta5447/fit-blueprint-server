import { Router } from "express";
import authenticate from "../middlewares/authenticate.mjs";
import {
  buildUpdateClause,
  getPagination,
  parsePositiveId,
  pickBody,
} from "../utils/api.mjs";
import pool from "../utils/db.mjs";

function createMemberResourceRouter({
  table,
  allowedFields,
  requiredFields,
  orderBy,
}) {
  const router = Router();
  router.use(authenticate);

  router.get("/", async (req, res, next) => {
    try {
      const { page, limit, offset } = getPagination(req.query);
      const [countResult, rowsResult] = await Promise.all([
        pool.query(
          `SELECT COUNT(*)::int AS total FROM ${table} WHERE user_id = $1`,
          [req.auth.userId],
        ),
        pool.query(
          `SELECT * FROM ${table}
           WHERE user_id = $1
           ORDER BY ${orderBy}
           LIMIT $2 OFFSET $3`,
          [req.auth.userId, limit, offset],
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

  router.post("/", async (req, res, next) => {
    try {
      const input = pickBody(req.body, allowedFields, requiredFields);
      const fields = ["user_id", ...Object.keys(input)];
      const values = [req.auth.userId, ...Object.values(input)];
      const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");
      const result = await pool.query(
        `INSERT INTO ${table} (${fields.join(", ")})
         VALUES (${placeholders})
         RETURNING *`,
        values,
      );

      return res.status(201).json(result.rows[0]);
    } catch (error) {
      return next(error);
    }
  });

  router.get("/:id", async (req, res, next) => {
    try {
      const id = parsePositiveId(req.params.id);
      const result = await pool.query(
        `SELECT * FROM ${table} WHERE id = $1 AND user_id = $2`,
        [id, req.auth.userId],
      );

      if (result.rowCount === 0) {
        return res.status(404).json({
          code: "resource_not_found",
          message: "The requested resource was not found",
        });
      }

      return res.status(200).json(result.rows[0]);
    } catch (error) {
      return next(error);
    }
  });

  router.patch("/:id", async (req, res, next) => {
    try {
      const id = parsePositiveId(req.params.id);
      const input = pickBody(req.body, allowedFields);
      const { assignments, values } = buildUpdateClause(input);
      const result = await pool.query(
        `UPDATE ${table}
         SET ${assignments}
         WHERE id = $${values.length + 1}
           AND user_id = $${values.length + 2}
         RETURNING *`,
        [...values, id, req.auth.userId],
      );

      if (result.rowCount === 0) {
        return res.status(404).json({
          code: "resource_not_found",
          message: "The requested resource was not found",
        });
      }

      return res.status(200).json(result.rows[0]);
    } catch (error) {
      return next(error);
    }
  });

  router.delete("/:id", async (req, res, next) => {
    try {
      const id = parsePositiveId(req.params.id);
      const result = await pool.query(
        `DELETE FROM ${table} WHERE id = $1 AND user_id = $2 RETURNING id`,
        [id, req.auth.userId],
      );

      if (result.rowCount === 0) {
        return res.status(404).json({
          code: "resource_not_found",
          message: "The requested resource was not found",
        });
      }

      return res.status(204).send();
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

export const programsRouter = createMemberResourceRouter({
  table: "member_programs",
  allowedFields: [
    "age",
    "weight_kg",
    "height_cm",
    "gender",
    "goal",
    "experience",
    "days_per_week",
    "diet",
    "restrictions",
    "workout_plan",
    "nutrition_plan",
    "status",
    "is_active",
  ],
  requiredFields: [
    "age",
    "weight_kg",
    "height_cm",
    "gender",
    "goal",
    "experience",
    "days_per_week",
    "diet",
  ],
  orderBy: "created_at DESC, id DESC",
});

export const workoutLogsRouter = createMemberResourceRouter({
  table: "workout_logs",
  allowedFields: [
    "program_id",
    "workout_date",
    "session_name",
    "duration_minutes",
    "completed",
    "notes",
  ],
  requiredFields: ["session_name"],
  orderBy: "workout_date DESC, id DESC",
});

export const bodyMeasurementsRouter = createMemberResourceRouter({
  table: "body_measurements",
  allowedFields: [
    "measured_on",
    "weight_kg",
    "body_fat_percent",
    "waist_cm",
    "notes",
  ],
  requiredFields: [],
  orderBy: "measured_on DESC, id DESC",
});

export const nutritionLogsRouter = createMemberResourceRouter({
  table: "nutrition_logs",
  allowedFields: [
    "logged_on",
    "calories",
    "protein_g",
    "carbs_g",
    "fat_g",
    "notes",
  ],
  requiredFields: [],
  orderBy: "logged_on DESC, id DESC",
});

export const personalRecordsRouter = createMemberResourceRouter({
  table: "personal_records",
  allowedFields: [
    "exercise_name",
    "value",
    "unit",
    "achieved_on",
    "notes",
  ],
  requiredFields: ["exercise_name", "value", "unit"],
  orderBy: "achieved_on DESC, id DESC",
});
