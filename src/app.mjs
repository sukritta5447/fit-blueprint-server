import "dotenv/config";
import express from "express";
import cors from "cors";
import authRouter from "../routes/auth.mjs";
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
import statusesRouter from "../routes/statuses.mjs";
import systemRouter from "../routes/system.mjs";
import {
  errorHandler,
  notFoundHandler,
} from "../middlewares/errorHandler.mjs";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use(
  cors({
    allowedHeaders: ["Authorization", "Content-Type"],
    methods: ["DELETE", "GET", "OPTIONS", "PATCH", "POST", "PUT"],
    origin: [
      "http://localhost:5173",
      "http://localhost:3000",
      "https://fit-blueprint-site.vercel.app",
    ],
  }),
);

app.use("/auth", authRouter);
app.use("/categories", categoriesRouter);
app.use("/statuses", statusesRouter);
app.use("/posts/:postId/comments", commentsRouter);
app.use("/posts/:postId/like", likesRouter);
app.use("/posts", postsRouter);
app.use("/notifications", notificationsRouter);
app.use("/programs", programsRouter);
app.use("/workout-logs", workoutLogsRouter);
app.use("/body-measurements", bodyMeasurementsRouter);
app.use("/nutrition-logs", nutritionLogsRouter);
app.use("/personal-records", personalRecordsRouter);
app.use("/", systemRouter);
app.use(notFoundHandler);
app.use(errorHandler);

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

export default app;
