import { useState } from "react";

import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/toast";

/**
 * Change the signed-in account's password.
 *
 * Shared by the trader Settings dialog and the admin Security page for the
 * same reason as AuthenticatorCard: the admin never sees that dialog, because
 * /admin/dashboard renders the trader dashboard with a `viewAsTraderId` and
 * the Settings button is hidden while viewing as somebody else. Changing the
 * admin password had to be done through the database.
 *
 * Two steps when the account has a second factor, which the server decides:
 * `changePassword` returns `requiresTotp` for an authenticator and
 * `requires2FA` for a Telegram code, and the field accepts either — a recovery
 * code carries letters and a dash, so it is only narrowed to digits for the
 * Telegram path.
 */
export function ChangePasswordCard() {
  const { t, tError } = useLanguage();
  const utils = trpc.useUtils();
  const { data: selfSession } = trpc.trading.getSession.useQuery(undefined);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordChangeStep, setPasswordChangeStep] = useState<"form" | "2fa">("form");
  const [passwordChangeCode, setPasswordChangeCode] = useState("");

  const changePasswordMutation = trpc.trading.changePassword.useMutation({
    onSuccess: (data) => {
      if (data.requiresTotp) {
        setPasswordChangeStep("2fa");
        return;
      }
      if (data.requires2FA) {
        setPasswordChangeStep("2fa");
        toast.info(t("common.codeSentToTelegram"));
        return;
      }
      toast.success(t("settings.passwordChanged"));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setPasswordChangeCode("");
      setPasswordChangeStep("form");
      // Every other session for this account has just been signed out.
      void utils.trading.getSession.invalidate();
    },
    onError: (error) => {
      toast.error(tError(error.message));
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("settings.changePassword")}</CardTitle>
        <CardDescription>
          {t("settings.changePasswordDesc")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {passwordChangeStep === "form" ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">{t("settings.currentPassword")}</Label>
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder={t("settings.currentPasswordPlaceholder")}
                disabled={changePasswordMutation.isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">{t("settings.newPassword")}</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t("common.atLeastSixCharacters")}
                disabled={changePasswordMutation.isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmNewPassword">{t("settings.confirmNewPassword")}</Label>
              <Input
                id="confirmNewPassword"
                type="password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                placeholder={t("settings.confirmNewPasswordPlaceholder")}
                disabled={changePasswordMutation.isPending}
              />
            </div>
            {newPassword && confirmNewPassword && newPassword !== confirmNewPassword && (
              <p className="text-xs text-red-500">{t("common.passwordsDoNotMatch")}</p>
            )}
            <Button
              className="w-full"
              onClick={() => {
                if (newPassword !== confirmNewPassword) {
                  toast.error(t("common.passwordsDoNotMatch"));
                  return;
                }
                if (newPassword.length < 6) {
                  toast.error(t("common.passwordTooShort"));
                  return;
                }
                changePasswordMutation.mutate({
                  currentPassword,
                  newPassword,
                });
              }}
              disabled={
                changePasswordMutation.isPending ||
                !currentPassword ||
                !newPassword ||
                !confirmNewPassword ||
                newPassword !== confirmNewPassword
              }
            >
              {changePasswordMutation.isPending ? t("settings.changing") : t("settings.changePassword")}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {selfSession?.totpEnabled
                ? t("login.authenticatorSubtitle")
                : t("settings.codeSentEnterBelow")}
            </p>
            <div className="space-y-2">
              <Label htmlFor="passwordChangeCode">
                {selfSession?.totpEnabled
                  ? t("login.authenticatorCode")
                  : t("common.verificationCode")}
              </Label>
              <Input
                id="passwordChangeCode"
                type="text"
                dir="ltr"
                maxLength={selfSession?.totpEnabled ? 16 : 6}
                value={passwordChangeCode}
                // A recovery code has letters and a dash in it, so
                // only the Telegram code is narrowed to digits.
                onChange={(e) =>
                  setPasswordChangeCode(
                    selfSession?.totpEnabled
                      ? e.target.value.trim()
                      : e.target.value.replace(/\D/g, "")
                  )
                }
                placeholder={t("common.enterSixDigitCode")}
                disabled={changePasswordMutation.isPending}
                autoFocus
                className="text-center text-2xl tracking-widest font-mono"
              />
            </div>
            <Button
              className="w-full"
              onClick={() => {
                changePasswordMutation.mutate({
                  currentPassword,
                  newPassword,
                  ...(selfSession?.totpEnabled
                    ? { totpCode: passwordChangeCode }
                    : { twoFactorCode: passwordChangeCode }),
                });
              }}
              disabled={changePasswordMutation.isPending || passwordChangeCode.length < 6}
            >
              {changePasswordMutation.isPending ? t("common.verifying") : t("settings.verifyAndChange")}
            </Button>
            <button
              type="button"
              className="w-full text-sm text-muted-foreground hover:text-primary"
              onClick={() => {
                setPasswordChangeStep("form");
                setPasswordChangeCode("");
              }}
            >
              {t("common.cancel")}
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
