import { Router } from "express";
import pool from "../utils/db.mjs";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, status, label, is_public, sort_order
       FROM statuses
       ORDER BY sort_order, id`,
    );
    return res.status(200).json({ data: result.rows });
  } catch (error) {
    return next(error);
  }
});

export default router;
