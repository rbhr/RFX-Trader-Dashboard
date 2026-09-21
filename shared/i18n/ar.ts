import type { Translations } from "./types";

/** Arabic. Typed against en.ts — a missing or extra key is a compile error. */
export const ar: Translations = {
  common: {
    appName: "لوحة متداولي RFX",
    language: "اللغة",
    loading: "جارٍ التحميل...",
    refresh: "تحديث",
    back: "رجوع",
    save: "حفظ",
    saving: "جارٍ الحفظ...",
    sending: "جارٍ الإرسال...",
    verifying: "جارٍ التحقق...",
    cancel: "إلغاء",
    and: "و",
    magicNumber: "Magic Number",
    verificationCode: "رمز التحقق",
    enterSixDigitCode: "أدخل الرمز المكوّن من 6 أرقام",
    codeSentToTelegram: "تم إرسال رمز التحقق إلى حسابك على Telegram.",
    passwordsDoNotMatch: "كلمتا المرور غير متطابقتين",
    passwordTooShort: "يجب ألا تقل كلمة المرور عن 6 أحرف",
    atLeastSixCharacters: "6 أحرف على الأقل",
    unavailable: "غير متاح",
    noLimit: "بلا حد",
    pending: "قيد الانتظار",
    hit: "HIT",
    showTransmissionProof: "عرض إثبات التحويل",
  },

  login: {
    tagline: "تابع أداء تداولك",
    verifyTitle: "تحقق من هويتك",
    verifySubtitle: "أدخل الرمز المكوّن من 6 أرقام المرسل إلى حسابك على Telegram",
    resetTitle: "إعادة تعيين كلمة المرور",
    resetEnterMagic: "أدخل Magic Number الخاص بك لاستلام رمز إعادة التعيين",
    resetEnterCode: "أدخل رمز التحقق المرسل إلى حسابك على Telegram",
    resetSetNew: "عيّن كلمة المرور الجديدة",
    magicPlaceholder: "أدخل Magic Number الخاص بك",
    password: "كلمة المرور",
    passwordPlaceholder: "أدخل كلمة المرور",
    rememberMe: "تذكّرني",
    forgotPassword: "نسيت كلمة المرور؟",
    signIn: "تسجيل الدخول",
    signingIn: "جارٍ تسجيل الدخول...",
    verifyAndSignIn: "تحقق وسجّل الدخول",
    backToLogin: "العودة إلى تسجيل الدخول",
    sendResetCode: "إرسال رمز إعادة التعيين",
    sendingCode: "جارٍ إرسال الرمز...",
    continue: "متابعة",
    newPassword: "كلمة المرور الجديدة",
    confirmPassword: "تأكيد كلمة المرور",
    confirmPasswordPlaceholder: "أعد إدخال كلمة المرور الجديدة",
    resetPassword: "إعادة تعيين كلمة المرور",
    resetting: "جارٍ إعادة التعيين...",
    welcomeBack: "مرحباً بعودتك، {name}!",
    enterMagicFirst: "يرجى إدخال Magic Number الخاص بك",
    resetSuccess: "تمت إعادة تعيين كلمة المرور بنجاح! يرجى تسجيل الدخول.",
  },

  pagination: {
    noEntries: "لا توجد سجلات",
    showing: "عرض {start}–{end} من أصل {total}",
    all: "الكل",
    page: "الصفحة {page} / {pages}",
    first: "الصفحة الأولى",
    previous: "الصفحة السابقة",
    next: "الصفحة التالية",
    last: "الصفحة الأخيرة",
  },

  table: {
    ticket: "رقم الصفقة",
    symbol: "الرمز",
    type: "النوع",
    volume: "الحجم",
    openDate: "تاريخ الفتح",
    closeDate: "تاريخ الإغلاق",
    open: "الفتح",
    close: "الإغلاق",
    openPrice: "سعر الفتح",
    closePrice: "سعر الإغلاق",
    tp: "TP",
    sl: "SL",
    pnl: "P&L",
    date: "التاريخ",
    amount: "المبلغ",
    network: "الشبكة",
    fee: "الرسوم",
    note: "ملاحظة",
    transaction: "المعاملة",
    proof: "الإثبات",
  },

  dashboard: {
    loading: "جارٍ تحميل لوحة التحكم...",
    notifications: "الإشعارات",
    markAllRead: "تحديد الكل كمقروء",
    noNotifications: "لا توجد إشعارات",
    settings: "الإعدادات",
    logout: "تسجيل الخروج",

    todayTotalPnl: "إجمالي P&L لليوم",
    realized: "المحقق:",
    floating: "العائم:",

    configTitle: "إعدادات الحساب والناسخ (Copier)",
    notCopiedNews:
      "لا يتم نسخ صفقاتك إلى الحساب الحقيقي (Live) بسبب الأخبار (News).",
    notCopiedAdmin:
      "لا يتم نسخ صفقاتك إلى الحساب الحقيقي (Live) - تم التعطيل من قِبل المسؤول.",
    notCountedWarning:
      "إذا فتحت صفقات الآن فلن تُحتسب ضمن حصة الأرباح، لأنها لا تُنفَّذ في الحساب الحقيقي (Live).",
    newsDetail: "{symbols}: {title}، حتى {time}",
    copiedFixedLots:
      "تدخل كل صفقة من صفقاتك إلى الحساب الحقيقي (Live) بحجم {lots}",
    copiedMultiplied:
      "تُضاعَف كل صفقة من صفقاتك بمقدار {multiplier} عند نسخها إلى الحساب الحقيقي (Live)",
    maxTrades: "الحد الأقصى لعدد صفقاتك المفتوحة في الوقت نفسه: {value}",
    maxLots: "الحد الأقصى لإجمالي lots المفتوحة في الوقت نفسه: {value}",
    dailyLoss:
      "الحد الأقصى لخسارتك اليومية اليوم: {amount}. إذا انخفضت السيولة (Equity) في حساب Incubator الخاص بك عن {equity}، فستُغلق جميع الصفقات ويمكنك استئناف التداول بعد الترحيل اليومي (Rollover).",
    riskLimit:
      "إذا انخفضت السيولة (Equity) في حساب Incubator الخاص بك عن {amount}، فستُغلق جميع الصفقات ويصبح حسابك مخالفاً بشكل دائم.",
    accountBalance: "رصيد الحساب: {value}",
    accountEquity: "سيولة الحساب (Equity): {value}",
    noCopier: "لا يوجد ناسخ (Copier) مرتبط بحسابك.",

    thisWeek: "هذا الأسبوع",
    thisWeekSub: "آخر 7 أيام",
    thisMonth: "هذا الشهر",
    thisMonthSub: "الشهر الحالي",
    allTime: "كل الفترات",
    allTimeSub: "الأداء الإجمالي",
    weeklyProfitShare: "حصة الأرباح الأسبوعية",
    fortnightlyProfitShare: "حصة الأرباح نصف الشهرية",
    profitShare: "حصة الأرباح",
    profitShareSub:
      "{percent}% من الأرباح منذ آخر دفعة لك، بعد تعويض الخسائر السابقة",

    openPositions: "الصفقات المفتوحة",
    activePositions: "عدد الصفقات النشطة: {count}",
    viewHistory: "عرض السجل",
    noOpenPositions: "لا توجد صفقات مفتوحة",
    noOpenPositionsBody: "ليس لديك أي صفقات تداول نشطة في الوقت الحالي.",
    tradeHistory: "سجل الصفقات",
    noTradeHistory: "لا يوجد سجل صفقات",
    noTradeHistoryBody: "لم يُعثر على صفقات مغلقة لهذا المتداول.",
    payments: "المدفوعات",
    noPayments: "لا توجد مدفوعات",
    noPaymentsBody: "ستظهر هنا المدفوعات المرسلة إلى هذا المتداول.",

    dataRefreshed: "تم تحديث البيانات",
    refreshFailed: "تعذّر تحديث البيانات",
    breachToast:
      "⚠️ تم تجاوز حد المخاطرة! السيولة (Equity) {equity} أقل من حدّك البالغ {riskLimit}. أُغلقت جميع الصفقات وأصبح حسابك مخالفاً بشكل دائم.",

    footer: "إصدار التطبيق {version} · البناء {build}",
  },

  settings: {
    title: "الإعدادات",
    description: "إدارة إعدادات حسابك وتفضيلاتك",
    tabAccount: "الحساب",
    tabPayments: "المدفوعات",
    tabSecurity: "الأمان",

    accountInfo: "معلومات الحساب",
    accountInfoDesc: "تفاصيل حساب التداول الخاص بك",
    name: "الاسم",
    telegramHandle: "معرّف Telegram",
    telegramHandleHelp:
      "يُستخدم لاستلام إشعارات الدفع والإشعارات المهمة عبر Telegram",
    telegramSaved: "تم حفظ معرّف Telegram",
    connected: "متصل",
    notConnected: "غير متصل — أرسل /start إلى @RFXTraderBot",
    sendTestMessage: "إرسال رسالة تجريبية",
    testSent: "تم إرسال الرسالة التجريبية! تحقق من Telegram.",
    saveHandleFirst:
      "احفظ المعرّف أولاً، ثم أرسل /start إلى @RFXTraderBot في Telegram.",
    openTelegramHint:
      "افتح Telegram وابحث عن {bot} ثم أرسل {command} لتفعيل الإشعارات.",

    usdtTitle: "تفاصيل الدفع بعملة USDT",
    usdtDesc: "اضبط محفظة USDT الخاصة بك لاستلام المدفوعات",
    usdtAddress: "عنوان USDT",
    usdtAddressPlaceholder: "أدخل عنوان محفظة USDT الخاصة بك",
    network: "الشبكة",
    selectNetwork: "اختر الشبكة",
    saveUsdt: "حفظ معلومات USDT",
    usdtUpdated: "تم تحديث معلومات USDT",
    usdtUpdateFailed: "تعذّر تحديث معلومات USDT",
    trc20Invalid: "يجب أن يتكوّن عنوان TRC20 من 34 حرفاً وأن يبدأ بالحرف 'T'",
    erc20Invalid: "يجب أن يتكوّن عنوان ERC20 من 42 حرفاً وأن يبدأ بـ '0x'",

    summaryTitle: "ملخص المدفوعات",
    summaryDesc: "حصتك من الأرباح وإجمالي دخلك",
    profitShareRate: "نسبة حصة الأرباح",
    lifetimeProfit: "إجمالي الأرباح",
    lifetimeProfitShare: "إجمالي حصة الأرباح",
    lifetimeIncome: "إجمالي الدخل",
    paymentHistory: "سجل المدفوعات",
    paymentHistoryDesc: "جميع المدفوعات المستلمة من RFX",
    loadingPayments: "جارٍ تحميل المدفوعات...",
    noPaymentHistory: "لا يوجد سجل مدفوعات",

    changePassword: "تغيير كلمة المرور",
    changePasswordDesc: "حدّث كلمة مرور حسابك",
    currentPassword: "كلمة المرور الحالية",
    currentPasswordPlaceholder: "أدخل كلمة المرور الحالية",
    newPassword: "كلمة المرور الجديدة",
    confirmNewPassword: "تأكيد كلمة المرور الجديدة",
    confirmNewPasswordPlaceholder: "أعد إدخال كلمة المرور الجديدة",
    changing: "جارٍ التغيير...",
    passwordChanged: "تم تغيير كلمة المرور بنجاح!",
    codeSentEnterBelow:
      "تم إرسال رمز التحقق إلى حسابك على Telegram. أدخله أدناه لتأكيد تغيير كلمة المرور.",
    verifyAndChange: "تحقق وغيّر كلمة المرور",
  },

  history: {
    title: "سجل الصفقات",
    subtitle: "أداء التداول منذ البداية",
    loading: "جارٍ تحميل السجل...",
    refreshed: "تم تحديث السجل",
    refreshFailed: "تعذّر تحديث السجل",
    emptyTrades: "ستظهر صفقاتك المغلقة هنا بعد إتمامك للصفقات.",
    payments: "المدفوعات",
    emptyPayments: "ستظهر هنا المدفوعات المرسلة إليك.",
  },

  notFound: {
    title: "الصفحة غير موجودة",
    line1: "عذراً، الصفحة التي تبحث عنها غير موجودة.",
    line2: "ربما تم نقلها أو حذفها.",
    goHome: "العودة إلى الرئيسية",
  },

  notifications: {
    breach: {
      title: "[Magic {magicNumber}] تم تجاوز حد المخاطرة — الحساب مخالف بشكل دائم",
      message:
        "انخفضت السيولة (Equity) في حساب Incubator الخاص بك إلى ${equity}، أي أقل من حد المخاطرة البالغ ${riskLimit}. أُغلقت جميع الصفقات وأصبح حسابك مخالفاً بشكل دائم.",
    },
    trailing: {
      title: "[Magic {magicNumber}] تم تحديث حد المخاطرة",
      message:
        "مستوى Stopout الجديد ${stopout}. اضبط المخاطرة وحجم lot وفقاً لذلك.",
    },
    missedTrade: {
      title: "[Magic {magicNumber}] لم تُنسخ الصفقة إلى الحساب الحقيقي (Live)",
      message:
        "صفقتك على {symbol} لم يكن فيها {missing}، لذلك لم تُنسخ إلى الحساب الحقيقي (Live) وتم إغلاقها في حساب Incubator الخاص بك. ضع دائماً stop-loss و take-profit.",
    },
    payment: {
      title: "[Magic {magicNumber}] تم استلام دفعة",
      message: "لقد استلمت دفعة بقيمة ${amount}. معرّف المعاملة (hash): {hash}",
    },
    dailyLossHit: {
      title: "[Magic {magicNumber}] تم بلوغ حد الخسارة اليومية",
      message:
        "تم بلوغ حد خسارتك اليومية البالغ ${limit}: انخفضت السيولة (Equity) في حساب Incubator الخاص بك إلى ${equity}. أُغلقت جميع الصفقات. يمكنك استئناف التداول بعد الترحيل اليومي (Rollover).",
    },
    lotLimitClose: {
      title: "[Magic {magicNumber}] تم إغلاق الصفقة — تجاوز حد lots",
      message:
        "صفقتك على {symbol} بحجم {volume} lots رفعت إجمالي lots المفتوحة لديك على {symbol} إلى {total}، وهو أعلى من حدّك البالغ {limit}، لذلك تم إغلاقها. حافظ على إجمالي lots المفتوحة ضمن حدّك.",
    },
    tradeLimitClose: {
      title: "[Magic {magicNumber}] تم إغلاق الصفقة — عدد الصفقات المفتوحة كبير",
      message:
        "تم إغلاق صفقتك على {symbol} بحجم {volume} lots لأن لديك بالفعل الحد الأقصى البالغ {limit} من الصفقات المفتوحة في الوقت نفسه.",
    },
    tradeLimitCloseNoMax: {
      title: "[Magic {magicNumber}] تم إغلاق الصفقة — عدد الصفقات المفتوحة كبير",
      message:
        "تم إغلاق صفقتك على {symbol} بحجم {volume} lots لأنك بلغت بالفعل الحد الأقصى لعدد الصفقات المفتوحة في الوقت نفسه.",
    },
    tradingReenabled: {
      title: "[Magic {magicNumber}] تمت إعادة تفعيل التداول",
      message:
        "راجع أحد المسؤولين حسابك وأعاد تفعيل التداول. يمكنك الآن استئناف التداول.",
    },
    onboardingComplete: {
      title: "[Magic {magicNumber}] اكتمل التسجيل",
      message:
        "اكتمل تسجيلك ويجري الآن نسخ صفقاتك إلى الحساب الحقيقي (Live). تم إرسال بيانات دخول MT إليك عبر Telegram.",
    },
  },

  telegram: {
    greeting: "مرحباً {name}،",
    breach:
      "[Magic {magicNumber}] 🚨 <b>تم تجاوز حد المخاطرة</b>\n\n{greeting}\n\nانخفضت السيولة (Equity) في حساب Incubator الخاص بك إلى <b>${equity}</b>، أي أقل من حد المخاطرة البالغ <b>${riskLimit}</b>.\n\n<b>أُغلقت جميع الصفقات وأصبح حسابك مخالفاً بشكل دائم.</b>",
    trailing:
      "[Magic {magicNumber}] 📈 <b>تم تحديث حد المخاطرة</b>\n\n{greeting}\n\nمستوى Stopout الجديد <b>${stopout}</b>. اضبط المخاطرة وحجم lot وفقاً لذلك.",
    missedTrade:
      "[Magic {magicNumber}] ⚠️ <b>لم تُنسخ الصفقة إلى الحساب الحقيقي (Live)</b>\n\n{greeting}\n\nصفقتك على <b>{symbol}</b> لم يكن فيها <b>{missing}</b>، لذلك لم تُنسخ إلى حسابك الحقيقي (Live). وقد تم إغلاقها في حساب Incubator الخاص بك.\n\nضع دائماً stop-loss و take-profit حتى تُنسخ صفقاتك إلى الحساب الحقيقي.",
    payment:
      "[Magic {magicNumber}] 💰 <b>تم استلام دفعة</b>\n\n{greeting}\n\nتم إرسال دفعة بقيمة <b>{amount} USDT</b> إلى محفظتك.\n\n📋 <b>التفاصيل</b>\n• الشبكة: {network}\n• رسوم الشبكة: {fee} USDT\n• التاريخ: {date}\n• TX: {txLink}\n\nيمكنك الاطلاع على إثبات التحويل كاملاً في لوحة متداولي RFX.",
    dailyLossHit:
      "[Magic {magicNumber}] 🛑 <b>تم بلوغ حد الخسارة اليومية</b>\n\n{greeting}\n\nتم بلوغ حد خسارتك اليومية البالغ <b>${limit}</b>: انخفضت السيولة (Equity) في حساب Incubator الخاص بك إلى <b>${equity}</b>.\n\n<b>أُغلقت جميع الصفقات.</b> يمكنك استئناف التداول بعد الترحيل اليومي (Rollover).",
    lotLimitClose:
      "[Magic {magicNumber}] ⚠️ <b>تم إغلاق الصفقة — تجاوز حد lots</b>\n\n{greeting}\n\nصفقتك على <b>{symbol}</b> بحجم <b>{volume} lots</b> رفعت إجمالي lots المفتوحة لديك على {symbol} إلى <b>{total}</b>، وهو أعلى من حدّك البالغ <b>{limit}</b>، لذلك تم إغلاقها.\n\nحافظ على إجمالي lots المفتوحة ضمن حدّك.",
    tradeLimitClose:
      "[Magic {magicNumber}] ⚠️ <b>تم إغلاق الصفقة — عدد الصفقات المفتوحة كبير</b>\n\n{greeting}\n\nتم إغلاق صفقتك على <b>{symbol}</b> بحجم <b>{volume} lots</b> لأن لديك بالفعل الحد الأقصى البالغ <b>{limit}</b> من الصفقات المفتوحة في الوقت نفسه.",
    tradeLimitCloseNoMax:
      "[Magic {magicNumber}] ⚠️ <b>تم إغلاق الصفقة — عدد الصفقات المفتوحة كبير</b>\n\n{greeting}\n\nتم إغلاق صفقتك على <b>{symbol}</b> بحجم <b>{volume} lots</b> لأنك بلغت بالفعل الحد الأقصى لعدد الصفقات المفتوحة في الوقت نفسه.",
    loginDetailsHeading: "بيانات تسجيل الدخول",
    verificationCode:
      "[Magic {magicNumber}] 🔐 <b>رمز التحقق</b>\n\n{greeting}\n\nرمز التحقق الخاص بك من أجل <b>{purpose}</b> هو:\n\n<code>{code}</code>\n\nتنتهي صلاحية هذا الرمز خلال 5 دقائق. إذا لم تطلب ذلك فتجاهل هذه الرسالة.",
    purposeLogin: "تسجيل الدخول من جهاز جديد",
    purposeReset: "إعادة تعيين كلمة المرور",
    purposeChange: "تغيير كلمة المرور",
    test:
      "Hello World! 👋 {name}، هذه رسالة تجريبية من لوحة متداولي RFX. إشعارات Telegram لديك تعمل بشكل صحيح.",
    startNoUsername:
      "👋 <b>مرحباً بك في لوحة متداولي RFX!</b>\n\n⚠️ لا يحتوي حسابك على Telegram على <b>username</b>، لذلك لا يمكننا ربطه بحساب التداول الخاص بك.\n\nيرجى تعيين اسم مستخدم من <b>Telegram → Settings → Username</b>، وتأكد من حفظ المعرّف نفسه في إعدادات لوحة التحكم، ثم أرسل /start مرة أخرى.",
    startLinked:
      "✅ <b>مرحباً بك في لوحة متداولي RFX!</b>\n\nتم ربط Telegram الخاص بك الآن بعدد {count} من الحسابات:\n{accounts}\n\n• 📊 <b>لوحة التحكم:</b> {dashboardLink}\n\nستصلك هنا تأكيدات الدفع وتنبيهات حد المخاطرة والتحديثات المهمة. أهلاً بك! 🚀",
    startRelinked:
      "✅ <b>تمت إعادة الربط!</b>\n\nTelegram الخاص بك مرتبط بعدد {count} من الحسابات:\n{accounts}\n\n• 📊 <b>لوحة التحكم:</b> {dashboardLink}\n\nسيستمر وصول الإشعارات إلى هنا.",
    help:
      "👋 يرسل هذا البوت إشعارات لوحة متداولي RFX الخاصة بك. لربط هذه المحادثة بحسابك، أرسل /start.",
    startUnknown:
      "👋 مرحباً @{username}! لربط Telegram الخاص بك بلوحة متداولي RFX، احفظ أولاً معرّف Telegram في إعدادات لوحة التحكم، ثم أرسل /start مرة أخرى.",
  },

  serverErrors: {
    "Invalid magic number": "Magic Number غير صحيح",
    "Invalid password": "كلمة المرور غير صحيحة",
    "Magic number not found": "لم يُعثر على Magic Number",
    "Current password is incorrect": "كلمة المرور الحالية غير صحيحة",
    "Invalid or expired verification code":
      "رمز التحقق غير صحيح أو منتهي الصلاحية",
    "Too many login attempts. Try again in 15 minutes.":
      "محاولات تسجيل دخول كثيرة جداً. حاول مرة أخرى بعد 15 دقيقة.",
    "Too many reset requests. Try again in 15 minutes.":
      "طلبات إعادة تعيين كثيرة جداً. حاول مرة أخرى بعد 15 دقيقة.",
    "Too many verification attempts. Request a new code and try again.":
      "محاولات تحقق كثيرة جداً. اطلب رمزاً جديداً ثم حاول مرة أخرى.",
    "Failed to send verification code. Try again later.":
      "تعذّر إرسال رمز التحقق. حاول مرة أخرى لاحقاً.",
    "Failed to send Telegram message. Please try again.":
      "تعذّر إرسال رسالة Telegram. يرجى المحاولة مرة أخرى.",
    "No Telegram handle set. Save your handle first.":
      "لم يتم تعيين معرّف Telegram. احفظ معرّفك أولاً.",
    "No Telegram linked to this account. Contact an admin to reset your password.":
      "لا يوجد Telegram مرتبط بهذا الحساب. تواصل مع أحد المسؤولين لإعادة تعيين كلمة المرور.",
    "Telegram not connected yet. Open Telegram, search for @RFXTraderBot and send /start, then try again.":
      "لم يتم ربط Telegram بعد. افتح Telegram وابحث عن @RFXTraderBot وأرسل /start، ثم حاول مرة أخرى.",
  },
};
