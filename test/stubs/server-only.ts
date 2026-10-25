/**
 * Test stub for the `server-only` marker package.
 *
 * The real package throws when imported outside a React Server Component, but
 * the modules under test are pure functions that only carry the marker to keep
 * them off the client. Vitest aliases `server-only` to this empty module so the
 * import is a no-op and the behaviour under test can be exercised directly.
 */
export {};
