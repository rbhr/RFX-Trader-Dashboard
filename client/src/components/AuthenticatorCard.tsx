import { useState } from "react";

import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import { Badge } from "@/components/ui/badge";
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
 * Enrol or remove an authenticator for the signed-in account.
 *
 * Shared by the trader Settings dialog and the admin Security page, which is
 * not tidiness: the admin dashboard only ever renders the trader dashboard
 * with a `viewAsTraderId`, so the Settings button is hidden and an admin has
 * no way into the dialog at all. Without a second home for this card, the one
 * account that most needs an authenticator could not enrol one.
 *
 * Self-contained — it owns its own session query and state, so dropping it on
 * a page is the whole integration.
 */
export function AuthenticatorCard() {
  const { t, tError } = useLanguage();
  const utils = trpc.useUtils();
  const { data: selfSession } = trpc.trading.getSession.useQuery(undefined);

  const [totpStep, setTotpStep] = useState<
    "idle" | "password" | "scan" | "recovery" | "disable"
  >("idle");
  const [totpPassword, setTotpPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [totpSetup, setTotpSetup] = useState<{
    secret: string;
    qrDataUrl: string;
    uri: string;
  } | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  const startTotpMutation = trpc.trading.startTotpEnrolment.useMutation({
    onSuccess: data => {
      setTotpSetup(data);
      setTotpPassword("");
      setTotpStep("scan");
    },
    onError: error => toast.error(tError(error.message)),
  });
  const confirmTotpMutation = trpc.trading.confirmTotpEnrolment.useMutation({
    onSuccess: data => {
      setRecoveryCodes(data.recoveryCodes);
      setTotpCode("");
      setTotpSetup(null);
      setTotpStep("recovery");
      void utils.trading.getSession.invalidate();
    },
    onError: error => toast.error(tError(error.message)),
  });
  const disableTotpMutation = trpc.trading.disableTotp.useMutation({
    onSuccess: () => {
      toast.success(t("settings.totpTurnedOff"));
      setTotpPassword("");
      setTotpCode("");
      setTotpStep("idle");
      void utils.trading.getSession.invalidate();
    },
    onError: error => toast.error(tError(error.message)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("settings.totpTitle")}</CardTitle>
        <CardDescription>{t("settings.totpDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
      {totpStep === "idle" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant={selfSession?.totpEnabled ? "default" : "secondary"}>
              {selfSession?.totpEnabled ? t("settings.totpOn") : t("settings.totpOff")}
            </Badge>
            {selfSession?.totpEnabled && (
              <span className="text-xs text-muted-foreground">
                {t("settings.totpRecoveryRemaining", {
                  count: String(selfSession.totpRecoveryRemaining ?? 0),
                })}
              </span>
            )}
          </div>
          {selfSession?.totpEnabled ? (
            <Button variant="outline" onClick={() => setTotpStep("disable")}>
              {t("settings.totpTurnOff")}
            </Button>
          ) : (
            <Button onClick={() => setTotpStep("password")}>
              {t("settings.totpSetUp")}
            </Button>
          )}
        </div>
      )}

      {(totpStep === "password" || totpStep === "disable") && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("settings.totpConfirmPassword")}
          </p>
          <div className="space-y-2">
            <Label htmlFor="totpPassword">{t("settings.currentPassword")}</Label>
            <Input
              id="totpPassword"
              type="password"
              value={totpPassword}
              onChange={(e) => setTotpPassword(e.target.value)}
              autoFocus
            />
          </div>
          {totpStep === "disable" && (
            <div className="space-y-2">
              <Label htmlFor="totpDisableCode">{t("login.authenticatorCode")}</Label>
              <Input
                id="totpDisableCode"
                dir="ltr"
                maxLength={16}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.trim())}
                placeholder={t("login.authenticatorPlaceholder")}
                className="text-center text-xl tracking-widest font-mono"
              />
            </div>
          )}
          <div className="flex gap-2">
            <Button
              onClick={() => {
                if (totpStep === "disable") {
                  disableTotpMutation.mutate({ password: totpPassword, code: totpCode });
                } else {
                  startTotpMutation.mutate({ password: totpPassword });
                }
              }}
              disabled={
                !totpPassword ||
                (totpStep === "disable" && totpCode.length < 6) ||
                startTotpMutation.isPending ||
                disableTotpMutation.isPending
              }
            >
              {t("login.continue")}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setTotpStep("idle");
                setTotpPassword("");
                setTotpCode("");
              }}
            >
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      )}

      {totpStep === "scan" && totpSetup && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("settings.totpScan")}</p>
          <div className="flex justify-center">
            <img
              src={totpSetup.qrDataUrl}
              alt={t("settings.totpTitle")}
              className="rounded-lg border bg-white p-2"
              width={240}
              height={240}
            />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t("settings.totpManualKey")}</p>
            <p className="font-mono text-xs break-all select-all" dir="ltr">
              {totpSetup.secret}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="totpConfirmCode">{t("login.authenticatorCode")}</Label>
            <Input
              id="totpConfirmCode"
              dir="ltr"
              inputMode="numeric"
              maxLength={6}
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
              placeholder={t("common.enterSixDigitCode")}
              autoFocus
              className="text-center text-2xl tracking-widest font-mono"
            />
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => confirmTotpMutation.mutate({ code: totpCode })}
              disabled={totpCode.length !== 6 || confirmTotpMutation.isPending}
            >
              {confirmTotpMutation.isPending ? t("common.verifying") : t("settings.totpEnable")}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setTotpStep("idle");
                setTotpSetup(null);
                setTotpCode("");
              }}
            >
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      )}

      {totpStep === "recovery" && (
        <div className="space-y-4">
          <p className="text-sm font-medium">{t("settings.totpRecoveryTitle")}</p>
          <p className="text-sm text-muted-foreground">{t("settings.totpRecoveryDesc")}</p>
          <div className="grid grid-cols-2 gap-2 rounded-lg border p-3" dir="ltr">
            {recoveryCodes.map((code) => (
              <span key={code} className="font-mono text-sm select-all">{code}</span>
            ))}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(recoveryCodes.join("\n"));
                toast.success(t("common.copied"));
              }}
            >
              {t("common.copy")}
            </Button>
            <Button
              onClick={() => {
                setRecoveryCodes([]);
                setTotpStep("idle");
              }}
            >
              {t("settings.totpRecoverySaved")}
            </Button>
          </div>
        </div>
      )}
      </CardContent>
    </Card>
  );
}
