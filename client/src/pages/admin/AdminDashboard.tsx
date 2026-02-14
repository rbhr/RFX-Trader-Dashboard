import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, TrendingUp, DollarSign, Activity } from "lucide-react";

export default function AdminDashboard() {
  // Placeholder stats - will be replaced with real data later
  const stats = [
    {
      title: "Total Traders",
      value: "16",
      description: "Active trading accounts",
      icon: Users,
      trend: "+2 this month",
    },
    {
      title: "Total P&L",
      value: "$12,450",
      description: "All-time profit/loss",
      icon: TrendingUp,
      trend: "+15% from last month",
    },
    {
      title: "Profit Share",
      value: "$4,357",
      description: "Total profit share earned",
      icon: DollarSign,
      trend: "35% of positive P&L",
    },
    {
      title: "Active Positions",
      value: "24",
      description: "Currently open trades",
      icon: Activity,
      trend: "Across all accounts",
    },
  ];

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Trader Dashboard</h1>
          <p className="text-muted-foreground mt-2">
            Overview of all trading accounts and performance metrics
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.title}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {stat.title}
                  </CardTitle>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.value}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {stat.description}
                  </p>
                  <p className="text-xs text-primary mt-2">{stat.trend}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="mt-8">
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>
                Latest trades and account updates
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground">
                Activity feed coming soon...
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
