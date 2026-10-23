import "server-only";

import { PrismaClient } from "@prisma/client";

import { getDatabaseUrl } from "@/lib/env";

const globalForPrisma = globalThis as unknown as { orvexaPrisma?: PrismaClient };

function createClient() {
  return new PrismaClient({
    datasources: { db: { url: getDatabaseUrl() } },
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

/**
 * The Prisma client is created on first use rather than at module load. This
 * keeps `next build` working on a machine that has no DATABASE_URL (no route
 * opens a connection while prerendering) while still failing loudly, with a
 * readable message, the moment a query actually runs without configuration.
 */
export function getPrisma(): PrismaClient {
  if (!globalForPrisma.orvexaPrisma) {
    globalForPrisma.orvexaPrisma = createClient();
  }
  return globalForPrisma.orvexaPrisma;
}

/**
 * Convenience handle so data modules can write `prisma.user.findUnique(...)`.
 * Property access forwards to the lazily created client.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    const client = getPrisma();
    const value = Reflect.get(client, property, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
