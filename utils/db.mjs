import * as pg from "pg";
const { Pool } = pg.default;

const connectionString =
  process.env.CONNECTION_STRING?.trim() || process.env.DATABASE_URL?.trim();

if (!connectionString) {
  throw new Error("CONNECTION_STRING or DATABASE_URL is required");
}

const databaseUrl = new URL(connectionString);
const isLocalDatabase = ["localhost", "127.0.0.1"].includes(
  databaseUrl.hostname,
);

const pool = new Pool({
  connectionString,
  ssl: isLocalDatabase ? false : { rejectUnauthorized: false },
});

export default pool;
