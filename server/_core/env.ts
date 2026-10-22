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
  // Telegram channel that gets a copy (in English) of the risk messages sent
  // to traders: equity breaches, daily loss limits, lot/trade-limit closes and
  // missed trades. A numeric chat id (-100…) or @channelusername; the bot must
  // be an admin of the channel. Empty = no copies.
  telegramAlertChannelId: process.env.TELEGRAM_ALERT_CHANNEL_ID ?? "",
  // The MetaCopier demo account that a new trader's copier is created into,
  // purely to obtain their magic number — nothing else should read it.
  //
  // This gets replaced from time to time. It was a hardcoded literal until the
  // account behind it was deleted, after which every trader create and edit
  // failed its magic-number step with an unexplained "status code 400"
  // ([ACCOUNT_WAS_DELETED]). It is configuration, not a constant: set
  // METACOPIER_DEMO_ACCOUNT_ID when you replace the account.
  metacopierDemoAccountId:
    process.env.METACOPIER_DEMO_ACCOUNT_ID ??
    "fda0e4b2-83c8-48f7-8b12-9664cdd0bd6e", // 474776952 "06 - exness Master Demo"
  // Google OAuth client used to send invoice mail as a real person's mailbox.
  // One client covers every Google sender, personal Gmail and Workspace alike.
  // Scope is gmail.send only: the grant can send mail and cannot read any.
  googleMailClientId: process.env.GOOGLE_MAIL_CLIENT_ID ?? "",
  googleMailClientSecret: process.env.GOOGLE_MAIL_CLIENT_SECRET ?? "",
  // Public origin the OAuth redirect comes back to. Must match the authorised
  // redirect URI on the Google client exactly, scheme and host included.
  publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? "").replace(/\/$/, ""),
  // 32-byte key (64 hex chars) encrypting stored OAuth grants at rest, so a
  // stray database dump is not a licence to send mail as somebody.
  // Generate with: openssl rand -hex 32
  emailTokenKey: process.env.EMAIL_TOKEN_KEY ?? "",
  // Microsoft Entra app registration used to send invoice mail as an M365
  // mailbox. Delegated Mail.Send only — it can send as the one mailbox that
  // consented, never as every mailbox in the tenant.
  msMailClientId: process.env.MS_MAIL_CLIENT_ID ?? "",
  msMailClientSecret: process.env.MS_MAIL_CLIENT_SECRET ?? "",
  // "common" lets any work tenant consent, keeping secureg.net, rfx.capital
  // and rftrust.co on one registration. Set a tenant id to restrict it.
  msMailTenant: process.env.MS_MAIL_TENANT ?? "common",
};
