export function authorizeRoles(...allowedRoles) {
  const allowedRoleSet = new Set(allowedRoles);

  return function authorize(req, res, next) {
    if (!req.auth) {
      return res.status(401).json({
        code: "authentication_required",
        message: "Authentication is required",
      });
    }

    if (!allowedRoleSet.has(req.auth.role)) {
      return res.status(403).json({
        code: "insufficient_permissions",
        message: "You do not have permission to perform this action",
      });
    }

    return next();
  };
}
