// Vitest setup guard: refuse to run the suite against a non-test database.
//
// The integration tests write real rows (createMagicNumber / updateMagicNumber /
// deleteMagicNumber) to whatever DATABASE_URL points at. In this deployment the
// app's .env points DATABASE_URL at the live `rfx_trader` DB, so `pnpm test`
// would mutate production data. This guard hard-fails before any test runs
// unless the target is clearly a test database.
//
// Resolution order:
//   1. If TEST_DATABASE_URL is set, use it for the run (preferred path).
//   2. Otherwise fall back to DATABASE_URL.
// The resolved URL must name a database recognised as a test DB (name contains
// "test"), unless ALLOW_PROD_DB_TESTS=1 is set as an explicit, deliberate
// override.

function databaseName(url: string): string {
  try {
    // mysql://user:pass@host:port/dbname?params -> dbname
    const path = new URL(url).pathname.replace(/^\//, "");
    return path.split("?")[0] ?? "";
  } catch {
    return "";
  }
}

const testUrl = process.env.TEST_DATABASE_URL;
if (testUrl) {
  process.env.DATABASE_URL = testUrl;
}

const url = process.env.DATABASE_URL ?? "";
const dbName = databaseName(url);
const looksLikeTestDb = /test/i.test(dbName);
const override = process.env.ALLOW_PROD_DB_TESTS === "1";

if (!url) {
  throw new Error(
    "[test-db-guard] No DATABASE_URL set. Point tests at a throwaway DB via " +
      "TEST_DATABASE_URL (e.g. mysql://rfx:pass@localhost:3306/rfx_trader_test).",
  );
}

if (!looksLikeTestDb && !override) {
  throw new Error(
    `[test-db-guard] Refusing to run tests against database "${dbName || "(unknown)"}" — ` +
      "it is not recognised as a test database and the tests write/delete real rows.\n" +
      "  • Set TEST_DATABASE_URL to an isolated DB whose name contains 'test' " +
      "(e.g. rfx_trader_test), or\n" +
      "  • Set ALLOW_PROD_DB_TESTS=1 to override deliberately (NOT recommended against prod).",
  );
}
