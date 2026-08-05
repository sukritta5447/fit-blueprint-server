import authenticate from "../middlewares/authenticate.mjs";
import { createSignedUpload } from "../utils/supabaseStorage.mjs";
import { createUploadsRouter } from "./createUploadsRouter.mjs";

const router = createUploadsRouter({
  authenticate,
  createSignedUpload,
});

export default router;
