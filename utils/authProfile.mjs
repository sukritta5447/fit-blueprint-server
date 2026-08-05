export async function findAuthProfile(userId) {
  const { default: pool } = await import("./db.mjs");
  const result = await pool.query(
    `SELECT
       id,
       email,
       full_name,
       username,
       avatar_url,
       role,
       status
     FROM profiles
     WHERE id = $1`,
    [userId],
  );

  return result.rows[0] ?? null;
}
