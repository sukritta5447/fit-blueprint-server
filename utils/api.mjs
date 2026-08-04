import { HttpError } from "./httpError.mjs";

export function parsePositiveId(value, label = "id") {
  const id = Number(value);

  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new HttpError(400, `${label} must be a positive integer`, "invalid_id");
  }

  return id;
}

export function getPagination(query, defaultLimit = 20, maximumLimit = 100) {
  const requestedPage = Number.parseInt(query.page, 10);
  const requestedLimit = Number.parseInt(query.limit, 10);
  const page = requestedPage > 0 ? requestedPage : 1;
  const limit = Math.min(
    requestedLimit > 0 ? requestedLimit : defaultLimit,
    maximumLimit,
  );

  return {
    page,
    limit,
    offset: (page - 1) * limit,
  };
}

export function pickBody(body, allowedFields, requiredFields = []) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "A JSON object body is required", "invalid_body");
  }

  const unknownFields = Object.keys(body).filter(
    (field) => !allowedFields.includes(field),
  );

  if (unknownFields.length > 0) {
    throw new HttpError(
      400,
      `Unknown field(s): ${unknownFields.join(", ")}`,
      "unknown_fields",
    );
  }

  const missingFields = requiredFields.filter(
    (field) => body[field] === undefined || body[field] === null,
  );

  if (missingFields.length > 0) {
    throw new HttpError(
      400,
      `Missing required field(s): ${missingFields.join(", ")}`,
      "missing_fields",
    );
  }

  return Object.fromEntries(
    allowedFields
      .filter((field) => body[field] !== undefined)
      .map((field) => [field, body[field]]),
  );
}

export function buildUpdateClause(input, firstParameter = 1) {
  const entries = Object.entries(input);

  if (entries.length === 0) {
    throw new HttpError(400, "At least one field is required", "empty_update");
  }

  return {
    assignments: entries
      .map(([field], index) => `${field} = $${firstParameter + index}`)
      .join(", "),
    values: entries.map(([, value]) => value),
  };
}
