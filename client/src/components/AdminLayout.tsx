import { ReactNode, useState, useEffect, useRef } from "react";
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
  ScrollText,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { toast } from "sonner";

interface AdminLayoutProps {
  children: ReactNode;
}

const MIN_W = 200;
const MAX_W = 420;
const COLLAPSED_W = 64;
const DEFAULT_W = 256;

export default function AdminLayout({ children }: AdminLayoutProps) {
  const [location, setLocation] = useLocation();

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("admin-sidebar-collapsed") === "1";
  });
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_W;
    const w = parseInt(localStorage.getItem("admin-sidebar-width") || "", 10);
    return Number.isFinite(w) ? Math.min(MAX_W, Math.max(MIN_W, w)) : DEFAULT_W;
  });
  const resizing = useRef(false);

  useEffect(() => {
    localStorage.setItem("admin-sidebar-collapsed", collapsed ? "1" : "0");
  }, [collapsed]);
  useEffect(() => {
    localStorage.setItem("admin-sidebar-width", String(width));
  }, [width]);

  // Drag-to-resize the sidebar (the sidebar's left edge is at viewport x=0).
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizing.current) return;
      setWidth(Math.min(MAX_W, Math.max(MIN_W, e.clientX)));
    };
    const onUp = () => {
      if (!resizing.current) return;
      resizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    resizing.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const logoutMutation = trpc.trading.tradingLogout.useMutation({
    onSuccess: () => {
      toast.success("Logged out successfully");
      setLocation("/");
    },
  });

  const { data: breachCountData } = trpc.admin.countActiveBreaches.useQuery(undefined, {
    refetchInterval: 30000,
    retry: false,
  });
  const activeBreachCount = breachCountData?.count ?? 0;

  const navItems = [
    { title: "Trader Dashboard", href: "/admin/dashboard", icon: LayoutDashboard, badge: 0 },
    { title: "Manage Traders", href: "/admin/traders", icon: Users, badge: 0 },
    { title: "Manage MetaCopier", href: "/admin/metacopier", icon: Settings, badge: 0 },
    { title: "Manage Payments", href: "/admin/payments", icon: CreditCard, badge: 0 },
    { title: "Risk Limit Breaches", href: "/admin/risk-breaches", icon: ShieldAlert, badge: activeBreachCount },
    { title: "System Logs", href: "/admin/logs", icon: ScrollText, badge: 0 },
  ];

  const handleLogout = () => logoutMutation.mutate();

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside
        className="relative border-r bg-card flex flex-col shrink-0 transition-[width] duration-150"
        style={{ width: collapsed ? COLLAPSED_W : width }}
      >
        {/* Header */}
        <div className={`border-b p-3 flex items-center ${collapsed ? "justify-center" : "gap-3"}`}>
          {!collapsed && (
            <>
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <TrendingUp className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-lg truncate">RFX Admin</h2>
                <p className="text-xs text-muted-foreground truncate">Management Portal</p>
              </div>
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 shrink-0"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </Button>
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 px-2 py-4">
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.href;
              return (
                <Button
                  key={item.href}
                  variant={isActive ? "secondary" : "ghost"}
                  className={`w-full gap-3 ${collapsed ? "justify-center px-0" : "justify-start"}`}
                  onClick={() => setLocation(item.href)}
                  title={collapsed ? item.title : undefined}
                >
                  <span className="relative shrink-0">
                    <Icon className="w-4 h-4" />
                    {collapsed && item.badge > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 w-2 h-2 rounded-full bg-destructive" />
                    )}
                  </span>
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left truncate">{item.title}</span>
                      {item.badge > 0 && (
                        <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-xs font-semibold leading-none">
                          {item.badge > 99 ? "99+" : item.badge}
                        </span>
                      )}
                    </>
                  )}
                </Button>
              );
            })}
          </nav>
        </ScrollArea>

        <Separator />

        {/* Version Info and Logout */}
        <div className="p-2 pb-4 space-y-3">
          {!collapsed && (
            <div className="text-xs text-center text-muted-foreground">
              App version {__APP_VERSION__} · Build {__BUILD_HASH__}
            </div>
          )}
          <Button
            variant="ghost"
            className={`w-full gap-3 text-destructive hover:text-destructive hover:bg-destructive/10 ${collapsed ? "justify-center px-0" : "justify-start"}`}
            onClick={handleLogout}
            disabled={logoutMutation.isPending}
            title={collapsed ? "Logout" : undefined}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!collapsed && "Logout"}
          </Button>
        </div>

        {/* Resize handle (only when expanded) */}
        {!collapsed && (
          <div
            onMouseDown={startResize}
            className="absolute top-0 right-0 h-full w-1 cursor-col-resize hover:bg-primary/40 active:bg-primary/60"
            aria-hidden="true"
          />
        )}
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
