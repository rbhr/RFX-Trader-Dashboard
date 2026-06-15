export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  tronPrivateKey: process.env.TRON_PRIVATE_KEY ?? "",
  tronFullNode: process.env.TRON_FULL_NODE ?? "https://api.trongrid.io",
  tronUsdtContract:
    process.env.TRON_USDT_CONTRACT ?? "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
  evmPrivateKey: process.env.EVM_PRIVATE_KEY ?? "",
  evmRpcUrl: process.env.EVM_RPC_URL ?? "",
  evmUsdtContract: process.env.EVM_USDT_CONTRACT ?? "",
  evmChainName: process.env.EVM_CHAIN_NAME ?? "EVM",
  gasFreeApiKey: process.env.GASFREE_API_KEY ?? "",
  gasFreeApiSecret: process.env.GASFREE_API_SECRET ?? "",
  // Comma-separated debug namespaces to enable (e.g. "auth,onboarding"), or
  // "*"/"1"/"true" for all. Empty = quiet (default). See server/_core/debug.ts.
  debug: process.env.DEBUG ?? "",
  // MetaCopier real-time socket (Phase 1). Default ON; set MC_SOCKET_ENABLED=false
  // to revert to pure REST polling. Read methods always fall back to REST.
  mcSocketEnabled: process.env.MC_SOCKET_ENABLED !== "false",
  // Live dashboard push over SSE (Phase 2). Default OFF — additive; enable with
  // MC_LIVE_STREAM=true (server) and VITE_LIVE_STREAM=true (client build).
  // Polling remains the fallback regardless.
  mcLiveStream: process.env.MC_LIVE_STREAM === "true",
};
