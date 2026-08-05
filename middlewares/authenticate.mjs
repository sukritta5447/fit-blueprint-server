import { findAuthProfile } from "../utils/authProfile.mjs";
import { HttpError } from "../utils/httpError.mjs";
import { verifyAccessToken } from "../utils/supabaseAuth.mjs";

const APP_ROLES = new Set([
  "member",
  "content_admin",
  "support_admin",
  "super_admin",
]);

export function getBearerToken(authorizationHeader) {
  if (typeof authorizationHeader !== "string") return null;

  const match = authorizationHeader.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

function getAppRole(profile) {
  const role = profile.role;
  return APP_ROLES.has(role) ? role : "member";
}

export function createAuthenticate({
  findProfile = findAuthProfile,
  verifyToken = verifyAccessToken,
} = {}) {
  return async function authenticate(req, res, next) {
    const accessToken = getBearerToken(req.get("authorization"));

    if (!accessToken) {
      return res.status(401).json({
        code: "missing_access_token",
        message: "A Bearer access token is required",
      });
    }

    try {
      const { error, user } = await verifyToken(accessToken);

      if (error && (!error.status || error.status >= 500)) {
        return next(
          new HttpError(
            503,
            "Authentication service is unavailable",
            "auth_service_unavailable",
          ),
        );
      }

      if (error || !user) {
        return res.status(401).json({
          code: "invalid_access_token",
          message: "The access token is invalid or expired",
        });
      }

      const profile = await findProfile(user.id);

      if (!profile) {
        return res.status(403).json({
          code: "profile_unavailable",
          message: "The user profile is unavailable",
        });
      }

      if (profile.status !== "active") {
        return res.status(403).json({
          code: "account_inactive",
          message: "The account is not active",
        });
      }

      req.auth = {
        accessToken,
        email: user.email ?? profile.email,
        profile,
        role: getAppRole(profile),
        userId: user.id,
      };

      return next();
    } catch (error) {
      if (
        error.message === "SUPABASE_URL is required" ||
        error.message === "SUPABASE_PUBLISHABLE_KEY is required"
      ) {
        return next(
          new HttpError(
            503,
            "Authentication service is not configured",
            "auth_not_configured",
          ),
        );
      }

      return next(error);
    }
  };
}

export function createOptionalAuthenticate(options = {}) {
  const authenticate = createAuthenticate(options);

  return function optionalAuthenticate(req, res, next) {
    const authorization = req.get("authorization");

    if (authorization === undefined || authorization === null) {
      return next();
    }

    return authenticate(req, res, next);
  };
}

const authenticate = createAuthenticate();
export const optionalAuthenticate = createOptionalAuthenticate();

export default authenticate;
