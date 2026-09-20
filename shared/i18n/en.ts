/**
 * English — the source of truth for all trader-facing text.
 *
 * ur.ts and ar.ts are typed against this file, so adding, renaming or removing
 * a key here fails `tsc` until both are updated. Change wording here first,
 * then update the Urdu and Arabic in the same commit.
 *
 * Placeholders are `{name}`. Trading terms traders use in English (lot, SL, TP,
 * equity, magic number, USDT, Telegram) stay in Latin script in every language.
 * Not translated by decision: admin screens and the payment (transmission) proof.
 */
export const en = {
  common: {
    appName: "RFX Trader Dashboard",
    language: "Language",
    loading: "Loading...",
    refresh: "Refresh",
    back: "Back",
    save: "Save",
    saving: "Saving...",
    sending: "Sending...",
    verifying: "Verifying...",
    cancel: "Cancel",
    and: "and",
    magicNumber: "Magic Number",
    verificationCode: "Verification Code",
    enterSixDigitCode: "Enter 6-digit code",
    codeSentToTelegram: "A verification code has been sent to your Telegram.",
    passwordsDoNotMatch: "Passwords do not match",
    passwordTooShort: "Password must be at least 6 characters",
    atLeastSixCharacters: "At least 6 characters",
    unavailable: "unavailable",
    noLimit: "no limit",
    pending: "Pending",
    hit: "HIT",
    showTransmissionProof: "Show Transmission Proof",
  },

  login: {
    tagline: "Track your trading performance",
    verifyTitle: "Verify Your Identity",
    verifySubtitle: "Enter the 6-digit code sent to your Telegram",
    resetTitle: "Reset Password",
    resetEnterMagic: "Enter your magic number to receive a reset code",
    resetEnterCode: "Enter the verification code sent to your Telegram",
    resetSetNew: "Set your new password",
    magicPlaceholder: "Enter your magic number",
    password: "Password",
    passwordPlaceholder: "Enter your password",
    rememberMe: "Remember me",
    forgotPassword: "Forgot password?",
    signIn: "Sign In",
    signingIn: "Signing in...",
    verifyAndSignIn: "Verify & Sign In",
    backToLogin: "Back to login",
    sendResetCode: "Send Reset Code",
    sendingCode: "Sending code...",
    continue: "Continue",
    newPassword: "New Password",
    confirmPassword: "Confirm Password",
    confirmPasswordPlaceholder: "Confirm your new password",
    resetPassword: "Reset Password",
    resetting: "Resetting...",
    welcomeBack: "Welcome back, {name}!",
    enterMagicFirst: "Please enter your magic number",
    resetSuccess: "Password reset successfully! Please log in.",
  },

  pagination: {
    noEntries: "No entries",
    showing: "Showing {start}–{end} of {total}",
    all: "All",
    page: "Page {page} / {pages}",
    first: "First page",
    previous: "Previous page",
    next: "Next page",
    last: "Last page",
  },

  table: {
    ticket: "Ticket",
    symbol: "Symbol",
    type: "Type",
    volume: "Volume",
    openDate: "Open Date",
    closeDate: "Close Date",
    open: "Open",
    close: "Close",
    openPrice: "Open Price",
    closePrice: "Close Price",
    tp: "TP",
    sl: "SL",
    pnl: "P&L",
    date: "Date",
    amount: "Amount",
    network: "Network",
    fee: "Fee",
    note: "Note",
    transaction: "Transaction",
    proof: "Proof",
  },

  dashboard: {
    loading: "Loading dashboard...",
    notifications: "Notifications",
    markAllRead: "Mark all read",
    noNotifications: "No notifications",
    settings: "Settings",
    logout: "Logout",

    todayTotalPnl: "Today's Total P&L",
    realized: "Realized:",
    floating: "Floating:",

    configTitle: "Account & Copier Configuration",
    notCopiedNews:
      "Your trades are not being copied into the Live Account due to News.",
    notCopiedAdmin:
      "Your trades are not being copied into the Live Account - Disabled by your Administrator.",
    notCountedWarning:
      "If you place trades now, they are not counted toward profit share since they are not executed in the Live Account.",
    newsDetail: "{symbols}: {title}, until {time}",
    copiedFixedLots:
      "Each of your trades is going into the Live Account as {lots}",
    copiedMultiplied:
      "Each of your trades are being multiplied by {multiplier} into the Live Account",
    maxTrades: "Your maximum trades open at the same time: {value}",
    maxLots: "Your maximum lots open at the same time: {value}",
    dailyLoss:
      "Your maximum daily loss today: {amount}. If the equity in your incubator account drops below {equity}, all trades will be closed and you can resume trading after rollover.",
    riskLimit:
      "If the equity in your incubator account drops below {amount}, all trades will be closed and your account is permanently breached.",
    accountBalance: "Account Balance: {value}",
    accountEquity: "Account Equity: {value}",
    noCopier: "No copier linked to your account.",

    thisWeek: "This Week",
    thisWeekSub: "Last 7 days",
    thisMonth: "This Month",
    thisMonthSub: "Current month",
    allTime: "All Time",
    allTimeSub: "Total performance",
    weeklyProfitShare: "Weekly Profit Share",
    fortnightlyProfitShare: "Fortnightly Profit Share",
    profitShare: "Profit Share",
    profitShareSub:
      "{percent}% of profit since your last payout, after earlier losses",

    openPositions: "Open Positions",
    activePositions: "{count} active positions",
    viewHistory: "View History",
    noOpenPositions: "No Open Positions",
    noOpenPositionsBody:
      "You don't have any active trading positions at the moment.",
    tradeHistory: "Trade History",
    noTradeHistory: "No Trade History",
    noTradeHistoryBody: "No closed positions found for this trader.",
    payments: "Payments",
    noPayments: "No Payments",
    noPaymentsBody: "Payments to this trader will appear here.",

    dataRefreshed: "Data refreshed",
    refreshFailed: "Failed to refresh data",
    breachToast:
      "⚠️ Risk limit breached! Equity {equity} is below your {riskLimit} limit. All trades have been closed and your account is permanently breached.",

    footer: "App version {version} · Build {build}",
  },

  settings: {
    title: "Settings",
    description: "Manage your account settings and preferences",
    tabAccount: "Account",
    tabPayments: "Payments",
    tabSecurity: "Security",

    accountInfo: "Account Information",
    accountInfoDesc: "Your trading account details",
    name: "Name",
    telegramHandle: "Telegram Handle",
    telegramHandleHelp:
      "Used to receive payment and important notifications via Telegram",
    telegramSaved: "Telegram handle saved",
    connected: "Connected",
    notConnected: "Not connected — send /start to @RFXTraderBot",
    sendTestMessage: "Send Test Message",
    testSent: "Test message sent! Check your Telegram.",
    saveHandleFirst:
      "Save a handle first, then send /start to @RFXTraderBot in Telegram.",
    openTelegramHint:
      "Open Telegram, search {bot} and send {command} to activate notifications.",

    usdtTitle: "USDT Payment Details",
    usdtDesc: "Configure your USDT wallet for receiving payments",
    usdtAddress: "USDT Address",
    usdtAddressPlaceholder: "Enter your USDT wallet address",
    network: "Network",
    selectNetwork: "Select network",
    saveUsdt: "Save USDT Information",
    usdtUpdated: "USDT information updated",
    usdtUpdateFailed: "Failed to update USDT information",
    trc20Invalid: "TRC20 address must be 34 characters and start with 'T'",
    erc20Invalid: "ERC20 address must be 42 characters and start with '0x'",

    summaryTitle: "Payment Summary",
    summaryDesc: "Your profit share and lifetime earnings",
    profitShareRate: "Profit Share Rate",
    lifetimeProfit: "Lifetime Profit",
    lifetimeProfitShare: "Lifetime Profit Share",
    lifetimeIncome: "Lifetime Income",
    paymentHistory: "Payment History",
    paymentHistoryDesc: "All payments received from RFX",
    loadingPayments: "Loading payments...",
    noPaymentHistory: "No payment history available",

    changePassword: "Change Password",
    changePasswordDesc: "Update your account password",
    currentPassword: "Current Password",
    currentPasswordPlaceholder: "Enter current password",
    newPassword: "New Password",
    confirmNewPassword: "Confirm New Password",
    confirmNewPasswordPlaceholder: "Confirm new password",
    changing: "Changing...",
    passwordChanged: "Password changed successfully!",
    codeSentEnterBelow:
      "A verification code has been sent to your Telegram. Enter it below to confirm the password change.",
    verifyAndChange: "Verify & Change Password",
  },

  history: {
    title: "Trade History",
    subtitle: "All-time trading performance",
    loading: "Loading history...",
    refreshed: "History refreshed",
    refreshFailed: "Failed to refresh history",
    emptyTrades:
      "Your closed trading positions will appear here once you complete trades.",
    payments: "Payments",
    emptyPayments: "Payments made to you will appear here.",
  },

  notFound: {
    title: "Page Not Found",
    line1: "Sorry, the page you are looking for doesn't exist.",
    line2: "It may have been moved or deleted.",
    goHome: "Go Home",
  },

  // In-app notifications. Stored with their key + params, so they render in
  // whatever language the reader has selected.
  notifications: {
    breach: {
      title: "[Magic {magicNumber}] Risk Limit Breached — Account Permanently Breached",
      message:
        "Your incubator account equity dropped to ${equity}, below your risk limit of ${riskLimit}. All trades have been closed and your account is permanently breached.",
    },
    trailing: {
      title: "[Magic {magicNumber}] Risk Limit Updated",
      message:
        "New Stopout ${stopout}. Manage risk and lot size accordingly.",
    },
    missedTrade: {
      title: "[Magic {magicNumber}] Trade Not Copied to Live",
      message:
        "Your {symbol} trade had no {missing}, so it was not copied to live and has been closed on your incubator account. Always set a stop-loss and take-profit.",
    },
    payment: {
      title: "[Magic {magicNumber}] Payment Received",
      message:
        "You have received a payment of ${amount}. Transaction hash: {hash}",
    },
    tradingReenabled: {
      title: "[Magic {magicNumber}] Trading Re-enabled",
      message:
        "An admin has reviewed your account and re-enabled trading. You may now resume trading.",
    },
    onboardingComplete: {
      title: "[Magic {magicNumber}] Onboarding Complete",
      message:
        "Your onboarding is complete and your trades are now being copied into the Live Account. Your MT login details have been sent to you on Telegram.",
    },
  },

  // Telegram messages (HTML parse mode — keep the tags and line breaks).
  telegram: {
    greeting: "Hi {name},",
    breach:
      "[Magic {magicNumber}] 🚨 <b>Risk Limit Breached</b>\n\n{greeting}\n\nYour incubator account equity has dropped to <b>${equity}</b>, which is below your risk limit of <b>${riskLimit}</b>.\n\n<b>All trades have been closed and your account is permanently breached.</b>",
    trailing:
      "[Magic {magicNumber}] 📈 <b>Risk Limit Updated</b>\n\n{greeting}\n\nNew Stopout <b>${stopout}</b>. Manage risk and lot size accordingly.",
    missedTrade:
      "[Magic {magicNumber}] ⚠️ <b>Trade Not Copied to Live</b>\n\n{greeting}\n\nYour <b>{symbol}</b> trade had no <b>{missing}</b>, so it was not copied to your live account. It has been closed on your incubator account.\n\nAlways set a stop-loss and take-profit so your trades copy to live.",
    payment:
      "[Magic {magicNumber}] 💰 <b>Payment Received</b>\n\n{greeting}\n\nA payment of <b>{amount} USDT</b> has been sent to your wallet.\n\n📋 <b>Details</b>\n• Network: {network}\n• Network Fee: {fee} USDT\n• Date: {date}\n• TX: {txLink}\n\nYou can view the full transmission proof in your RFX Trader dashboard.",
    loginDetailsHeading: "LOGIN DETAILS",
    verificationCode:
      "[Magic {magicNumber}] 🔐 <b>Verification Code</b>\n\n{greeting}\n\nYour verification code for <b>{purpose}</b> is:\n\n<code>{code}</code>\n\nThis code expires in 5 minutes. If you didn't request this, ignore this message.",
    purposeLogin: "login from a new device",
    purposeReset: "password reset",
    purposeChange: "password change",
    test:
      "Hello World! 👋 This is a test message from RFX Trader Dashboard, {name}. Your Telegram notifications are working correctly.",
    startNoUsername:
      "👋 <b>Welcome to RFX Trader Dashboard!</b>\n\n⚠️ Your Telegram account doesn't have a <b>username</b> set, so we can't link it to your trading account.\n\nPlease set one in <b>Telegram → Settings → Username</b>, make sure that same handle is saved in your dashboard settings, then send /start again.",
    startLinked:
      "✅ <b>Welcome to RFX Trader Dashboard!</b>\n\nYour Telegram is now linked to {count} account(s):\n{accounts}\n\n• 📊 <b>Dashboard:</b> {dashboardLink}\n\nYou'll receive payment confirmations, risk limit alerts, and important updates here. Welcome aboard! 🚀",
    startRelinked:
      "✅ <b>Re-linked!</b>\n\nYour Telegram is connected to {count} account(s):\n{accounts}\n\n• 📊 <b>Dashboard:</b> {dashboardLink}\n\nNotifications will continue to be delivered here.",
    startUnknown:
      "👋 Hi @{username}! To link your Telegram to RFX Trader Dashboard, please save your Telegram handle in your dashboard settings first, then send /start again.",
  },

  // Server error messages shown to traders, keyed by the exact English message
  // the server throws. Unknown messages are shown as they arrive.
  serverErrors: {
    "Invalid magic number": "Invalid magic number",
    "Invalid password": "Invalid password",
    "Magic number not found": "Magic number not found",
    "Current password is incorrect": "Current password is incorrect",
    "Invalid or expired verification code":
      "Invalid or expired verification code",
    "Too many login attempts. Try again in 15 minutes.":
      "Too many login attempts. Try again in 15 minutes.",
    "Too many reset requests. Try again in 15 minutes.":
      "Too many reset requests. Try again in 15 minutes.",
    "Too many verification attempts. Request a new code and try again.":
      "Too many verification attempts. Request a new code and try again.",
    "Failed to send verification code. Try again later.":
      "Failed to send verification code. Try again later.",
    "Failed to send Telegram message. Please try again.":
      "Failed to send Telegram message. Please try again.",
    "No Telegram handle set. Save your handle first.":
      "No Telegram handle set. Save your handle first.",
    "No Telegram linked to this account. Contact an admin to reset your password.":
      "No Telegram linked to this account. Contact an admin to reset your password.",
    "Telegram not connected yet. Open Telegram, search for @RFXTraderBot and send /start, then try again.":
      "Telegram not connected yet. Open Telegram, search for @RFXTraderBot and send /start, then try again.",
  },
};
