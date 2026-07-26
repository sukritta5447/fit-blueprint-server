import * as pg from "pg";
const { pool } = pg.default;

const pool = new pool({
    connectionString: process.env.DATABASE_URL,
});

export default pool;