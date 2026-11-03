export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';

/**
 * How long a payout is refused after its destination USDT address changes.
 * Enforced in the payout paths (server/routers.ts) and warned about on the
 * trader's payout settings. See the 2026-11-02 incident: point the address at
 * an attacker wallet, send, point it back — 234 seconds end to end.
 */
export const USDT_ADDRESS_COOL_OFF_HOURS = 4;

/**
 * How long one TOTP code keeps a session cleared to move money. A code lasts
 * 30 seconds and cannot be replayed, so binding one to each transfer would
 * make a payout run of twenty traders impossible; this binds one to a short
 * window of them instead. A session with no step-up cannot send at all.
 */
export const PAYMENT_ELEVATION_MINUTES = 5;

/**
 * How long payouts are held after a working authenticator is removed or
 * replaced. Same four hours as a payout-address change, and for the same
 * reason: the second factor and the destination are the two things an attacker
 * has to change to pay themselves, so neither may be changed and used in one
 * sitting. Signing in with a recovery code does not trip this — a lost phone
 * needs no disable.
 */
export const TOTP_CHANGE_COOL_OFF_HOURS = 4;
