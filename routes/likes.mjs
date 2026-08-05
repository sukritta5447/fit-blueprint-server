import authenticate from "../middlewares/authenticate.mjs";
import pool from "../utils/db.mjs";
import { createLikesRouter } from "./createLikesRouter.mjs";

const router = createLikesRouter({
  authenticate,
  query: pool.query.bind(pool),
});

export default router;
