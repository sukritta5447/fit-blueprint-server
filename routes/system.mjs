import { Router } from "express";
import pool from "../utils/db.mjs";

const router = Router();

router.get("/", (req, res) => {
  return res.json({
    message: "Testing the API successfully",
  });
});

router.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    return res.status(200).json({
      status: "ok",
      database: "connected",
    });
  } catch (error) {
    console.error("Database health check failed:", error);

    return res.status(503).json({
      status: "error",
      database: "disconnected",
    });
  }
});

export default router;
