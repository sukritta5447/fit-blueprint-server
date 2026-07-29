const postFields = [
  { key: "title", label: "Title", type: "string" },
  { key: "image", label: "Image", type: "string" },
  { key: "category_id", label: "Category id", type: "number" },
  { key: "description", label: "Description", type: "string" },
  { key: "content", label: "Content", type: "string" },
  { key: "status_id", label: "Status id", type: "number" },
];

const isMissing = (value) =>
  value === undefined || value === null || value === "";

const validatePost = (req, res, next) => {
  const body = req.body ?? {};

  for (const field of postFields) {
    const value = body[field.key];

    if (isMissing(value)) {
      return res.status(400).json({
        message: `${field.label} is required`,
      });
    }

    if (typeof value !== field.type) {
      return res.status(400).json({
        message: `${field.label} must be a ${field.type}`,
      });
    }
  }

  return next();
};

export default validatePost;
