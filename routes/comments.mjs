import authenticate, {
  optionalAuthenticate,
} from "../middlewares/authenticate.mjs";
import pool from "../utils/db.mjs";
import { createCommentsRouter } from "./createCommentsRouter.mjs";

const router = createCommentsRouter({
  authenticate,
  optionalAuthenticate,
  query: pool.query.bind(pool),
});

export default router;
