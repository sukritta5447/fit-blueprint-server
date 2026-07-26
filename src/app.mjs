import express from "express";
import cors from "cors";
import pool from "./utils/db.mjs";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get("/profiles", (req, res) => {
  return res.json({
    data: {
      name: "john",
      age: 20,
    },
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});