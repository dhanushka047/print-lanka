import { useEffect, useState } from "react";
import { useNavigate, Outlet, Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { 
  LayoutDashboard, Tag, Palette, Package, Users, Settings, 
  ChevronLeft, Loader2, Building2, ImageIcon, ShoppingBag, ShoppingCart, Truck,
  FolderOpen, MessageSquare, Database, Printer, Layers
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Separator } from "@/components/ui/separator";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/orders", label: "3D Print Orders", icon: Package, showBadge: true },
  { href: "/admin/filaments", label: "Filaments", icon: Layers },
  { href: "/admin/printers", label: "Printers", icon: Printer },
  { href: "/admin/coupons", label: "Coupons", icon: Tag },
  { href: "/admin/colors", label: "Colors", icon: Palette },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/bank-details", label: "Bank Details", icon: Building2 },
  { href: "/admin/gallery", label: "Gallery", icon: ImageIcon },
  { href: "/admin/backup", label: "Backup", icon: Database },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

const shopNavItems = [
  { href: "/admin/shop-products", label: "Products", icon: ShoppingBag },
  { href: "/admin/shop-categories", label: "Categories", icon: FolderOpen },
  { href: "/admin/shop-orders", label: "Shop Orders", icon: ShoppingCart, showShopBadge: true },
  { href: "/admin/shop-settings", label: "Shop Settings", icon: Truck },
  { href: "/admin/sms-campaigns", label: "SMS Campaigns", icon: MessageSquare },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAdminOrModerator, isLoading } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);
  const [shopPendingCount, setShopPendingCount] = useState(0);

  // Fetch pending orders count
  useEffect(() => {
    const fetchPendingCount = async () => {
      const { count } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending_review");
      setPendingCount(count || 0);
    };

    const fetchShopPendingCount = async () => {
      const { count } = await supabase
        .from("shop_orders")
        .select("id", { count: "exact", head: true })
        .eq("status", "payment_submitted");
      setShopPendingCount(count || 0);
    };

    fetchPendingCount();
    fetchShopPendingCount();

    // Subscribe to real-time changes
    const channel = supabase
      .channel("admin-pending-orders")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          fetchPendingCount();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shop_orders" },
        () => {
          fetchShopPendingCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!isLoading && (!user || !isAdminOrModerator)) {
      // Don't hard-redirect; render an access denied screen instead.
      // (Keeps the user from experiencing a blank/white screen.)
    }
  }, [user, isAdminOrModerator, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !isAdminOrModerator) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Admin access required</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              You're signed in, but this account doesn't have admin/moderator permission.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => navigate("/")}>Back to Home</Button>
              <Button onClick={() => navigate("/dashboard?tab=profile")}>View Profile</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-64 bg-card border-r border-border flex flex-col">
        <div className="p-4 border-b border-border">
          <Link to="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
            <ChevronLeft className="w-4 h-4" />
            <span className="text-sm">Back to Site</span>
          </Link>
          <h1 className="font-display font-bold text-xl mt-4">Admin Panel</h1>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-2">
            3D Printing
          </p>
          {navItems.map((item) => {
            const isActive = location.pathname === item.href;
            const showRedDot = item.showBadge && pendingCount > 0;
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors relative",
                  isActive 
                    ? "bg-primary text-primary-foreground" 
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
                {showRedDot && (
                  <span className="absolute right-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-xs font-medium px-1">
                    {pendingCount}
                  </span>
                )}
              </Link>
            );
          })}

          <Separator className="my-4" />

          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-2">
            Shop
          </p>
          {shopNavItems.map((item) => {
            const isActive = location.pathname === item.href;
            const showRedDot = item.showShopBadge && shopPendingCount > 0;
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors relative",
                  isActive 
                    ? "bg-primary text-primary-foreground" 
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
                {showRedDot && (
                  <span className="absolute right-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-xs font-medium px-1">
                    {shopPendingCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}