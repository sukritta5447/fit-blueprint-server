import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import pool from "../utils/db.mjs";

const VALID_ROLES = new Set([
  "member",
  "content_admin",
  "support_admin",
  "super_admin",
]);

function getRequiredEnvironmentValue(key) {
  const value = process.env[key]?.trim();

  if (!value) {
    throw new Error(`${key} is required`);
  }

  return value;
}

async function setUserRole(email, role) {
  if (!email || !role) {
    throw new Error(
      "Usage: npm run set-user-role -- <email> <member|content_admin|support_admin|super_admin>",
    );
  }

  if (!VALID_ROLES.has(role)) {
    throw new Error(`Unsupported role: ${role}`);
  }

  const profileResult = await pool.query(
    "SELECT id FROM profiles WHERE lower(email) = lower($1)",
    [email.trim()],
  );
  const profile = profileResult.rows[0];

  if (!profile) {
    throw new Error(`No Supabase user was found for ${email}`);
  }

  const supabaseAdmin = createClient(
    getRequiredEnvironmentValue("SUPABASE_URL"),
    getRequiredEnvironmentValue("SUPABASE_SECRET_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );

  const { data: userData, error: getUserError } =
    await supabaseAdmin.auth.admin.getUserById(profile.id);

  if (getUserError || !userData.user) {
    throw getUserError ?? new Error("Supabase Auth user is unavailable");
  }

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
    profile.id,
    {
      app_metadata: {
        ...userData.user.app_metadata,
        role,
      },
    },
  );

  if (updateError) throw updateError;

  console.log(`Updated ${email} to role ${role}`);
}

const [email, role] = process.argv.slice(2);

try {
  await setUserRole(email, role);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
