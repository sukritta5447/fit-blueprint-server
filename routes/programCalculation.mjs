import { Router } from "express";
import authenticate from "../middlewares/authenticate.mjs";
import pool from "../utils/db.mjs";
import { calculateProgram } from "../services/programCalculator.mjs";

const router = Router();
router.use(authenticate);

router.post("/calculate", async (req, res, next) => {
  try {
    const plan = calculateProgram(req.body);
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE member_programs
         SET is_active = false, status = 'archived'
         WHERE user_id = $1 AND is_active = true`,
        [req.auth.userId],
      );

      const result = await client.query(
        `INSERT INTO member_programs (
           user_id, age, weight_kg, height_cm, gender, goal, experience,
           days_per_week, diet, restrictions, workout_plan, nutrition_plan,
           status, is_active, calculated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'active', true, now())
         RETURNING *`,
        [
          req.auth.userId,
          req.body.age,
          req.body.weight_kg,
          req.body.height_cm,
          req.body.gender,
          req.body.goal,
          req.body.experience,
          req.body.days_per_week,
          req.body.diet,
          req.body.restrictions ?? "",
          plan.workout_plan,
          plan.nutrition_plan,
        ],
      );

      await client.query("COMMIT");
      return res.status(201).json({
        data: result.rows[0],
        calculation: plan.calculation,
        assumptions: plan.assumptions,
        warnings: plan.warnings,
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    return next(error);
  }
});

export default router;
