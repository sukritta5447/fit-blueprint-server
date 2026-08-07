import { Router } from "express";
import { createClient } from "@supabase/supabase-js";

import authenticate from "../middlewares/authenticate.mjs";
import { authorizeRoles } from "../middlewares/authorizeRoles.mjs";
import pool from "../utils/db.mjs";

const router = Router();
const adminRoles = ["content_admin", "support_admin", "super_admin"];

router.use(authenticate, authorizeRoles(...adminRoles));

router.get("/members", async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT
        p.id,
        p.email,
        p.full_name AS name,
        p.status,
        mp.goal,
        mp.days_per_week,
        mp.workout_plan
      FROM profiles p
      LEFT JOIN LATERAL (
        SELECT goal, days_per_week, workout_plan
        FROM member_programs
        WHERE user_id = p.id AND is_active = true
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      ) mp ON true
      WHERE p.role = 'member'
      ORDER BY p.created_at DESC, p.id
    `);

    return res.json({
      data: result.rows.map((member) => ({
        ...member,
        plan: getPlanLabel(member),
      })),
    });
  } catch (error) {
    return next(error);
  }
});

router.patch("/members/:id/status", async (req, res, next) => {
  const { status } = req.body ?? {};

  if (!["active", "paused", "disabled"].includes(status)) {
    return res.status(400).json({
      code: "invalid_member_status",
      message: "Status must be active, paused, or disabled",
    });
  }

  try {
    const result = await pool.query(
      `UPDATE profiles
       SET status = $1, updated_at = now()
       WHERE id = $2 AND role = 'member'
       RETURNING id, status`,
      [status, req.params.id],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        code: "member_not_found",
        message: "Member not found",
      });
    }

    return res.json({ data: result.rows[0] });
  } catch (error) {
    return next(error);
  }
});

router.delete("/members/:id", async (req, res, next) => {
  if (req.auth.role !== "super_admin") {
    return res.status(403).json({
      code: "super_admin_required",
      message: "Only super admins can delete members",
    });
  }

  try {
    const profileResult = await pool.query(
      "SELECT id FROM profiles WHERE id = $1 AND role = 'member'",
      [req.params.id],
    );

    if (profileResult.rowCount === 0) {
      return res.status(404).json({
        code: "member_not_found",
        message: "Member not found",
      });
    }

    const { error } = await getSupabaseAdminClient().auth.admin.deleteUser(
      req.params.id,
    );

    if (error) throw error;

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

router.get("/admins", async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        email,
        full_name AS name,
        role,
        last_active_at AS "lastActiveAt"
      FROM profiles
      WHERE role IN ('content_admin', 'support_admin', 'super_admin')
      ORDER BY created_at DESC, id
    `);

    return res.json({ data: result.rows });
  } catch (error) {
    return next(error);
  }
});

router.post("/admins", async (req, res, next) => {
  if (req.auth.role !== "super_admin") {
    return res.status(403).json({
      code: "super_admin_required",
      message: "Only super admins can create administrators",
    });
  }

  const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const role = req.body?.role;

  if (
    !email ||
    !name ||
    password.length < 8 ||
    !["content_admin", "support_admin", "super_admin"].includes(role)
  ) {
    return res.status(400).json({
      code: "invalid_admin_input",
      message: "Name, email, password of at least 8 characters, and a valid administrator role are required",
    });
  }

  try {
    const existingProfile = await pool.query(
      "SELECT id FROM profiles WHERE lower(email) = lower($1)",
      [email],
    );

    if (existingProfile.rowCount > 0) {
      return res.status(409).json({
        code: "admin_email_exists",
        message: "An account with this email already exists",
      });
    }

    const { data, error } = await getSupabaseAdminClient().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name },
    });

    if (error || !data.user) throw error ?? new Error("Unable to invite administrator");

    const { data: updatedUser, error: updateError } =
      await getSupabaseAdminClient().auth.admin.updateUserById(data.user.id, {
        app_metadata: {
          ...data.user.app_metadata,
          role,
        },
      });

    if (updateError) {
      await getSupabaseAdminClient().auth.admin.deleteUser(data.user.id);
      throw updateError;
    }

    return res.status(201).json({
      data: {
        id: updatedUser.user.id,
        email: updatedUser.user.email,
        name,
        role,
      },
    });
  } catch (error) {
    return next(error);
  }
});

function getPlanLabel(member) {
  const frequency = member.days_per_week ? `${member.days_per_week}×` : "";
  const focus = member.workout_plan?.focus;

  if (focus === "conditioning") return `Conditioning ${frequency}`.trim();
  if (focus === "strength") return `Strength ${frequency}`.trim();
  return member.workout_plan ? "Personalized" : "Not created";
}

let supabaseAdminClient;

function getSupabaseAdminClient() {
  if (!supabaseAdminClient) {
    const url = process.env.SUPABASE_URL?.trim();
    const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();

    if (!url || !secretKey) {
      throw new Error("Supabase admin credentials are not configured");
    }

    supabaseAdminClient = createClient(url, secretKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });
  }

  return supabaseAdminClient;
}

export default router;
