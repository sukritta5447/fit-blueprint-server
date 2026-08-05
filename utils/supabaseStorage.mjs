import { createClient } from "@supabase/supabase-js";

function getRequiredEnvironmentValue(key) {
  const value = process.env[key]?.trim();

  if (!value) {
    throw new Error(`${key} is required`);
  }

  return value;
}

export function createSupabaseStorageClient(accessToken) {
  return createClient(
    getRequiredEnvironmentValue("SUPABASE_URL"),
    getRequiredEnvironmentValue("SUPABASE_PUBLISHABLE_KEY"),
    {
      accessToken: async () => accessToken,
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
}

export async function createSignedUpload({ accessToken, bucket, path }) {
  const supabase = createSupabaseStorageClient(accessToken);
  const storageBucket = supabase.storage.from(bucket);
  const { data, error } = await storageBucket.createSignedUploadUrl(path);

  if (error) return { data: null, error };

  const { data: publicUrlData } = storageBucket.getPublicUrl(path);

  return {
    data: {
      ...data,
      publicUrl: publicUrlData.publicUrl,
    },
    error: null,
  };
}
