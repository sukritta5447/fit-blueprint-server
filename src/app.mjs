import "dotenv/config";
import express from "express";
import cors from "cors";
import pool from "../utils/db.mjs";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://fit-blueprint-site.vercel.app"
    ],
  }),
);
app.use(express.json());

const postSelect = `
  SELECT
    posts.id,
    posts.image,
    categories.name AS category,
    posts.title,
    posts.description,
    posts.date,
    posts.content,
    statuses.status,
    posts.likes_count
  FROM posts
  JOIN categories ON posts.category_id = categories.id
  JOIN statuses ON posts.status_id = statuses.id
`;

const isValidPostId = (postId) =>
  Number.isInteger(Number(postId)) && Number(postId) > 0;

app.post("/posts", async (req, res) => {
  const { title, image, category_id, description, content, status_id } =
    req.body;

  if (
    !title ||
    !image ||
    !category_id ||
    !description ||
    !content ||
    !status_id
  ) {
    return res.status(400).json({
      message:
        "Server could not create post because there are missing data from client",
    });
  }

  try {
    await pool.query(
      `INSERT INTO posts
        (title, image, category_id, description, content, status_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [title, image, category_id, description, content, status_id],
    );

    return res.status(201).json({
      message: "Created post sucessfully",
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Server could not create post because database connection",
    });
  }
});

app.get("/posts", async (req, res) => {
  const requestedPage = Number.parseInt(req.query.page, 10);
  const requestedLimit = Number.parseInt(req.query.limit, 10);
  const currentPage = requestedPage > 0 ? requestedPage : 1;
  const limit = requestedLimit > 0 ? requestedLimit : 6;
  const offset = (currentPage - 1) * limit;
  const values = [];
  const conditions = [];

  if (req.query.category) {
    values.push(req.query.category);
    conditions.push(`categories.name = $${values.length}`);
  }

  if (req.query.keyword) {
    values.push(`%${req.query.keyword}%`);
    conditions.push(`(
      posts.title ILIKE $${values.length}
      OR posts.description ILIKE $${values.length}
      OR posts.content ILIKE $${values.length}
    )`);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM posts
       JOIN categories ON posts.category_id = categories.id
       ${whereClause}`,
      values,
    );

    const totalPosts = countResult.rows[0].total;
    const totalPages = Math.ceil(totalPosts / limit);
    const listValues = [...values, limit, offset];
    const postsResult = await pool.query(
      `${postSelect}
       ${whereClause}
       ORDER BY posts.date DESC
       LIMIT $${values.length + 1}
       OFFSET $${values.length + 2}`,
      listValues,
    );

    return res.status(200).json({
      totalPosts,
      totalPages,
      currentPage,
      limit,
      posts: postsResult.rows,
      nextPage: currentPage < totalPages ? currentPage + 1 : null,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Server could not read post because database connection",
    });
  }
});

app.get("/posts/:postId", async (req, res) => {
  const { postId } = req.params;

  if (!isValidPostId(postId)) {
    return res.status(404).json({
      message: "Server could not find a requested post",
    });
  }

  try {
    const result = await pool.query(
      `${postSelect}
       WHERE posts.id = $1`,
      [postId],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "Server could not find a requested post",
      });
    }

    return res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Server could not read post because database connection",
    });
  }
});

app.put("/posts/:postId", async (req, res) => {
  const { postId } = req.params;
  const { title, image, category_id, description, content, status_id } =
    req.body;

  if (!isValidPostId(postId)) {
    return res.status(404).json({
      message: "Server could not find a requested post to update",
    });
  }

  if (
    !title ||
    !image ||
    !category_id ||
    !description ||
    !content ||
    !status_id
  ) {
    return res.status(400).json({
      message:
        "Server could not update post because there are missing data from client",
    });
  }

  try {
    const result = await pool.query(
      `UPDATE posts
       SET
         title = $1,
         image = $2,
         category_id = $3,
         description = $4,
         content = $5,
         status_id = $6
       WHERE id = $7
       RETURNING id`,
      [title, image, category_id, description, content, status_id, postId],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "Server could not find a requested post to update",
      });
    }

    return res.status(200).json({
      message: "Updated post sucessfully",
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Server could not update post because database connection",
    });
  }
});

app.delete("/posts/:postId", async (req, res) => {
  const { postId } = req.params;

  if (!isValidPostId(postId)) {
    return res.status(404).json({
      message: "Server could not find a requested post to delete",
    });
  }

  try {
    const result = await pool.query(
      "DELETE FROM posts WHERE id = $1 RETURNING id",
      [postId],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: "Server could not find a requested post to delete",
      });
    }

    return res.status(200).json({
      message: "Deleted post sucessfully",
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Server could not delete post because database connection",
    });
  }
});

app.get("/", (req, res) => {
  return res.json({
    message: "Testing the API successfully",
  });
});

app.get("/health", async (req, res) => {
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

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

export default app;
