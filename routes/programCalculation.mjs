import { Router } from "express";
import authenticate from "../middlewares/authenticate.mjs";
import pool from "../utils/db.mjs";
import { personalizeProgram } from "../services/aiProgramService.mjs";
import { calculateProgram } from "../services/programCalculator.mjs";

const router = Router();
router.use(authenticate);

router.post("/calculate", async (req, res, next) => {
  try {
    const plan = calculateProgram(req.body);
    let generatedPlan = plan;

    try {
      const aiPlan = await personalizeProgram(req.body, plan);

      if (aiPlan) {
        generatedPlan = {
          ...plan,
          workout_plan: {
            ...plan.workout_plan,
            ...aiPlan.workout_plan,
          },
          nutrition_plan: {
            ...plan.nutrition_plan,
            ...aiPlan.nutrition_plan,
            daily_calories: plan.calculation.daily_calories,
            macros: plan.calculation.macros,
          },
          ai_explanation: aiPlan.explanation,
        };
      }
    } catch (error) {
      console.warn("AI program personalization failed; using rule-based plan", {
        message: error.message,
      });
    }

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
          generatedPlan.workout_plan,
          generatedPlan.nutrition_plan,
        ],
      );

      await client.query("COMMIT");
      return res.status(201).json({
        data: result.rows[0],
        calculation: plan.calculation,
        assumptions: generatedPlan.assumptions,
        warnings: generatedPlan.warnings,
        ai_explanation: generatedPlan.ai_explanation ?? null,
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
