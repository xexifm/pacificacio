import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/schema";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL environment variable is not set");
}

// Reuse a single postgres.js client across hot reloads / route invocations to
// avoid exhausting the database connection pool in development and serverless.
const globalForDb = globalThis as unknown as {
  __pgClient?: ReturnType<typeof postgres>;
};

const client =
  globalForDb.__pgClient ??
  postgres(databaseUrl, {
    max: 10,
    // Neon / Supabase pooled connections require SSL; postgres.js honours the
    // sslmode query param, so we leave TLS negotiation to the connection string.
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__pgClient = client;
}

export const db = drizzle(client, { schema });
