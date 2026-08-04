import { Router } from "express";
import authenticate from "../middlewares/authenticate.mjs";
import { getPagination, parsePositiveId } from "../utils/api.mjs";
import pool from "../utils/db.mjs";

const router = Router();
router.use(authenticate);

router.get("/", async (req, res, next) => {
  try {
    const { page, limit, offset } = getPagination(req.query);
    const unreadOnly = req.query.unread === "true";
    const unreadCondition = unreadOnly ? "AND read_at IS NULL" : "";
    const [countResult, rowsResult] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS total
         FROM notifications
         WHERE recipient_id = $1 ${unreadCondition}`,
        [req.auth.userId],
      ),
      pool.query(
        `SELECT * FROM notifications
         WHERE recipient_id = $1 ${unreadCondition}
         ORDER BY created_at DESC, id DESC
         LIMIT $2 OFFSET $3`,
        [req.auth.userId, limit, offset],
      ),
    ]);
    const total = countResult.rows[0].total;

    return res.status(200).json({
      data: rowsResult.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.patch("/read-all", async (req, res, next) => {
  try {
    const result = await pool.query(
      `UPDATE notifications
       SET read_at = now()
       WHERE recipient_id = $1 AND read_at IS NULL
       RETURNING id`,
      [req.auth.userId],
    );
    return res.status(200).json({ updated: result.rowCount });
  } catch (error) {
    return next(error);
  }
});

router.patch("/:notificationId/read", async (req, res, next) => {
  try {
    const id = parsePositiveId(req.params.notificationId, "notificationId");
    const result = await pool.query(
      `UPDATE notifications
       SET read_at = COALESCE(read_at, now())
       WHERE id = $1 AND recipient_id = $2
       RETURNING *`,
      [id, req.auth.userId],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        code: "notification_not_found",
        message: "The requested notification was not found",
      });
    }

    return res.status(200).json(result.rows[0]);
  } catch (error) {
    return next(error);
  }
});

export default router;
