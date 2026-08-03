import * as pg from "pg";
const { Pool } = pg.default;

if (!process.env.CONNECTION_STRING) {
  throw new Error("CONNECTION_STRING is required");
}

const databaseUrl = new URL(process.env.CONNECTION_STRING);
const isLocalDatabase = ["localhost", "127.0.0.1"].includes(
  databaseUrl.hostname,
);

const pool = new Pool({
  connectionString: process.env.CONNECTION_STRING,
  ssl: isLocalDatabase ? false : { rejectUnauthorized: false },
});

export default pool;
