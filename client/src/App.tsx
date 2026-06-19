import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import History from "./pages/History";
import AdminDashboard from "./pages/admin/AdminDashboard";
import ManageTraders from "./pages/admin/ManageTraders";
import ManageMetaCopier from "./pages/admin/ManageMetaCopier";
import ManagePayments from "./pages/admin/ManagePayments";
import ProcessPayouts from "./pages/admin/ProcessPayouts";
import RiskLimitBreaches from "./pages/admin/RiskLimitBreaches";
import Logs from "./pages/admin/Logs";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Login} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/history" component={History} />
      <Route path="/admin/dashboard" component={AdminDashboard} />
      <Route path="/admin/traders" component={ManageTraders} />
      <Route path="/admin/metacopier" component={ManageMetaCopier} />
      <Route path="/admin/payments" component={ManagePayments} />
      <Route path="/admin/payouts" component={ProcessPayouts} />
      <Route path="/admin/risk-breaches" component={RiskLimitBreaches} />
      <Route path="/admin/logs" component={Logs} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
