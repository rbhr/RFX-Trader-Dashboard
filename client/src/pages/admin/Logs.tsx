import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollText, RefreshCw } from "lucide-react";
import AdminLayout from "@/components/AdminLayout";
import { PaginationBar, type PageSize } from "@/components/Pagination";

type LogCategory =
  | "onboarding"
  | "trailing"
  | "breach"
  | "telegram"
  | "metacopier"
  | "socket"
  | "payment"
  | "system";

const FILTERS: { key: LogCategory | undefined; label: string }[] = [
  { key: undefined, label: "All" },
  { key: "onboarding", label: "Onboarding" },
  { key: "trailing", label: "Trailing Stop" },
  { key: "breach", label: "Breaches" },
  { key: "telegram", label: "Telegram" },
  { key: "metacopier", label: "MetaCopier" },
  { key: "socket", label: "Socket" },
  { key: "payment", label: "Payments" },
  { key: "system", label: "System" },
];

const CATEGORY_LABEL: Record<LogCategory, string> = {
  onboarding: "Onboarding",
  trailing: "Trailing Stop",
  breach: "Breach",
  telegram: "Telegram",
  metacopier: "MetaCopier",
  socket: "Socket",
  payment: "Payment",
  system: "System",
};

function levelClasses(level: string): string {
  if (level === "error") return "text-destructive";
  if (level === "warn") return "text-amber-500";
  return "text-foreground";
}

export default function Logs() {
  const [category, setCategory] = useState<LogCategory | undefined>(undefined);
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [page, setPage] = useState(0);

  const { data, isLoading } = trpc.admin.getLogs.useQuery(
    { category, page, pageSize },
    { refetchInterval: 5000 }
  );

  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;

  const formatTime = (ts: string | Date) =>
    new Date(ts).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

  return (
    <AdminLayout>
      <div className="p-8 space-y-6">
        <div className="flex items-center gap-3">
          <ScrollText className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">System Logs</h1>
            <p className="text-muted-foreground text-sm">
              Persistent activity across onboarding, risk limits, Telegram,
              MetaCopier and payouts. Newest first.
            </p>
          </div>
          <span className="ml-auto text-xs text-muted-foreground flex items-center gap-1">
            <RefreshCw className="h-3 w-3" />
            Auto-refresh 5s
          </span>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Button
              key={f.label}
              size="sm"
              variant={category === f.key ? "default" : "outline"}
              onClick={() => {
                setCategory(f.key);
                setPage(0);
              }}
            >
              {f.label}
            </Button>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ScrollText className="h-4 w-4" />
              {FILTERS.find((f) => f.key === category)?.label ?? "All"} events
            </CardTitle>
            <CardDescription>
              {total} event{total !== 1 ? "s" : ""} · persistent
              {pageSize === "all" ? " · “All” shows up to 500" : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-muted-foreground text-sm py-4">Loading logs…</p>
            ) : entries.length === 0 ? (
              <div className="text-muted-foreground py-6 text-center">
                No events recorded yet.
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-40">Time</TableHead>
                      <TableHead className="w-32">Category</TableHead>
                      <TableHead>Message</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-muted-foreground text-xs font-mono whitespace-nowrap">
                          {formatTime(log.createdAt)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {CATEGORY_LABEL[log.category as LogCategory] ?? log.category}
                          </Badge>
                        </TableCell>
                        <TableCell className={`text-sm ${levelClasses(log.level)}`}>
                          {log.message}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <PaginationBar
                  total={total}
                  pageSize={pageSize}
                  setPageSize={setPageSize}
                  page={page}
                  setPage={setPage}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
