import { Router } from "express";
import authenticate from "../middlewares/authenticate.mjs";
import { buildUpdateClause, pickBody } from "../utils/api.mjs";
import pool from "../utils/db.mjs";

const router = Router();

router.get("/me", authenticate, (req, res) => {
  const { profile } = req.auth;

  return res.status(200).json({
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    username: profile.username,
    avatarUrl: profile.avatar_url,
    role: req.auth.role,
    status: profile.status,
  });
});

router.patch("/me", authenticate, async (req, res, next) => {
  try {
    const input = pickBody(req.body, [
      "full_name",
      "username",
      "bio",
      "avatar_url",
      "last_active_at",
    ]);
    const { assignments, values } = buildUpdateClause(input);
    const result = await pool.query(
      `UPDATE profiles
       SET ${assignments}
       WHERE id = $${values.length + 1}
       RETURNING
         id,
         email,
         full_name AS "fullName",
         username,
         bio,
         avatar_url AS "avatarUrl",
         role,
         status,
         last_active_at AS "lastActiveAt"`,
      [...values, req.auth.userId],
    );

    return res.status(200).json(result.rows[0]);
  } catch (error) {
    return next(error);
  }
});

export default router;
