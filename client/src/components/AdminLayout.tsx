import { ReactNode } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  LayoutDashboard,
  Users,
  Settings,
  CreditCard,
  LogOut,
  TrendingUp,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";

interface AdminLayoutProps {
  children: ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const [location, setLocation] = useLocation();
  const logoutMutation = trpc.trading.tradingLogout.useMutation({
    onSuccess: () => {
      toast.success("Logged out successfully");
      setLocation("/");
    },
  });

  // Poll active breach count every 30 seconds for the sidebar badge
  const { data: breachCountData } = trpc.admin.countActiveBreaches.useQuery(undefined, {
    refetchInterval: 30000,
    // Don't throw on error — badge just won't show
    retry: false,
  });
  const activeBreachCount = breachCountData?.count ?? 0;

  const navItems = [
    {
      title: "Trader Dashboard",
      href: "/admin/dashboard",
      icon: LayoutDashboard,
      badge: 0,
    },
    {
      title: "Manage Traders",
      href: "/admin/traders",
      icon: Users,
      badge: 0,
    },
    {
      title: "Manage MetaCopier",
      href: "/admin/metacopier",
      icon: Settings,
      badge: 0,
    },
    {
      title: "Manage Payments",
      href: "/admin/payments",
      icon: CreditCard,
      badge: 0,
    },
    {
      title: "Risk Limit Breaches",
      href: "/admin/risk-breaches",
      icon: ShieldAlert,
      badge: activeBreachCount,
    },
  ];

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-card flex flex-col">
        {/* Logo/Header */}
        <div className="p-6 border-b">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-lg">RFX Admin</h2>
              <p className="text-xs text-muted-foreground">Management Portal</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 px-3 py-4">
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.href;
              
              return (
                <Button
                  key={item.href}
                  variant={isActive ? "secondary" : "ghost"}
                  className="w-full justify-start gap-3"
                  onClick={() => setLocation(item.href)}
                >
                  <Icon className="w-4 h-4" />
                  <span className="flex-1 text-left">{item.title}</span>
                  {item.badge > 0 && (
                    <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-xs font-semibold leading-none">
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  )}
                </Button>
              );
            })}
          </nav>
        </ScrollArea>

        <Separator />

        {/* Version Info and Logout Button */}
        <div className="p-3 pb-4 space-y-3">
          <div className="text-xs text-center text-muted-foreground">
            App version 1.4.8 · Build 8586c03
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={handleLogout}
            disabled={logoutMutation.isPending}
          >
            <LogOut className="w-4 h-4" />
            Logout
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
