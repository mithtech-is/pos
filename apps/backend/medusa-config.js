/**
 * JavaScript twin of medusa-config.ts.
 *
 * The Medusa CLI's `dynamic-import` helper just calls Node's `require()`,
 * which doesn't register a TS loader for sub-commands like `db:migrate`.
 * `medusa develop` does register one, but to keep all CLI commands working
 * uniformly we keep the runtime config in JS. The .ts file is preserved for
 * editor type-checking and stays in sync by hand (it's a small file).
 */
const { loadEnv, defineConfig } = require("@medusajs/framework/utils");

loadEnv(process.env.NODE_ENV || "development", process.cwd());

const hasRedis = !!process.env.REDIS_URL;

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    // Explicit connection pool. Medusa leaves poolMax `undefined` by default,
    // which deadlocks `medusa db:migrate`: the migration-only bootstrap loads
    // every module on one shared connection and exhausts the pool, so the
    // process hangs at "Running migrations..." forever. An explicit pool makes
    // migrations (and the running server) reliable. See DB_POOL_MAX to tune.
    databaseDriverOptions: {
      pool: { min: 0, max: Number(process.env.DB_POOL_MAX) || 20 },
    },
    http: {
      storeCors: process.env.STORE_CORS || "",
      adminCors: process.env.ADMIN_CORS || "",
      authCors: process.env.AUTH_CORS || "",
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    },
    redisUrl: process.env.REDIS_URL,
    workerMode: process.env.MEDUSA_WORKER_MODE || "shared",
  },
  modules: [
    { resolve: "./src/modules/school" },
    { resolve: "./src/modules/uniform-kit" },
    { resolve: "./src/modules/pos-device" },
    { resolve: "./src/modules/offline-sync" },
    { resolve: "./src/modules/audit-log" },
    { resolve: "./src/modules/student" },
    { resolve: "./src/modules/receipt" },

    hasRedis
      ? {
          resolve: "@medusajs/medusa/event-bus-redis",
          options: { redisUrl: process.env.REDIS_URL },
        }
      : { resolve: "@medusajs/medusa/event-bus-local" },
    hasRedis
      ? {
          resolve: "@medusajs/medusa/workflow-engine-redis",
          options: { redis: { url: process.env.REDIS_URL } },
        }
      : { resolve: "@medusajs/medusa/workflow-engine-inmemory" },
    hasRedis
      ? {
          resolve: "@medusajs/medusa/cache-redis",
          options: { redisUrl: process.env.REDIS_URL },
        }
      : { resolve: "@medusajs/medusa/cache-inmemory" },
  ],
});
