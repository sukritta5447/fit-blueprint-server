import authenticate from "../middlewares/authenticate.mjs";
import { authorizeRoles } from "../middlewares/authorizeRoles.mjs";
import pool from "../utils/db.mjs";
import { createCategoriesRouter } from "./createCategoriesRouter.mjs";

const authorizeContentAdmin = authorizeRoles("content_admin", "super_admin");
const router = createCategoriesRouter({
  authenticate,
  authorizeContentAdmin,
  query: pool.query.bind(pool),
});

export default router;
