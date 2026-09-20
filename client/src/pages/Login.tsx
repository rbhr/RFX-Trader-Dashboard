import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { TrendingUp, Loader2, ArrowLeft, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import { LanguageSelector } from "@/components/LanguageSelector";

type LoginStep = "credentials" | "two_factor" | "forgot_magic" | "forgot_code" | "forgot_newpass";

export default function Login() {
  const [, setLocation] = useLocation();
  const { t, tError } = useLanguage();
  const [step, setStep] = useState<LoginStep>("credentials");
  const [magicNumber, setMagicNumber] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const loginMutation = trpc.trading.login.useMutation({
    onSuccess: (data) => {
      if (data.requires2FA) {
        setStep("two_factor");
        toast.info(t("common.codeSentToTelegram"));
        return;
      }
      toast.success(t("login.welcomeBack", { name: data.name }));
      if (data.isAdmin) {
        setLocation("/admin/dashboard");
      } else {
        setLocation("/dashboard");
      }
    },
    onError: (error) => {
      toast.error(tError(error.message));
    },
  });

  const requestResetMutation = trpc.trading.requestPasswordReset.useMutation({
    onSuccess: () => {
      setStep("forgot_code");
      toast.info(t("common.codeSentToTelegram"));
    },
    onError: (error) => {
      toast.error(tError(error.message));
    },
  });

  const resetPasswordMutation = trpc.trading.resetPassword.useMutation({
    onSuccess: () => {
      toast.success(t("login.resetSuccess"));
      setStep("credentials");
      setPassword("");
      setResetCode("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (error) => {
      toast.error(tError(error.message));
    },
  });

  useEffect(() => {
    const saved = localStorage.getItem("rfx_remember");
    if (saved) {
      try {
        const {
          magicNumber: savedMagic,
          rememberMe: savedRemember,
        } = JSON.parse(saved);
        if (savedMagic) setMagicNumber(savedMagic);
        if (savedRemember) setRememberMe(true);
      } catch {
        // Ignore parse errors
      }
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!magicNumber || !password) return;

    if (rememberMe) {
      localStorage.setItem(
        "rfx_remember",
        JSON.stringify({ magicNumber, rememberMe })
      );
    } else {
      localStorage.removeItem("rfx_remember");
    }

    loginMutation.mutate({ magicNumber, password, rememberMe });
  };

  const handleTwoFactorSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!twoFactorCode) return;
    loginMutation.mutate({
      magicNumber,
      password,
      rememberMe,
      twoFactorCode,
    });
  };

  const handleForgotRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!magicNumber) {
      toast.error(t("login.enterMagicFirst"));
      return;
    }
    requestResetMutation.mutate({ magicNumber });
  };

  const handleResetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error(t("common.passwordsDoNotMatch"));
      return;
    }
    if (newPassword.length < 6) {
      toast.error(t("common.passwordTooShort"));
      return;
    }
    resetPasswordMutation.mutate({
      magicNumber,
      code: resetCode,
      newPassword,
    });
  };

  const isPending =
    loginMutation.isPending ||
    requestResetMutation.isPending ||
    resetPasswordMutation.isPending;

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/20 to-background p-4">
      <div className="absolute top-4 end-4">
        <LanguageSelector />
      </div>
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            {step === "two_factor" ? (
              <ShieldCheck className="w-8 h-8 text-primary" />
            ) : (
              <TrendingUp className="w-8 h-8 text-primary" />
            )}
          </div>
          <div>
            <CardTitle className="text-2xl">
              {step === "two_factor"
                ? t("login.verifyTitle")
                : step.startsWith("forgot")
                  ? t("login.resetTitle")
                  : t("common.appName")}
            </CardTitle>
            <CardDescription className="mt-2">
              {step === "two_factor"
                ? t("login.verifySubtitle")
                : step === "forgot_magic"
                  ? t("login.resetEnterMagic")
                  : step === "forgot_code"
                    ? t("login.resetEnterCode")
                    : step === "forgot_newpass"
                      ? t("login.resetSetNew")
                      : t("login.tagline")}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {step === "credentials" && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="magicNumber">{t("common.magicNumber")}</Label>
                <Input
                  id="magicNumber"
                  type="text"
                  dir="ltr"
                  value={magicNumber}
                  onChange={(e) => setMagicNumber(e.target.value)}
                  placeholder={t("login.magicPlaceholder")}
                  disabled={isPending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">{t("login.password")}</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("login.passwordPlaceholder")}
                  disabled={isPending}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="rememberMe"
                    checked={rememberMe}
                    onCheckedChange={(checked) =>
                      setRememberMe(checked as boolean)
                    }
                    disabled={isPending}
                  />
                  <Label
                    htmlFor="rememberMe"
                    className="text-sm font-normal cursor-pointer"
                  >
                    {t("login.rememberMe")}
                  </Label>
                </div>
                <button
                  type="button"
                  className="text-sm text-primary hover:underline"
                  onClick={() => setStep("forgot_magic")}
                >
                  {t("login.forgotPassword")}
                </button>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isPending || !magicNumber || !password}
              >
                {loginMutation.isPending ? (
                  <>
                    <Loader2 className="me-2 h-4 w-4 animate-spin" />
                    {t("login.signingIn")}
                  </>
                ) : (
                  t("login.signIn")
                )}
              </Button>
            </form>
          )}

          {step === "two_factor" && (
            <form onSubmit={handleTwoFactorSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="twoFactorCode">{t("common.verificationCode")}</Label>
                <Input
                  id="twoFactorCode"
                  type="text"
                  inputMode="numeric"
                  dir="ltr"
                  maxLength={6}
                  value={twoFactorCode}
                  onChange={(e) =>
                    setTwoFactorCode(e.target.value.replace(/\D/g, ""))
                  }
                  placeholder={t("common.enterSixDigitCode")}
                  disabled={isPending}
                  autoFocus
                  className="text-center text-2xl tracking-widest font-mono"
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isPending || twoFactorCode.length !== 6}
              >
                {loginMutation.isPending ? (
                  <>
                    <Loader2 className="me-2 h-4 w-4 animate-spin" />
                    {t("common.verifying")}
                  </>
                ) : (
                  t("login.verifyAndSignIn")
                )}
              </Button>

              <button
                type="button"
                className="w-full text-sm text-muted-foreground hover:text-primary flex items-center justify-center gap-1"
                onClick={() => {
                  setStep("credentials");
                  setTwoFactorCode("");
                }}
              >
                <ArrowLeft className="h-3 w-3 rtl:rotate-180" />
                {t("login.backToLogin")}
              </button>
            </form>
          )}

          {step === "forgot_magic" && (
            <form onSubmit={handleForgotRequest} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="forgotMagic">{t("common.magicNumber")}</Label>
                <Input
                  id="forgotMagic"
                  type="text"
                  dir="ltr"
                  value={magicNumber}
                  onChange={(e) => setMagicNumber(e.target.value)}
                  placeholder={t("login.magicPlaceholder")}
                  disabled={isPending}
                  autoFocus
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isPending || !magicNumber}
              >
                {requestResetMutation.isPending ? (
                  <>
                    <Loader2 className="me-2 h-4 w-4 animate-spin" />
                    {t("login.sendingCode")}
                  </>
                ) : (
                  t("login.sendResetCode")
                )}
              </Button>

              <button
                type="button"
                className="w-full text-sm text-muted-foreground hover:text-primary flex items-center justify-center gap-1"
                onClick={() => setStep("credentials")}
              >
                <ArrowLeft className="h-3 w-3 rtl:rotate-180" />
                {t("login.backToLogin")}
              </button>
            </form>
          )}

          {step === "forgot_code" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (resetCode.length === 6) setStep("forgot_newpass");
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="resetCode">{t("common.verificationCode")}</Label>
                <Input
                  id="resetCode"
                  type="text"
                  inputMode="numeric"
                  dir="ltr"
                  maxLength={6}
                  value={resetCode}
                  onChange={(e) =>
                    setResetCode(e.target.value.replace(/\D/g, ""))
                  }
                  placeholder={t("common.enterSixDigitCode")}
                  disabled={isPending}
                  autoFocus
                  className="text-center text-2xl tracking-widest font-mono"
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={resetCode.length !== 6}
              >
                {t("login.continue")}
              </Button>

              <button
                type="button"
                className="w-full text-sm text-muted-foreground hover:text-primary flex items-center justify-center gap-1"
                onClick={() => {
                  setStep("forgot_magic");
                  setResetCode("");
                }}
              >
                <ArrowLeft className="h-3 w-3 rtl:rotate-180" />
                {t("common.back")}
              </button>
            </form>
          )}

          {step === "forgot_newpass" && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newPassword">{t("login.newPassword")}</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t("common.atLeastSixCharacters")}
                  disabled={isPending}
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">{t("login.confirmPassword")}</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t("login.confirmPasswordPlaceholder")}
                  disabled={isPending}
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={
                  isPending ||
                  !newPassword ||
                  !confirmPassword ||
                  newPassword !== confirmPassword
                }
              >
                {resetPasswordMutation.isPending ? (
                  <>
                    <Loader2 className="me-2 h-4 w-4 animate-spin" />
                    {t("login.resetting")}
                  </>
                ) : (
                  t("login.resetPassword")
                )}
              </Button>

              <button
                type="button"
                className="w-full text-sm text-muted-foreground hover:text-primary flex items-center justify-center gap-1"
                onClick={() => setStep("forgot_code")}
              >
                <ArrowLeft className="h-3 w-3 rtl:rotate-180" />
                {t("common.back")}
              </button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
