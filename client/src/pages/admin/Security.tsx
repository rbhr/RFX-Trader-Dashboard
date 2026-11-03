import AdminLayout from "@/components/AdminLayout";
import { AuthenticatorCard } from "@/components/AuthenticatorCard";
import { ChangePasswordCard } from "@/components/ChangePasswordCard";
import { trpc } from "@/lib/trpc";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PAYMENT_ELEVATION_MINUTES, TOTP_CHANGE_COOL_OFF_HOURS } from "@shared/const";

/**
 * The admin's own account security.
 *
 * It needs a home of its own because the admin never sees the trader Settings
 * dialog: /admin/dashboard renders the trader dashboard with a
 * `viewAsTraderId`, and the Settings button is hidden while viewing as someone
 * else. So the one account that most needs an authenticator had nowhere to
 * enrol one.
 */
export default function Security() {
  const { data: session } = trpc.trading.getSession.useQuery(undefined);

  const hold = session?.authenticatorHoldUntil
    ? new Date(session.authenticatorHoldUntil)
    : null;
  const holdActive = !!hold && hold.getTime() > Date.now();
  const elevation = session?.paymentElevationExpiresAt
    ? new Date(session.paymentElevationExpiresAt)
    : null;
  const elevated = !!elevation && elevation.getTime() > Date.now();
  const utc = (d: Date) => `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;

  return (
    <AdminLayout>
      <div className="p-8 max-w-2xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Security</h1>
          <p className="text-muted-foreground mt-2">
            The second factor on your own admin account. Signed in as{" "}
            <span className="font-mono">{session?.magicNumber ?? "…"}</span>.
          </p>
        </div>

        <AuthenticatorCard />

        <ChangePasswordCard />

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Payouts</CardTitle>
            <CardDescription>
              What has to be true before this session can move money.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-start justify-between gap-4">
              <span>Authenticator enrolled</span>
              <span className={session?.totpEnabled ? "text-foreground" : "text-destructive"}>
                {session?.totpEnabled ? "Yes" : "No — payouts are refused"}
              </span>
            </div>
            <div className="flex items-start justify-between gap-4">
              <span>Recovery codes left</span>
              <span>{session?.totpRecoveryRemaining ?? 0} of 10</span>
            </div>
            <div className="flex items-start justify-between gap-4">
              <span>Payment window</span>
              <span>
                {elevated
                  ? `Open until ${utc(elevation!)}`
                  : `Closed — a code is asked for before the next payout, then covers ${PAYMENT_ELEVATION_MINUTES} minutes`}
              </span>
            </div>
            {holdActive && (
              <div className="flex items-start justify-between gap-4 text-destructive">
                <span>Authenticator recently changed</span>
                <span>Payouts held until {utc(hold!)}</span>
              </div>
            )}
            <p className="text-xs text-muted-foreground pt-2">
              Removing or replacing the authenticator holds payouts for{" "}
              {TOTP_CHANGE_COOL_OFF_HOURS} hours. Signing in with a recovery code does not.
            </p>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
