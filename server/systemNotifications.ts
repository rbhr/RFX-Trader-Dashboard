/**
 * In-app notifications the system writes (as opposed to admin-typed ones).
 * Each is stored with its shared/i18n key and params, so the dashboard renders
 * it in the reader's language; `title`/`message` keep the English rendering as
 * the fallback for anything that reads the row directly.
 */
import { createNotification } from "./db";
import { translate, type TranslationParams } from "@shared/i18n";
import type { en } from "@shared/i18n/en";

export type SystemNotificationKey = keyof typeof en.notifications;

export async function createSystemNotification(opts: {
  magicNumberId: number;
  key: SystemNotificationKey;
  params: TranslationParams;
  type: "payment" | "info" | "warning" | "error";
}) {
  const { magicNumberId, key, params, type } = opts;
  return createNotification({
    magicNumberId,
    title: translate("en", `notifications.${key}.title`, params),
    message: translate("en", `notifications.${key}.message`, params),
    i18nKey: key,
    i18nParams: JSON.stringify(params),
    type,
    isRead: false,
  });
}
