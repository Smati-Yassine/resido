import { z } from "zod";

const envSchema = z.object({
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  MONGODB_DB: z.string().min(1, "MONGODB_DB is required"),
  AUTH_SECRET: z.string().min(1, "AUTH_SECRET is required"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  OBJECT_STORAGE_BUCKET: z.string().optional(),
  OBJECT_STORAGE_REGION: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

// Parsed once at module load (process boot). Fails fast with a readable
// error instead of surfacing a broken MONGODB_URI at request time.
function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    cached = loadEnv();
  }
  return cached;
}

/** Test-only: forces the next env() call to re-read process.env. */
export function resetEnvForTests(): void {
  cached = undefined;
}
