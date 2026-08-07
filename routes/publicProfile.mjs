import { Router } from "express";

import pool from "../utils/db.mjs";

const router = Router();

router.get("/admin", async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT
        full_name AS "fullName",
        username,
        bio,
        avatar_url AS "avatarUrl",
        role
      FROM profiles
      WHERE role IN ('content_admin', 'support_admin', 'super_admin')
        AND status = 'active'
      ORDER BY
        CASE role
          WHEN 'super_admin' THEN 0
          WHEN 'content_admin' THEN 1
          ELSE 2
        END,
        created_at ASC,
        id ASC
      LIMIT 1
    `);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Admin profile not found" });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    return next(error);
  }
});

export default router;
