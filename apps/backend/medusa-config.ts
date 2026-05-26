import { loadEnv, defineConfig, Modules } from "@medusajs/framework/utils";

loadEnv(process.env.NODE_ENV || "development", process.cwd());

const hasRedis = !!process.env.REDIS_URL;

/**
 * Medusa v2 configuration for the school uniform POS backend.
 *
 * If REDIS_URL is set we use Redis-backed workflows + event-bus + cache.
 * If not, we register the in-memory variants so the backend can boot for dev.
 * The custom modules (school, uniform-kit, pos-device, offline-sync,
 * audit-log, student, receipt) sit on top of Medusa's built-in modules.
 */
export default defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    },
    redisUrl: process.env.REDIS_URL,
    workerMode: (process.env.MEDUSA_WORKER_MODE as
      | "shared"
      | "worker"
      | "server"
      | undefined) ?? "shared",
  },
  modules: [
    // --- Custom POS modules ---
    { resolve: "./src/modules/school" },
    { resolve: "./src/modules/uniform-kit" },
    { resolve: "./src/modules/pos-device" },
    { resolve: "./src/modules/offline-sync" },
    { resolve: "./src/modules/audit-log" },
    { resolve: "./src/modules/student" },
    { resolve: "./src/modules/receipt" },

    // --- Infra: Redis vs in-memory ---
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
