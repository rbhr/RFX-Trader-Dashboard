import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { Checkbox } from "@/components/ui/checkbox";
import { TrendingUp, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function Login() {
  const [, setLocation] = useLocation();
  const [magicNumber, setMagicNumber] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);


  const loginMutation = trpc.trading.login.useMutation({
    onSuccess: (data) => {
      toast.success(`Welcome back, ${data.name}!`);
      // Redirect admin users to admin dashboard
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

  // Load saved credentials from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("rfx_remember");
    if (saved) {
      try {
        const { magicNumber: savedMagic, rememberMe: savedRemember } = JSON.parse(saved);
        if (savedMagic) setMagicNumber(savedMagic);
        if (savedRemember) setRememberMe(true);
      } catch (e) {
        // Ignore parse errors
      }
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!magicNumber) {
      toast.error("Please select a magic number");
      return;
    }
    
    if (!password) {
      toast.error("Please enter your password");
      return;
    }

    // Save remember me preference
    if (rememberMe) {
      localStorage.setItem("rfx_remember", JSON.stringify({ magicNumber, rememberMe }));
    } else {
      localStorage.removeItem("rfx_remember");
    }

    loginMutation.mutate({ magicNumber, password, rememberMe });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/20 to-background p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <TrendingUp className="w-8 h-8 text-primary" />
          </div>
          <div>
            <CardTitle className="text-2xl">RFX Trader Dashboard</CardTitle>
            <CardDescription className="mt-2">
              Track your trading performance
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="magicNumber">Magic Number</Label>
              <Input
                id="magicNumber"
                type="text"
                value={magicNumber}
                onChange={(e) => setMagicNumber(e.target.value)}
                placeholder="Enter your magic number"
                disabled={loginMutation.isPending}
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
                disabled={loginMutation.isPending}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="rememberMe"
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                disabled={loginMutation.isPending}
              />
              <Label
                htmlFor="rememberMe"
                className="text-sm font-normal cursor-pointer"
              >
                Remember me
              </Label>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={loginMutation.isPending || !magicNumber || !password}
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
        </CardContent>
      </Card>
    </div>
  );
}
