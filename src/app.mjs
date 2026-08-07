import "dotenv/config";
import express from "express";
import cors from "cors";
import authRouter from "../routes/auth.mjs";
import adminDirectoryRouter from "../routes/adminDirectory.mjs";
import categoriesRouter from "../routes/categories.mjs";
import commentsRouter from "../routes/comments.mjs";
import likesRouter from "../routes/likes.mjs";
import {
  bodyMeasurementsRouter,
  nutritionLogsRouter,
  personalRecordsRouter,
  programsRouter,
  workoutLogsRouter,
} from "../routes/memberResources.mjs";
import notificationsRouter from "../routes/notifications.mjs";
import postsRouter from "../routes/posts.mjs";
import programCalculationRouter from "../routes/programCalculation.mjs";
import publicProfileRouter from "../routes/publicProfile.mjs";
import statusesRouter from "../routes/statuses.mjs";
import systemRouter from "../routes/system.mjs";
import uploadsRouter from "../routes/uploads.mjs";
import {
  errorHandler,
  notFoundHandler,
} from "../middlewares/errorHandler.mjs";

const app = express();
const PORT = process.env.PORT || 3000;
const configuredCorsOrigins = new Set(
  (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

const defaultCorsOrigins = new Set([
  "http://localhost:5173",
  "http://localhost:3000",
  "https://fit-blueprint-site.vercel.app",
]);

function isAllowedCorsOrigin(origin) {
  if (!origin) return true;
  if (configuredCorsOrigins.has(origin) || defaultCorsOrigins.has(origin)) {
    return true;
  }

  return /^https:\/\/fit-blueprint-site(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(
    origin,
  );
}

app.use(express.json());

app.use(
  cors({
    allowedHeaders: ["Authorization", "Content-Type"],
    methods: ["DELETE", "GET", "OPTIONS", "PATCH", "POST", "PUT"],
    origin(origin, callback) {
      const allowed = isAllowedCorsOrigin(origin);
      console.info("CORS preflight check", { origin: origin ?? null, allowed });
      callback(null, allowed);
    },
  }),
);

app.use("/auth", authRouter);
app.use("/admin", adminDirectoryRouter);
app.use("/categories", categoriesRouter);
app.use("/statuses", statusesRouter);
app.use("/posts/:postId/comments", commentsRouter);
app.use("/posts/:postId/like", likesRouter);
app.use("/posts", postsRouter);
app.use("/public-profiles", publicProfileRouter);
app.use("/notifications", notificationsRouter);
app.use("/programs", programCalculationRouter);
app.use("/programs", programsRouter);
app.use("/workout-logs", workoutLogsRouter);
app.use("/body-measurements", bodyMeasurementsRouter);
app.use("/nutrition-logs", nutritionLogsRouter);
app.use("/personal-records", personalRecordsRouter);
app.use("/uploads", uploadsRouter);
app.use("/", systemRouter);
app.use(notFoundHandler);
app.use(errorHandler);

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

export default app;
