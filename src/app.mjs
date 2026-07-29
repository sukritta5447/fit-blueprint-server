import "dotenv/config";
import express from "express";
import cors from "cors";
import postsRouter from "../routes/posts.mjs";
import systemRouter from "../routes/system.mjs";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:3000",
      "https://fit-blueprint-site.vercel.app",
    ],
  }),
);

app.use("/posts", postsRouter);
app.use("/", systemRouter);

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

export default app;
