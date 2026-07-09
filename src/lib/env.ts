import { z } from "zod";

/**
 * Centralized, validated environment configuration.
 * Import `env` anywhere instead of reading process.env directly.
 *
 * Validation is intentionally lenient (most values have safe defaults) so the
 * MVP boots even with a partial `.env.local`. Secrets are never hardcoded.
 */
const EnvSchema = z.object({
  APP_ENV: z.string().default("development"),
  FRONTEND_URL: z.string().default("http://localhost:3000"),
  APP_URL: z.string().default("http://localhost:3000"),
  SECRET_KEY: z.string().default("change-me-in-prod"),

  DATABASE_URL: z.string().default("postgresql://qbr:qbr@localhost:5432/qbr?schema=public"),

  // OpenAI — the ONLY place these are read.
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-5.5"),
  OPENAI_REASONING_EFFORT: z
    .enum(["minimal", "low", "medium", "high"])
    .default("medium"),

  STORAGE_BACKEND: z.enum(["local", "volume"]).default("local"),
  LOCAL_STORAGE_PATH: z.string().default("./storage"),
  /** UC Volume root path (/Volumes/catalog/schema/volume). Set via app.yaml valueFrom. */
  UC_VOLUME_PATH: z.string().optional(),

  // Path to the approved house QBR deck used as the EXACT format example for the
  // AI drafter. Its slide structure/content is extracted at runtime and injected
  // into the deck-drafting prompt. Keep the canonical copy under templates/.
  QBR_TEMPLATE_PATH: z.string().default("./templates/qbr_brand_template.pptx"),

  EMAIL_PROVIDER: z
    .enum(["mock", "graph", "sendgrid", "mailgun", "postmark"])
    .default("mock"),
  QBR_MAILBOX: z.string().default("qbr@gdi.com"),
  EMAIL_SENDER_NAME: z.string().default("GDI QBR OS"),

  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_TENANT: z.string().default("common"),
  MICROSOFT_REDIRECT_URI: z
    .string()
    .default("http://localhost:3000/api/outlook/callback"),
  MICROSOFT_SCOPES: z
    .string()
    .default("User.Read Mail.ReadWrite offline_access"),
  OUTLOOK_POLL_INTERVAL_SECONDS: z.coerce.number().default(30),
  // Optional: bootstrap the Graph connection without clicking Connect.
  // If set and the DB has no stored connection, it is auto-seeded on first use.
  GRAPH_REFRESH_TOKEN: z.string().optional(),

  // Databricks Apps — injected by the platform; used for Lakebase detection in db.ts.
  LAKEBASE_ENDPOINT: z.string().optional(),
  PGHOST: z.string().optional(),
  DATABRICKS_CLIENT_ID: z.string().optional(),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  // Fail loudly but only for truly invalid values (enums etc).
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration. See logs above.");
}

export const env = parsed.data;

/** True when a usable OpenAI key is configured (not a placeholder). */
export function hasOpenAi(): boolean {
  const key = env.OPENAI_API_KEY;
  return Boolean(key && key.length > 20 && !key.includes("placeholder") && !key.includes("your-openai"));
}
