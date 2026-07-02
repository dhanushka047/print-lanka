import { useEffect, useState } from "react";
import { cacheGet, cacheSet, cacheIsStale, CACHE_DASH_STATS, CACHE_DASH_FIN } from "@/lib/adminCache";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { 
  Package, Users, Tag, Palette, Clock, MessageSquare, AlertTriangle,
  TrendingUp, TrendingDown, DollarSign, Activity, Layers, Printer, Loader2
} from "lucide-react";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from "recharts";
import { formatPrice } from "@/lib/constants";

interface Stats {
  totalOrders: number;
  pendingOrders: number;
  totalUsers: number;
  activeCoupons: number;
  totalColors: number;
}

interface SMSBalance {
  balance: number;
  lowBalance: boolean;
  loading: boolean;
  error: string | null;
}

interface PLChartData {
  month: string;
  revenue: number;
  cost: number;
  profit: number;
}

interface LowFilamentAlert {
  id: string;
  name: string;
  weight_remaining: number;
  low_threshold: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({
    totalOrders: 0,
    pendingOrders: 0,
    totalUsers: 0,
    activeCoupons: 0,
    totalColors: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [smsBalance, setSmsBalance] = useState<SMSBalance>({
    balance: 0,
    lowBalance: false,
    loading: true,
    error: null,
  });

  const [plData, setPlData] = useState<PLChartData[]>([]);
  const [lowFilaments, setLowFilaments] = useState<LowFilamentAlert[]>([]);
  const [financialTotals, setFinancialTotals] = useState({
    revenue: 0,
    cost: 0,
    profit: 0
  });

  const fetchStats = async () => {
    const [ordersRes, pendingRes, usersRes, couponsRes, colorsRes] = await Promise.all([
      supabase.from("orders").select("id", { count: "exact", head: true }),
      supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "pending_review"),
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("coupons").select("id", { count: "exact", head: true }).eq("is_active", true),
      supabase.from("available_colors").select("id", { count: "exact", head: true }).eq("is_active", true),
    ]);

    const newStats: Stats = {
      totalOrders: ordersRes.count || 0,
      pendingOrders: pendingRes.count || 0,
      totalUsers: usersRes.count || 0,
      activeCoupons: couponsRes.count || 0,
      totalColors: colorsRes.count || 0,
    };
    setStats(newStats);
    cacheSet(CACHE_DASH_STATS, newStats, 60_000);
  };

  const fetchSMSBalance = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("sms-balance");
      
      if (error) {
        console.error("SMS balance error:", error);
        setSmsBalance({ balance: 0, lowBalance: false, loading: false, error: "Failed to fetch SMS balance" });
        return;
      }

      if (data?.success) {
        setSmsBalance({ balance: data.balance || 0, lowBalance: data.lowBalance || false, loading: false, error: null });
      } else {
        setSmsBalance({ balance: 0, lowBalance: false, loading: false, error: data?.error || "Unknown error" });
      }
    } catch (err) {
      console.error("SMS balance fetch error:", err);
      setSmsBalance({ balance: 0, lowBalance: false, loading: false, error: "Network error" });
    }
  };

  const fetchFinancialsAndAlerts = async () => {
    // 1. Fetch completed/paid orders
    const { data: ordersData } = await supabase
      .from("orders")
      .select("id, total_price, created_at")
      .in("status", ["completed", "shipped", "ready_to_ship", "in_production", "payment_approved"])
      .not("total_price", "is", null);

    // 2. Fetch filament usages with spools and printers
    const { data: usagesData } = await supabase
      .from("filament_usages")
      .select(`
        weight_used,
        print_hours,
        created_at,
        filaments (cost, weight_total),
        printers (hourly_cost)
      `);

    // 3. Fetch active printers monthly premiums
    const { data: printersData } = await supabase
      .from("printers")
      .select("monthly_premium")
      .eq("status", "active");

    // 4. Calculate low filaments
    const { data: filamentsData } = await supabase
      .from("filaments")
      .select("id, name, weight_remaining, low_threshold")
      .eq("is_over", false);
    
    const alerts = filamentsData?.filter(f => Number(f.weight_remaining) <= Number(f.low_threshold)) || [];
    setLowFilaments(alerts);

    // 5. Aggregate metrics by month
    const monthlyStats: Record<string, { month: string; revenue: number; cost: number; profit: number }> = {};

    const initMonth = (monthKey: string) => {
      if (!monthlyStats[monthKey]) {
        monthlyStats[monthKey] = { month: monthKey, revenue: 0, cost: 0, profit: 0 };
      }
    };

    const currentMonthKey = new Date().toLocaleString("default", { month: "short", year: "numeric" });
    initMonth(currentMonthKey);

    ordersData?.forEach(order => {
      const date = new Date(order.created_at);
      const monthKey = date.toLocaleString("default", { month: "short", year: "numeric" });
      initMonth(monthKey);
      monthlyStats[monthKey].revenue += Number(order.total_price || 0);
    });

    usagesData?.forEach(usage => {
      const date = new Date(usage.created_at);
      const monthKey = date.toLocaleString("default", { month: "short", year: "numeric" });
      initMonth(monthKey);

      const spoolCost = usage.filaments?.cost ? Number(usage.filaments.cost) : 0;
      const spoolWeight = usage.filaments?.weight_total ? Number(usage.filaments.weight_total) : 1000;
      const matCost = spoolWeight > 0 ? usage.weight_used * (spoolCost / spoolWeight) : 0;

      const hourlyCost = usage.printers?.hourly_cost ? Number(usage.printers.hourly_cost) : 0;
      const machineCost = usage.print_hours * hourlyCost;

      monthlyStats[monthKey].cost += Math.round(matCost + machineCost);
    });

    const totalPremiums = printersData?.reduce((sum, p) => sum + Number(p.monthly_premium || 0), 0) || 0;
    Object.keys(monthlyStats).forEach(monthKey => {
      monthlyStats[monthKey].cost += totalPremiums;
      monthlyStats[monthKey].profit = monthlyStats[monthKey].revenue - monthlyStats[monthKey].cost;
    });

    const chartData = Object.values(monthlyStats).sort((a, b) => {
      return new Date(a.month).getTime() - new Date(b.month).getTime();
    });

    setPlData(chartData);

    const revTotal = chartData.reduce((sum, item) => sum + item.revenue, 0);
    const costTotal = chartData.reduce((sum, item) => sum + item.cost, 0);
    const newTotals = { revenue: revTotal, cost: costTotal, profit: revTotal - costTotal };
    setFinancialTotals(newTotals);

    // Cache for instant tab switch
    cacheSet(CACHE_DASH_FIN, { plData: chartData, financialTotals: newTotals, lowFilaments: alerts }, 60_000);
  };

  useEffect(() => {
    // ── 1. Show cached data INSTANTLY on tab switch ──────────────────────────
    const cachedStats = cacheGet<Stats>(CACHE_DASH_STATS);
    const cachedFin   = cacheGet<{
      plData: PLChartData[];
      financialTotals: { revenue: number; cost: number; profit: number };
      lowFilaments: LowFilamentAlert[];
    }>(CACHE_DASH_FIN);

    if (cachedStats) setStats(cachedStats);
    if (cachedFin) {
      setPlData(cachedFin.plData);
      setFinancialTotals(cachedFin.financialTotals);
      setLowFilaments(cachedFin.lowFilaments);
    }
    // Skip loading spinner if both caches are warm
    if (cachedStats && cachedFin) setIsLoading(false);

    // ── 2. Revalidate in background if stale (or first load) ─────────────
    const loadAllData = async () => {
      if (!cachedStats || !cachedFin) setIsLoading(true);
      await Promise.all([fetchStats(), fetchSMSBalance(), fetchFinancialsAndAlerts()]);
      setIsLoading(false);
    };

    if (!cachedStats || !cachedFin || cacheIsStale(CACHE_DASH_STATS) || cacheIsStale(CACHE_DASH_FIN)) {
      loadAllData();
    }

    // ── 3. Realtime: keep counters live ───────────────────────────────────
    const channel = supabase
      .channel('dash-stats')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchStats())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => fetchStats())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const statCards = [
    { title: "Total Orders", value: stats.totalOrders, icon: Package, color: "text-blue-500" },
    { title: "Pending Review", value: stats.pendingOrders, icon: Clock, color: "text-amber-500" },
    { title: "Total Users", value: stats.totalUsers, icon: Users, color: "text-green-500" },
    { title: "Active Coupons", value: stats.activeCoupons, icon: Tag, color: "text-purple-500" },
    { title: "Available Colors", value: stats.totalColors, icon: Palette, color: "text-pink-500" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your 3D printing business and financials</p>
      </div>

      {/* SMS Balance Warning */}
      {smsBalance.lowBalance && !smsBalance.loading && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Low SMS Balance!</AlertTitle>
          <AlertDescription>
            Your SMS balance is below 100 units ({smsBalance.balance} remaining). 
            Please recharge to ensure notifications are not interrupted.
          </AlertDescription>
        </Alert>
      )}

      {/* Low Filament Alerts */}
      {lowFilaments.length > 0 && (
        <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
          <div>
            <AlertTitle className="font-bold">Low Filament Alert!</AlertTitle>
            <AlertDescription className="text-sm">
              The following spools are running low:
              <ul className="list-disc pl-5 mt-1 grid grid-cols-1 md:grid-cols-2 gap-1 font-semibold">
                {lowFilaments.map((f) => (
                  <li key={f.id}>
                    {f.name} ({f.weight_remaining}g remaining)
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </div>
        </Alert>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
        {statCards.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isLoading ? "..." : stat.value}
              </div>
            </CardContent>
          </Card>
        ))}

        {/* SMS Balance Card */}
        <Card className={smsBalance.lowBalance ? "border-destructive" : ""}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              SMS Balance
            </CardTitle>
            <MessageSquare className={`w-5 h-5 ${smsBalance.lowBalance ? "text-destructive" : "text-cyan-500"}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${smsBalance.lowBalance ? "text-destructive" : ""}`}>
              {smsBalance.loading ? "..." : smsBalance.error ? "Error" : smsBalance.balance}
            </div>
            {smsBalance.lowBalance && (
              <p className="text-xs text-destructive mt-1">Low balance!</p>
            )}
            {smsBalance.error && (
              <p className="text-xs text-muted-foreground mt-1">{smsBalance.error}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Financial Overview Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
              <CardDescription>Sum of paid 3D print orders</CardDescription>
            </div>
            <DollarSign className="w-5 h-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">
              {isLoading ? "..." : formatPrice(financialTotals.revenue)}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-destructive/5 border-destructive/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-sm font-medium text-muted-foreground">Printing Expenses</CardTitle>
              <CardDescription>Material & machine costs</CardDescription>
            </div>
            <TrendingDown className="w-5 h-5 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-destructive">
              {isLoading ? "..." : formatPrice(financialTotals.cost)}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-emerald-50/50 dark:bg-emerald-950/10 border-emerald-200 dark:border-emerald-900">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-sm font-medium text-muted-foreground">Estimated Profit</CardTitle>
              <CardDescription>Revenue minus printing expenses</CardDescription>
            </div>
            <TrendingUp className="w-5 h-5 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
              {isLoading ? "..." : formatPrice(financialTotals.profit)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* P&L Graph */}
      <Card>
        <CardHeader>
          <CardTitle>Profit & Loss Analytics</CardTitle>
          <CardDescription>Monthly visualization of business revenue, costs, and profits</CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="h-[350px] w-full">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : plData.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                No financial history found.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={plData}
                  margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis tickFormatter={(val) => `Rs.${val / 1000}k`} />
                  <Tooltip 
                    formatter={(val: number) => [formatPrice(val), ""]}
                    contentStyle={{ borderRadius: "8px" }}
                  />
                  <Legend />
                  <Bar dataKey="revenue" name="Revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="cost" name="Expenses" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="profit" name="Profit" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
