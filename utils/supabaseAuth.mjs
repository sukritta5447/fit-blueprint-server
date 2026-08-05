import { createClient } from "@supabase/supabase-js";

let authClient;

function getRequiredEnvironmentValue(key) {
  const value = process.env[key]?.trim();

  if (!value) {
    throw new Error(`${key} is required`);
  }

  return value;
}

export function getSupabaseAuthClient() {
  if (!authClient) {
    authClient = createClient(
      getRequiredEnvironmentValue("SUPABASE_URL"),
      getRequiredEnvironmentValue("SUPABASE_PUBLISHABLE_KEY"),
      {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
      },
    );
  }

  return authClient;
}

export async function verifyAccessToken(accessToken) {
  const { data, error } = await getSupabaseAuthClient().auth.getUser(accessToken);

  return {
    error,
    user: data.user ?? null,
  };
}
