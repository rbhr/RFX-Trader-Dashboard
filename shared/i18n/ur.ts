import type { Translations } from "./types";

/** Urdu. Typed against en.ts — a missing or extra key is a compile error. */
export const ur: Translations = {
  common: {
    appName: "RFX ٹریڈر ڈیش بورڈ",
    language: "زبان",
    loading: "لوڈ ہو رہا ہے...",
    refresh: "ریفریش",
    back: "واپس",
    save: "محفوظ کریں",
    saving: "محفوظ ہو رہا ہے...",
    sending: "بھیجا جا رہا ہے...",
    verifying: "تصدیق ہو رہی ہے...",
    cancel: "منسوخ کریں",
    and: "اور",
    magicNumber: "Magic Number",
    verificationCode: "تصدیقی کوڈ",
    enterSixDigitCode: "6 ہندسوں کا کوڈ درج کریں",
    codeSentToTelegram: "تصدیقی کوڈ آپ کے Telegram پر بھیج دیا گیا ہے۔",
    passwordsDoNotMatch: "دونوں پاس ورڈ ایک جیسے نہیں ہیں",
    passwordTooShort: "پاس ورڈ کم از کم 6 حروف کا ہونا چاہیے",
    atLeastSixCharacters: "کم از کم 6 حروف",
    unavailable: "دستیاب نہیں",
    noLimit: "کوئی حد نہیں",
    pending: "زیرِ التوا",
    hit: "HIT",
    showTransmissionProof: "ادائیگی کا ثبوت دکھائیں",
  },

  login: {
    tagline: "اپنی ٹریڈنگ کارکردگی پر نظر رکھیں",
    verifyTitle: "اپنی شناخت کی تصدیق کریں",
    verifySubtitle: "اپنے Telegram پر بھیجا گیا 6 ہندسوں کا کوڈ درج کریں",
    resetTitle: "پاس ورڈ ری سیٹ کریں",
    resetEnterMagic: "ری سیٹ کوڈ حاصل کرنے کے لیے اپنا Magic Number درج کریں",
    resetEnterCode: "اپنے Telegram پر بھیجا گیا تصدیقی کوڈ درج کریں",
    resetSetNew: "اپنا نیا پاس ورڈ مقرر کریں",
    magicPlaceholder: "اپنا Magic Number درج کریں",
    password: "پاس ورڈ",
    passwordPlaceholder: "اپنا پاس ورڈ درج کریں",
    rememberMe: "مجھے یاد رکھیں",
    forgotPassword: "پاس ورڈ بھول گئے؟",
    signIn: "سائن اِن کریں",
    signingIn: "سائن اِن ہو رہا ہے...",
    verifyAndSignIn: "تصدیق کریں اور سائن اِن کریں",
    backToLogin: "لاگ اِن پر واپس جائیں",
    sendResetCode: "ری سیٹ کوڈ بھیجیں",
    sendingCode: "کوڈ بھیجا جا رہا ہے...",
    continue: "جاری رکھیں",
    newPassword: "نیا پاس ورڈ",
    confirmPassword: "پاس ورڈ کی تصدیق کریں",
    confirmPasswordPlaceholder: "اپنا نیا پاس ورڈ دوبارہ درج کریں",
    resetPassword: "پاس ورڈ ری سیٹ کریں",
    resetting: "ری سیٹ ہو رہا ہے...",
    welcomeBack: "خوش آمدید، {name}!",
    enterMagicFirst: "براہِ کرم اپنا Magic Number درج کریں",
    resetSuccess: "پاس ورڈ کامیابی سے ری سیٹ ہو گیا! براہِ کرم لاگ اِن کریں۔",
  },

  pagination: {
    noEntries: "کوئی اندراج نہیں",
    showing: "{total} میں سے {start}–{end} دکھائے جا رہے ہیں",
    all: "تمام",
    page: "صفحہ {page} / {pages}",
    first: "پہلا صفحہ",
    previous: "پچھلا صفحہ",
    next: "اگلا صفحہ",
    last: "آخری صفحہ",
  },

  table: {
    ticket: "ٹکٹ",
    symbol: "سمبل",
    type: "قسم",
    volume: "حجم",
    openDate: "کھلنے کی تاریخ",
    closeDate: "بند ہونے کی تاریخ",
    open: "کھلی",
    close: "بند",
    openPrice: "اوپن قیمت",
    closePrice: "کلوز قیمت",
    tp: "TP",
    sl: "SL",
    pnl: "P&L",
    date: "تاریخ",
    amount: "رقم",
    network: "نیٹ ورک",
    fee: "فیس",
    note: "نوٹ",
    transaction: "ٹرانزیکشن",
    proof: "ثبوت",
  },

  dashboard: {
    loading: "ڈیش بورڈ لوڈ ہو رہا ہے...",
    notifications: "اطلاعات",
    markAllRead: "سب کو پڑھا ہوا نشان زد کریں",
    noNotifications: "کوئی اطلاع نہیں",
    settings: "ترتیبات",
    logout: "لاگ آؤٹ",

    todayTotalPnl: "آج کا کل P&L",
    realized: "حاصل شدہ:",
    floating: "فلوٹنگ:",

    configTitle: "اکاؤنٹ اور کاپیئر کی ترتیب",
    notCopiedNews:
      "خبروں (News) کی وجہ سے آپ کی ٹریڈز Live اکاؤنٹ میں کاپی نہیں ہو رہیں۔",
    notCopiedAdmin:
      "آپ کی ٹریڈز Live اکاؤنٹ میں کاپی نہیں ہو رہیں - آپ کے ایڈمنسٹریٹر نے اسے غیر فعال کر دیا ہے۔",
    notCountedWarning:
      "اگر آپ اس وقت ٹریڈز لگاتے ہیں تو وہ پرافٹ شیئر میں شمار نہیں ہوں گی، کیونکہ وہ Live اکاؤنٹ میں نہیں لگتیں۔",
    newsDetail: "{symbols}: {title}، {time} تک",
    copiedFixedLots: "آپ کی ہر ٹریڈ Live اکاؤنٹ میں {lots} کے طور پر جا رہی ہے",
    copiedMultiplied:
      "آپ کی ہر ٹریڈ {multiplier} سے ضرب ہو کر Live اکاؤنٹ میں جا رہی ہے",
    maxTrades: "ایک ہی وقت میں کھلی ٹریڈز کی آپ کی زیادہ سے زیادہ تعداد: {value}",
    maxLots: "ایک ہی وقت میں کھلے lots کی آپ کی زیادہ سے زیادہ حد: {value}",
    dailyLoss:
      "آج کے لیے آپ کا زیادہ سے زیادہ یومیہ نقصان: {amount}۔ اگر آپ کے Incubator اکاؤنٹ کی ایکویٹی {equity} سے نیچے چلی گئی تو تمام ٹریڈز بند کر دی جائیں گی اور آپ رول اوور کے بعد دوبارہ ٹریڈنگ شروع کر سکیں گے۔",
    riskLimit:
      "اگر آپ کے Incubator اکاؤنٹ کی ایکویٹی {amount} سے نیچے چلی گئی تو تمام ٹریڈز بند کر دی جائیں گی اور آپ کا اکاؤنٹ مستقل طور پر بریچ ہو جائے گا۔",
    accountBalance: "اکاؤنٹ بیلنس: {value}",
    accountEquity: "اکاؤنٹ ایکویٹی: {value}",
    noCopier: "آپ کے اکاؤنٹ سے کوئی کاپیئر منسلک نہیں ہے۔",

    thisWeek: "اس ہفتے",
    thisWeekSub: "گزشتہ 7 دن",
    thisMonth: "اس مہینے",
    thisMonthSub: "رواں مہینہ",
    allTime: "مجموعی",
    allTimeSub: "کل کارکردگی",
    weeklyProfitShare: "ہفتہ وار پرافٹ شیئر",
    fortnightlyProfitShare: "پندرہ روزہ پرافٹ شیئر",
    profitShare: "پرافٹ شیئر",
    profitShareSub:
      "پچھلے نقصانات پورے ہونے کے بعد، آخری ادائیگی سے اب تک کے منافع کا {percent}%",

    openPositions: "کھلی پوزیشنز",
    activePositions: "{count} فعال پوزیشنز",
    viewHistory: "ہسٹری دیکھیں",
    noOpenPositions: "کوئی کھلی پوزیشن نہیں",
    noOpenPositionsBody: "اس وقت آپ کی کوئی فعال ٹریڈنگ پوزیشن نہیں ہے۔",
    tradeHistory: "ٹریڈ ہسٹری",
    noTradeHistory: "کوئی ٹریڈ ہسٹری نہیں",
    noTradeHistoryBody: "اس ٹریڈر کی کوئی بند پوزیشن نہیں ملی۔",
    payments: "ادائیگیاں",
    noPayments: "کوئی ادائیگی نہیں",
    noPaymentsBody: "اس ٹریڈر کو کی گئی ادائیگیاں یہاں ظاہر ہوں گی۔",

    dataRefreshed: "ڈیٹا ریفریش ہو گیا",
    refreshFailed: "ڈیٹا ریفریش نہیں ہو سکا",
    breachToast:
      "⚠️ رسک لمٹ بریچ ہو گئی! ایکویٹی {equity} آپ کی {riskLimit} کی حد سے نیچے ہے۔ تمام ٹریڈز بند کر دی گئی ہیں اور آپ کا اکاؤنٹ مستقل طور پر بریچ ہو چکا ہے۔",

    footer: "ایپ ورژن {version} · بلڈ {build}",
  },

  settings: {
    title: "ترتیبات",
    description: "اپنے اکاؤنٹ کی ترتیبات اور ترجیحات کا انتظام کریں",
    tabAccount: "اکاؤنٹ",
    tabPayments: "ادائیگیاں",
    tabSecurity: "سیکیورٹی",

    accountInfo: "اکاؤنٹ کی معلومات",
    accountInfoDesc: "آپ کے ٹریڈنگ اکاؤنٹ کی تفصیلات",
    name: "نام",
    telegramHandle: "Telegram ہینڈل",
    telegramHandleHelp:
      "Telegram کے ذریعے ادائیگی اور اہم اطلاعات وصول کرنے کے لیے استعمال ہوتا ہے",
    telegramSaved: "Telegram ہینڈل محفوظ ہو گیا",
    connected: "منسلک ہے",
    notConnected: "منسلک نہیں — @RFXTraderBot کو /start بھیجیں",
    sendTestMessage: "ٹیسٹ پیغام بھیجیں",
    testSent: "ٹیسٹ پیغام بھیج دیا گیا! اپنا Telegram چیک کریں۔",
    saveHandleFirst:
      "پہلے ہینڈل محفوظ کریں، پھر Telegram میں @RFXTraderBot کو /start بھیجیں۔",
    openTelegramHint:
      "اطلاعات فعال کرنے کے لیے Telegram کھولیں، {bot} تلاش کریں اور {command} بھیجیں۔",

    usdtTitle: "USDT ادائیگی کی تفصیلات",
    usdtDesc: "ادائیگیاں وصول کرنے کے لیے اپنا USDT والٹ ترتیب دیں",
    usdtAddress: "USDT ایڈریس",
    usdtAddressPlaceholder: "اپنے USDT والٹ کا ایڈریس درج کریں",
    network: "نیٹ ورک",
    selectNetwork: "نیٹ ورک منتخب کریں",
    saveUsdt: "USDT معلومات محفوظ کریں",
    usdtUpdated: "USDT معلومات اپ ڈیٹ ہو گئیں",
    usdtUpdateFailed: "USDT معلومات اپ ڈیٹ نہیں ہو سکیں",
    trc20Invalid: "TRC20 ایڈریس 34 حروف کا ہونا چاہیے اور 'T' سے شروع ہونا چاہیے",
    erc20Invalid: "ERC20 ایڈریس 42 حروف کا ہونا چاہیے اور '0x' سے شروع ہونا چاہیے",

    summaryTitle: "ادائیگیوں کا خلاصہ",
    summaryDesc: "آپ کا پرافٹ شیئر اور مجموعی آمدنی",
    profitShareRate: "پرافٹ شیئر کی شرح",
    lifetimeProfit: "مجموعی منافع",
    lifetimeProfitShare: "مجموعی پرافٹ شیئر",
    lifetimeIncome: "مجموعی آمدنی",
    paymentHistory: "ادائیگیوں کی ہسٹری",
    paymentHistoryDesc: "RFX سے موصول ہونے والی تمام ادائیگیاں",
    loadingPayments: "ادائیگیاں لوڈ ہو رہی ہیں...",
    noPaymentHistory: "ادائیگیوں کی کوئی ہسٹری دستیاب نہیں",

    changePassword: "پاس ورڈ تبدیل کریں",
    changePasswordDesc: "اپنے اکاؤنٹ کا پاس ورڈ اپ ڈیٹ کریں",
    currentPassword: "موجودہ پاس ورڈ",
    currentPasswordPlaceholder: "موجودہ پاس ورڈ درج کریں",
    newPassword: "نیا پاس ورڈ",
    confirmNewPassword: "نئے پاس ورڈ کی تصدیق کریں",
    confirmNewPasswordPlaceholder: "نیا پاس ورڈ دوبارہ درج کریں",
    changing: "تبدیل ہو رہا ہے...",
    passwordChanged: "پاس ورڈ کامیابی سے تبدیل ہو گیا!",
    codeSentEnterBelow:
      "تصدیقی کوڈ آپ کے Telegram پر بھیج دیا گیا ہے۔ پاس ورڈ کی تبدیلی کی تصدیق کے لیے اسے نیچے درج کریں۔",
    verifyAndChange: "تصدیق کریں اور پاس ورڈ تبدیل کریں",
  },

  history: {
    title: "ٹریڈ ہسٹری",
    subtitle: "اب تک کی مکمل ٹریڈنگ کارکردگی",
    loading: "ہسٹری لوڈ ہو رہی ہے...",
    refreshed: "ہسٹری ریفریش ہو گئی",
    refreshFailed: "ہسٹری ریفریش نہیں ہو سکی",
    emptyTrades: "ٹریڈز مکمل ہونے کے بعد آپ کی بند پوزیشنز یہاں ظاہر ہوں گی۔",
    payments: "ادائیگیاں",
    emptyPayments: "آپ کو کی گئی ادائیگیاں یہاں ظاہر ہوں گی۔",
  },

  notFound: {
    title: "صفحہ نہیں ملا",
    line1: "معذرت، آپ جو صفحہ تلاش کر رہے ہیں وہ موجود نہیں ہے۔",
    line2: "ممکن ہے اسے منتقل یا حذف کر دیا گیا ہو۔",
    goHome: "ہوم پر جائیں",
  },

  notifications: {
    breach: {
      title: "[Magic {magicNumber}] رسک لمٹ بریچ — اکاؤنٹ مستقل طور پر بریچ ہو گیا",
      message:
        "آپ کے Incubator اکاؤنٹ کی ایکویٹی گر کر ${equity} رہ گئی، جو آپ کی رسک لمٹ ${riskLimit} سے کم ہے۔ تمام ٹریڈز بند کر دی گئی ہیں اور آپ کا اکاؤنٹ مستقل طور پر بریچ ہو چکا ہے۔",
    },
    trailing: {
      title: "[Magic {magicNumber}] رسک لمٹ اپ ڈیٹ ہو گئی",
      message:
        "نیا Stopout ${stopout}۔ رسک اور lot سائز اسی کے مطابق رکھیں۔",
    },
    missedTrade: {
      title: "[Magic {magicNumber}] ٹریڈ Live میں کاپی نہیں ہوئی",
      message:
        "آپ کی {symbol} ٹریڈ میں {missing} نہیں تھا، اس لیے یہ Live میں کاپی نہیں ہوئی اور آپ کے Incubator اکاؤنٹ پر بند کر دی گئی ہے۔ ہمیشہ stop-loss اور take-profit لگائیں۔",
    },
    payment: {
      title: "[Magic {magicNumber}] ادائیگی موصول ہو گئی",
      message: "آپ کو ${amount} کی ادائیگی موصول ہوئی ہے۔ ٹرانزیکشن ہیش: {hash}",
    },
    lotLimitClose: {
      title: "[Magic {magicNumber}] ٹریڈ بند کر دی گئی — lots کی حد سے تجاوز",
      message:
        "آپ کی {symbol} پر {volume} lots کی ٹریڈ سے {symbol} پر آپ کے کھلے lots بڑھ کر {total} ہو گئے، جو آپ کی حد {limit} سے زیادہ ہیں، اس لیے اسے بند کر دیا گیا۔ اپنے کل کھلے lots اپنی حد کے اندر رکھیں۔",
    },
    tradeLimitClose: {
      title: "[Magic {magicNumber}] ٹریڈ بند کر دی گئی — کھلی ٹریڈز بہت زیادہ",
      message:
        "آپ کی {symbol} پر {volume} lots کی ٹریڈ بند کر دی گئی، کیونکہ ایک ہی وقت میں آپ کی زیادہ سے زیادہ {limit} ٹریڈز پہلے ہی کھلی تھیں۔",
    },
    tradeLimitCloseNoMax: {
      title: "[Magic {magicNumber}] ٹریڈ بند کر دی گئی — کھلی ٹریڈز بہت زیادہ",
      message:
        "آپ کی {symbol} پر {volume} lots کی ٹریڈ بند کر دی گئی، کیونکہ ایک ہی وقت میں کھلی ٹریڈز کی آپ کی زیادہ سے زیادہ تعداد پہلے ہی پوری ہو چکی تھی۔",
    },
    tradingReenabled: {
      title: "[Magic {magicNumber}] ٹریڈنگ دوبارہ فعال کر دی گئی",
      message:
        "ایک ایڈمن نے آپ کے اکاؤنٹ کا جائزہ لے کر ٹریڈنگ دوبارہ فعال کر دی ہے۔ اب آپ دوبارہ ٹریڈنگ کر سکتے ہیں۔",
    },
    onboardingComplete: {
      title: "[Magic {magicNumber}] آن بورڈنگ مکمل ہو گئی",
      message:
        "آپ کی آن بورڈنگ مکمل ہو گئی ہے اور اب آپ کی ٹریڈز Live اکاؤنٹ میں کاپی ہو رہی ہیں۔ آپ کی MT لاگ اِن تفصیلات آپ کو Telegram پر بھیج دی گئی ہیں۔",
    },
  },

  telegram: {
    greeting: "محترم {name}،",
    breach:
      "[Magic {magicNumber}] 🚨 <b>رسک لمٹ بریچ ہو گئی</b>\n\n{greeting}\n\nآپ کے Incubator اکاؤنٹ کی ایکویٹی گر کر <b>${equity}</b> رہ گئی ہے، جو آپ کی رسک لمٹ <b>${riskLimit}</b> سے کم ہے۔\n\n<b>تمام ٹریڈز بند کر دی گئی ہیں اور آپ کا اکاؤنٹ مستقل طور پر بریچ ہو چکا ہے۔</b>",
    trailing:
      "[Magic {magicNumber}] 📈 <b>رسک لمٹ اپ ڈیٹ ہو گئی</b>\n\n{greeting}\n\nنیا Stopout <b>${stopout}</b>۔ رسک اور lot سائز اسی کے مطابق رکھیں۔",
    missedTrade:
      "[Magic {magicNumber}] ⚠️ <b>ٹریڈ Live میں کاپی نہیں ہوئی</b>\n\n{greeting}\n\nآپ کی <b>{symbol}</b> ٹریڈ میں <b>{missing}</b> نہیں تھا، اس لیے یہ آپ کے Live اکاؤنٹ میں کاپی نہیں ہوئی۔ اسے آپ کے Incubator اکاؤنٹ پر بند کر دیا گیا ہے۔\n\nہمیشہ stop-loss اور take-profit لگائیں تاکہ آپ کی ٹریڈز Live میں کاپی ہوں۔",
    payment:
      "[Magic {magicNumber}] 💰 <b>ادائیگی موصول ہو گئی</b>\n\n{greeting}\n\n<b>{amount} USDT</b> کی ادائیگی آپ کے والٹ میں بھیج دی گئی ہے۔\n\n📋 <b>تفصیلات</b>\n• نیٹ ورک: {network}\n• نیٹ ورک فیس: {fee} USDT\n• تاریخ: {date}\n• TX: {txLink}\n\nادائیگی کا مکمل ثبوت آپ اپنے RFX ٹریڈر ڈیش بورڈ میں دیکھ سکتے ہیں۔",
    lotLimitClose:
      "[Magic {magicNumber}] ⚠️ <b>ٹریڈ بند کر دی گئی — lots کی حد سے تجاوز</b>\n\n{greeting}\n\nآپ کی <b>{symbol}</b> پر <b>{volume} lots</b> کی ٹریڈ سے {symbol} پر آپ کے کھلے lots بڑھ کر <b>{total}</b> ہو گئے، جو آپ کی حد <b>{limit}</b> سے زیادہ ہیں، اس لیے اسے بند کر دیا گیا۔\n\nاپنے کل کھلے lots اپنی حد کے اندر رکھیں۔",
    tradeLimitClose:
      "[Magic {magicNumber}] ⚠️ <b>ٹریڈ بند کر دی گئی — کھلی ٹریڈز بہت زیادہ</b>\n\n{greeting}\n\nآپ کی <b>{symbol}</b> پر <b>{volume} lots</b> کی ٹریڈ بند کر دی گئی، کیونکہ ایک ہی وقت میں آپ کی زیادہ سے زیادہ <b>{limit}</b> ٹریڈز پہلے ہی کھلی تھیں۔",
    tradeLimitCloseNoMax:
      "[Magic {magicNumber}] ⚠️ <b>ٹریڈ بند کر دی گئی — کھلی ٹریڈز بہت زیادہ</b>\n\n{greeting}\n\nآپ کی <b>{symbol}</b> پر <b>{volume} lots</b> کی ٹریڈ بند کر دی گئی، کیونکہ ایک ہی وقت میں کھلی ٹریڈز کی آپ کی زیادہ سے زیادہ تعداد پہلے ہی پوری ہو چکی تھی۔",
    loginDetailsHeading: "لاگ اِن کی تفصیلات",
    verificationCode:
      "[Magic {magicNumber}] 🔐 <b>تصدیقی کوڈ</b>\n\n{greeting}\n\n<b>{purpose}</b> کے لیے آپ کا تصدیقی کوڈ یہ ہے:\n\n<code>{code}</code>\n\nیہ کوڈ 5 منٹ میں ختم ہو جائے گا۔ اگر آپ نے یہ درخواست نہیں کی تو اس پیغام کو نظر انداز کریں۔",
    purposeLogin: "نئی ڈیوائس سے لاگ اِن",
    purposeReset: "پاس ورڈ ری سیٹ",
    purposeChange: "پاس ورڈ کی تبدیلی",
    test:
      "Hello World! 👋 {name}، یہ RFX ٹریڈر ڈیش بورڈ کی طرف سے ایک ٹیسٹ پیغام ہے۔ آپ کی Telegram اطلاعات درست کام کر رہی ہیں۔",
    startNoUsername:
      "👋 <b>RFX ٹریڈر ڈیش بورڈ میں خوش آمدید!</b>\n\n⚠️ آپ کے Telegram اکاؤنٹ میں <b>username</b> مقرر نہیں ہے، اس لیے ہم اسے آپ کے ٹریڈنگ اکاؤنٹ سے منسلک نہیں کر سکتے۔\n\nبراہِ کرم <b>Telegram → Settings → Username</b> میں ایک username مقرر کریں، یقینی بنائیں کہ وہی ہینڈل آپ کے ڈیش بورڈ کی ترتیبات میں محفوظ ہے، پھر دوبارہ /start بھیجیں۔",
    startLinked:
      "✅ <b>RFX ٹریڈر ڈیش بورڈ میں خوش آمدید!</b>\n\nآپ کا Telegram اب {count} اکاؤنٹ(س) سے منسلک ہے:\n{accounts}\n\n• 📊 <b>ڈیش بورڈ:</b> {dashboardLink}\n\nآپ کو ادائیگی کی تصدیق، رسک لمٹ کے الرٹس اور اہم اپ ڈیٹس یہیں موصول ہوں گی۔ خوش آمدید! 🚀",
    startRelinked:
      "✅ <b>دوبارہ منسلک ہو گیا!</b>\n\nآپ کا Telegram {count} اکاؤنٹ(س) سے منسلک ہے:\n{accounts}\n\n• 📊 <b>ڈیش بورڈ:</b> {dashboardLink}\n\nاطلاعات یہیں موصول ہوتی رہیں گی۔",
    help:
      "👋 یہ بوٹ آپ کے RFX ٹریڈر ڈیش بورڈ کی اطلاعات بھیجتا ہے۔ اس چیٹ کو اپنے اکاؤنٹ سے منسلک کرنے کے لیے /start بھیجیں۔",
    startUnknown:
      "👋 @{username}! اپنا Telegram، RFX ٹریڈر ڈیش بورڈ سے منسلک کرنے کے لیے پہلے اپنے ڈیش بورڈ کی ترتیبات میں اپنا Telegram ہینڈل محفوظ کریں، پھر دوبارہ /start بھیجیں۔",
  },

  serverErrors: {
    "Invalid magic number": "غلط Magic Number",
    "Invalid password": "غلط پاس ورڈ",
    "Magic number not found": "Magic Number نہیں ملا",
    "Current password is incorrect": "موجودہ پاس ورڈ غلط ہے",
    "Invalid or expired verification code":
      "تصدیقی کوڈ غلط ہے یا اس کی میعاد ختم ہو چکی ہے",
    "Too many login attempts. Try again in 15 minutes.":
      "لاگ اِن کی بہت زیادہ کوششیں ہو چکی ہیں۔ 15 منٹ بعد دوبارہ کوشش کریں۔",
    "Too many reset requests. Try again in 15 minutes.":
      "ری سیٹ کی بہت زیادہ درخواستیں ہو چکی ہیں۔ 15 منٹ بعد دوبارہ کوشش کریں۔",
    "Too many verification attempts. Request a new code and try again.":
      "تصدیق کی بہت زیادہ کوششیں ہو چکی ہیں۔ نیا کوڈ منگوائیں اور دوبارہ کوشش کریں۔",
    "Failed to send verification code. Try again later.":
      "تصدیقی کوڈ نہیں بھیجا جا سکا۔ کچھ دیر بعد دوبارہ کوشش کریں۔",
    "Failed to send Telegram message. Please try again.":
      "Telegram پیغام نہیں بھیجا جا سکا۔ براہِ کرم دوبارہ کوشش کریں۔",
    "No Telegram handle set. Save your handle first.":
      "Telegram ہینڈل مقرر نہیں ہے۔ پہلے اپنا ہینڈل محفوظ کریں۔",
    "No Telegram linked to this account. Contact an admin to reset your password.":
      "اس اکاؤنٹ سے کوئی Telegram منسلک نہیں ہے۔ پاس ورڈ ری سیٹ کروانے کے لیے ایڈمن سے رابطہ کریں۔",
    "Telegram not connected yet. Open Telegram, search for @RFXTraderBot and send /start, then try again.":
      "Telegram ابھی منسلک نہیں ہوا۔ Telegram کھولیں، @RFXTraderBot تلاش کریں اور /start بھیجیں، پھر دوبارہ کوشش کریں۔",
  },
};
