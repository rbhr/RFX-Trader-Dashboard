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

type LoginStep = "credentials" | "two_factor" | "forgot_magic" | "forgot_code" | "forgot_newpass";

export default function Login() {
  const [, setLocation] = useLocation();
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
        toast.info("A verification code has been sent to your Telegram.");
        return;
      }
      toast.success(`Welcome back, ${data.name}!`);
      if (data.isAdmin) {
        setLocation("/admin/dashboard");
      } else {
        setLocation("/dashboard");
      }
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const requestResetMutation = trpc.trading.requestPasswordReset.useMutation({
    onSuccess: () => {
      setStep("forgot_code");
      toast.info("A verification code has been sent to your Telegram.");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const resetPasswordMutation = trpc.trading.resetPassword.useMutation({
    onSuccess: () => {
      toast.success("Password reset successfully! Please log in.");
      setStep("credentials");
      setPassword("");
      setResetCode("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (error) => {
      toast.error(error.message);
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
      toast.error("Please enter your magic number");
      return;
    }
    requestResetMutation.mutate({ magicNumber });
  };

  const handleResetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/20 to-background p-4">
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
                ? "Verify Your Identity"
                : step.startsWith("forgot")
                  ? "Reset Password"
                  : "RFX Trader Dashboard"}
            </CardTitle>
            <CardDescription className="mt-2">
              {step === "two_factor"
                ? "Enter the 6-digit code sent to your Telegram"
                : step === "forgot_magic"
                  ? "Enter your magic number to receive a reset code"
                  : step === "forgot_code"
                    ? "Enter the verification code sent to your Telegram"
                    : step === "forgot_newpass"
                      ? "Set your new password"
                      : "Track your trading performance"}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {step === "credentials" && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="magicNumber">Magic Number</Label>
                <Input
                  id="magicNumber"
                  type="text"
                  value={magicNumber}
                  onChange={(e) => setMagicNumber(e.target.value)}
                  placeholder="Enter your magic number"
                  disabled={isPending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  disabled={isPending}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
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
                    Remember me
                  </Label>
                </div>
                <button
                  type="button"
                  className="text-sm text-primary hover:underline"
                  onClick={() => setStep("forgot_magic")}
                >
                  Forgot password?
                </button>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isPending || !magicNumber || !password}
              >
                {loginMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign In"
                )}
              </Button>
            </form>
          )}

          {step === "two_factor" && (
            <form onSubmit={handleTwoFactorSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="twoFactorCode">Verification Code</Label>
                <Input
                  id="twoFactorCode"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={twoFactorCode}
                  onChange={(e) =>
                    setTwoFactorCode(e.target.value.replace(/\D/g, ""))
                  }
                  placeholder="Enter 6-digit code"
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
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Verify & Sign In"
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
                <ArrowLeft className="h-3 w-3" />
                Back to login
              </button>
            </form>
          )}

          {step === "forgot_magic" && (
            <form onSubmit={handleForgotRequest} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="forgotMagic">Magic Number</Label>
                <Input
                  id="forgotMagic"
                  type="text"
                  value={magicNumber}
                  onChange={(e) => setMagicNumber(e.target.value)}
                  placeholder="Enter your magic number"
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
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending code...
                  </>
                ) : (
                  "Send Reset Code"
                )}
              </Button>

              <button
                type="button"
                className="w-full text-sm text-muted-foreground hover:text-primary flex items-center justify-center gap-1"
                onClick={() => setStep("credentials")}
              >
                <ArrowLeft className="h-3 w-3" />
                Back to login
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
                <Label htmlFor="resetCode">Verification Code</Label>
                <Input
                  id="resetCode"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={resetCode}
                  onChange={(e) =>
                    setResetCode(e.target.value.replace(/\D/g, ""))
                  }
                  placeholder="Enter 6-digit code"
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
                Continue
              </Button>

              <button
                type="button"
                className="w-full text-sm text-muted-foreground hover:text-primary flex items-center justify-center gap-1"
                onClick={() => {
                  setStep("forgot_magic");
                  setResetCode("");
                }}
              >
                <ArrowLeft className="h-3 w-3" />
                Back
              </button>
            </form>
          )}

          {step === "forgot_newpass" && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  disabled={isPending}
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your new password"
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
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Resetting...
                  </>
                ) : (
                  "Reset Password"
                )}
              </Button>

              <button
                type="button"
                className="w-full text-sm text-muted-foreground hover:text-primary flex items-center justify-center gap-1"
                onClick={() => setStep("forgot_code")}
              >
                <ArrowLeft className="h-3 w-3" />
                Back
              </button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
