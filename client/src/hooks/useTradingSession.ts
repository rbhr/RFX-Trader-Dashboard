import { trpc } from "@/lib/trpc";

export function useTradingSession() {
  const { data: session, isLoading, error } = trpc.trading.getSession.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const logoutMutation = trpc.trading.tradingLogout.useMutation();

  const logout = async () => {
    await logoutMutation.mutateAsync();
    localStorage.removeItem("rfx_remember");
    window.location.href = "/";
  };

  return {
    session,
    isLoading,
    isAuthenticated: !!session && !error,
    error,
    logout,
  };
}
