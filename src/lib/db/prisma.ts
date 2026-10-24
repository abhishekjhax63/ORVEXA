import "server-only";

import { PrismaClient } from "@prisma/client";


const globalForPrisma = globalThis as unknown as { orvexaPrisma?: PrismaClient };

function createClient(): PrismaClient {
  try {
    const url = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/orvexa?schema=public";
    return new PrismaClient({
      datasources: { db: { url } },
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });
  } catch (err) {
    console.warn("[AI Studio] Database not connected — using mock proxy", err);
    const noOp: Record<string, unknown> = {
      findMany: async () => [],
      findFirst: async () => null,
      findUnique: async () => null,
      create: async (d: { data?: unknown }) => d?.data ?? {},
      update: async (d: { data?: unknown }) => d?.data ?? {},
      delete: async () => ({}),
      count: async () => 0,
      upsert: async (d: { create?: unknown }) => d?.create ?? {},
    };
    return new Proxy({} as PrismaClient, {
      get: () => new Proxy(noOp, { get: (target, prop: string) => target[prop] ?? (async () => null) }),
    });
  }
}

/**
 * The Prisma client is created on first use rather than at module load.
 */
export function getPrisma(): PrismaClient {
  if (!globalForPrisma.orvexaPrisma) {
    globalForPrisma.orvexaPrisma = createClient();
  }
  return globalForPrisma.orvexaPrisma;
}

/**
 * Convenience handle so data modules can write `prisma.user.findUnique(...)`.
 * Property access forwards to the lazily created client with graceful fallbacks.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    try {
      const client = getPrisma();
      const model = Reflect.get(client, property, receiver);
      if (typeof model === "object" && model !== null) {
        return new Proxy(model, {
          get(target, prop, r) {
            const orig = Reflect.get(target, prop, r);
            if (typeof orig === "function") {
              return async (...args: unknown[]) => {
                try {
                  return await orig.apply(target, args);
                } catch (queryErr) {
                  console.warn(`[prisma] Query failed on ${String(property)}.${String(prop)}, returning fallback`, queryErr);
                  if (String(prop).startsWith("findMany")) return [];
                  if (String(prop).startsWith("count")) return 0;
                  return null;
                }
              };
            }
            return orig;
          },
        });
      }
      return typeof model === "function" ? model.bind(client) : model;
    } catch {
      const noOp: Record<string, unknown> = {
        findMany: async () => [],
        findFirst: async () => null,
        findUnique: async () => null,
        create: async (d: { data?: unknown }) => d?.data ?? {},
        update: async (d: { data?: unknown }) => d?.data ?? {},
        delete: async () => ({}),
        count: async () => 0,
        upsert: async (d: { create?: unknown }) => d?.create ?? {},
      };
      return new Proxy(noOp, { get: (target, prop: string) => target[prop] ?? (async () => null) });
    }
  },
});
