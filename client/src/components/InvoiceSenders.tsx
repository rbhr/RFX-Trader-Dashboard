import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Mail, Link2, Send, Trash2, Copy, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "@/lib/toast";

/**
 * Managing the mailboxes invoices are sent from.
 *
 * Nothing here ever holds a password. Inviting a sender produces a link that
 * its owner opens themselves, so the permission is theirs to grant and theirs
 * to withdraw — which is the only workable arrangement when one of the senders
 * is somebody's personal Gmail.
 */

type Sender = {
  id: number;
  emailAddress: string;
  provider: "google" | "microsoft";
  displayName: string | null;
  status: "Invited" | "Active" | "Revoked" | "Error";
  scope: string | null;
  lastError: string | null;
  authorizedAt: string | Date | null;
  lastUsedAt: string | Date | null;
  inviteExpiresAt: string | Date | null;
};

const fmtWhen = (d: string | Date | null) =>
  d ? new Date(d).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "—";

function StatusBadge({ sender }: { sender: Sender }) {
  if (sender.status === "Active") {
    return (
      <Badge className="gap-1 bg-green-600 hover:bg-green-600">
        <CheckCircle2 className="h-3 w-3" />
        Authorised
      </Badge>
    );
  }
  if (sender.status === "Invited") {
    return <Badge variant="secondary">Awaiting authorisation</Badge>;
  }
  return (
    <Badge variant="destructive" className="gap-1">
      <AlertTriangle className="h-3 w-3" />
      {sender.status === "Revoked" ? "Needs re-authorising" : "Error"}
    </Badge>
  );
}

export default function InvoiceSenders() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.admin.getEmailSenders.useQuery();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [testFor, setTestFor] = useState<Sender | null>(null);
  const [testTo, setTestTo] = useState("");

  const invite = trpc.admin.inviteEmailSender.useMutation({
    onSuccess: result => {
      setInviteUrl(result.url);
      utils.admin.getEmailSenders.invalidate();
    },
    onError: err => toast.error(err.message),
  });

  const test = trpc.admin.testEmailSender.useMutation({
    onSuccess: () => {
      toast.success(`Test sent as ${testFor?.emailAddress}. Check the inbox and their Sent folder.`);
      setTestFor(null);
      utils.admin.getEmailSenders.invalidate();
    },
    onError: err => toast.error(err.message),
  });

  const remove = trpc.admin.deleteEmailSender.useMutation({
    onSuccess: () => {
      toast.success("Sender removed");
      utils.admin.getEmailSenders.invalidate();
    },
    onError: err => toast.error(err.message),
  });

  const senders = (data?.senders ?? []) as Sender[];
  const copy = (text: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success("Link copied"))
      .catch(() => toast.error("Could not copy — select the link and copy it by hand"));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Invoice Senders
        </CardTitle>
        <CardDescription>
          Mailboxes invoices can be sent from. The owner authorises their own mailbox, so we never
          hold a password — and the permission is send-only, so this app can't read their mail.
          Sent invoices appear in their Sent folder and replies come back to them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {data && !data.hasEncryptionKey && (
          <p className="text-sm text-destructive">
            <strong>EMAIL_TOKEN_KEY is not set.</strong> Generate one with{" "}
            <code>openssl rand -hex 32</code> and add it to <code>.env</code> before inviting a
            sender — without it there's nowhere safe to keep the authorisation.
          </p>
        )}
        {data && !data.configured && (
          <p className="text-sm text-destructive">
            <strong>Google sending isn't configured.</strong> Set <code>GOOGLE_MAIL_CLIENT_ID</code>,{" "}
            <code>GOOGLE_MAIL_CLIENT_SECRET</code> and <code>PUBLIC_BASE_URL</code>, and add this as
            an authorised redirect URI on the Google client:
            <br />
            <code className="break-all">{data.redirectUri || "(PUBLIC_BASE_URL not set)"}</code>
          </p>
        )}

        {isLoading ? (
          <p className="text-muted-foreground text-sm">Loading senders…</p>
        ) : senders.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No senders yet. Invite one to get started.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mailbox</TableHead>
                <TableHead>Host</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Authorised</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {senders.map(s => (
                <TableRow key={s.id}>
                  <TableCell>
                    <div className="font-medium">{s.emailAddress}</div>
                    {s.displayName && (
                      <div className="text-xs text-muted-foreground">{s.displayName}</div>
                    )}
                    {s.lastError && (
                      <div className="text-xs text-destructive max-w-md">{s.lastError}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {s.provider === "google" ? "Google" : "Microsoft 365"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge sender={s} />
                    {s.status === "Invited" && s.inviteExpiresAt && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Link valid until {fmtWhen(s.inviteExpiresAt)}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{fmtWhen(s.authorizedAt)}</TableCell>
                  <TableCell className="text-sm">{fmtWhen(s.lastUsedAt)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {s.status === "Active" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mr-2"
                        onClick={() => {
                          setTestFor(s);
                          setTestTo("");
                        }}
                      >
                        <Send className="h-4 w-4 mr-1" />
                        Test
                      </Button>
                    )}
                    {s.status !== "Active" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mr-2"
                        onClick={() => {
                          setEmail(s.emailAddress);
                          setDisplayName(s.displayName ?? "");
                          setInviteUrl(null);
                          setInviteOpen(true);
                        }}
                      >
                        <Link2 className="h-4 w-4 mr-1" />
                        New link
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => remove.mutate({ id: s.id })}
                      disabled={remove.isPending}
                      title="Remove this sender"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setEmail("");
            setDisplayName("");
            setInviteUrl(null);
            setInviteOpen(true);
          }}
        >
          <Mail className="h-4 w-4 mr-2" />
          Invite a sender
        </Button>
      </CardContent>

      {/* Invite */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite a sender</DialogTitle>
            <DialogDescription>
              Creates a one-time link for the mailbox owner to open. They sign in to Google and
              allow send-only access. The link works once and expires in 7 days.
            </DialogDescription>
          </DialogHeader>

          {inviteUrl ? (
            <div className="space-y-3">
              <p className="text-sm">
                Send this link to <strong>{email}</strong> and have them open it while signed in to
                that account:
              </p>
              <div className="flex gap-2">
                <Input readOnly value={inviteUrl} className="font-mono text-xs" />
                <Button variant="outline" size="sm" onClick={() => copy(inviteUrl)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                If they authorise a different Google account by mistake, it's refused and nothing is
                saved — just issue a new link.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <Label htmlFor="sender-email">Email address</Label>
                <Input
                  id="sender-email"
                  type="email"
                  placeholder="helen.m.cooper@gmail.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="sender-name">Name on the email (optional)</Label>
                <Input
                  id="sender-name"
                  placeholder="Helen Cooper"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Google mailboxes only for now — personal Gmail and Workspace both work. Microsoft
                365 addresses need the Graph integration.
              </p>
            </div>
          )}

          <DialogFooter>
            {inviteUrl ? (
              <Button onClick={() => setInviteOpen(false)}>Done</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setInviteOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() =>
                    invite.mutate({
                      emailAddress: email.trim(),
                      displayName: displayName.trim() || undefined,
                      provider: "google",
                    })
                  }
                  disabled={!email.trim() || invite.isPending}
                >
                  {invite.isPending ? "Creating…" : "Create link"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Test send */}
      <Dialog open={testFor != null} onOpenChange={open => !open && setTestFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send a test</DialogTitle>
            <DialogDescription>
              Sends a short message as <strong>{testFor?.emailAddress}</strong> to an address you
              choose, so nothing reaches a client by way of a test.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="test-to">Send to</Label>
            <Input
              id="test-to"
              type="email"
              placeholder="you@example.com"
              value={testTo}
              onChange={e => setTestTo(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestFor(null)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                testFor &&
                test.mutate({ emailAddress: testFor.emailAddress, to: testTo.trim() })
              }
              disabled={!testTo.trim() || test.isPending}
            >
              {test.isPending ? "Sending…" : "Send test"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
