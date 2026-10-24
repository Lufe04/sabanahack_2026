import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Neon: las migraciones van por la conexión directa, no por el pooler
    url: (process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL)!,
  },
});
