import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { databaseUrl } from "../server/config";
const globals = globalThis as unknown as { recallPool?: Pool };
export const pool =
  globals.recallPool ??
  new Pool({
    connectionString: databaseUrl(),
    max: 10,
    connectionTimeoutMillis: 5000,
  });
if (process.env.NODE_ENV !== "production") globals.recallPool = pool;
export const db = drizzle(pool, { schema });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
