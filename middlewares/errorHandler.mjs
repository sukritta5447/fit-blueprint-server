export function notFoundHandler(req, res) {
  return res.status(404).json({
    code: "route_not_found",
    message: "The requested route was not found",
  });
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  const databaseErrors = {
    "22P02": [400, "invalid_database_value"],
    23502: [400, "missing_database_value"],
    23503: [400, "invalid_reference"],
    23505: [409, "resource_conflict"],
    23514: [400, "constraint_violation"],
  };
  const databaseError = databaseErrors[error.code];
  const statusCode = error.statusCode ?? databaseError?.[0] ?? 500;

  if (statusCode >= 500) {
    console.error(error);
  }

  return res.status(statusCode).json({
    code:
      error.statusCode && error.code
        ? error.code
        : (databaseError?.[1] ?? "internal_server_error"),
    message:
      statusCode >= 500
        ? "An unexpected server error occurred"
        : databaseError
          ? "The request conflicts with the database schema"
          : error.message,
  });
}
