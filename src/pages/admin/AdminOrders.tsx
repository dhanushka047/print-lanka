import { useState, useEffect, Fragment, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Loader2, ChevronDown, ChevronUp, DollarSign, Send, FileImage, 
  Search, Download, Eye, RefreshCw, Bell, MapPin, Phone, Mail,
  Package, Calendar, FileText, Calculator, Percent, Tag, Truck, Edit2,
  Trash2, AlertTriangle
} from "lucide-react";
import { formatPrice, ORDER_STATUSES } from "@/lib/constants";
import { toast } from "sonner";

interface OrderItem {
  id: string;
  file_name: string;
  file_path: string;
  quantity: number;
  color: string;
  material: string;
  quality: string;
  infill_percentage: number;
  price: number | null;
  notes: string | null;
  weight_grams: number | null;
}

interface PaymentSlip {
  id: string;
  file_name: string;
  file_path: string;
  verified: boolean;
  uploaded_at: string;
}

interface Profile {
  first_name: string;
  last_name: string;
  phone: string;
  address: string;
  email: string | null;
}

interface AppliedCoupon {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
}

interface Order {
  id: string;
  status: string;
  total_price: number | null;
  delivery_charge: number | null;
  created_at: string;
  updated_at: string;
  notes: string | null;
  user_id: string;
  priced_at: string | null;
  paid_at: string | null;
  tracking_number: string | null;
  profile: Profile | null;
  order_items: OrderItem[];
  payment_slips: PaymentSlip[];
  applied_coupon?: AppliedCoupon | null;
}

const statusOptions = Object.keys(ORDER_STATUSES);

interface PricingConfig {
  quality_pricing: { draft: number; normal: number; high: number };
  material_surcharge: { pla: number; petg: number; abs: number };
  minimum_order: number;
  custom_color_surcharge: number;
  rush_order_multiplier: number;
}

const defaultPricingConfig: PricingConfig = {
  quality_pricing: { draft: 15, normal: 20, high: 30 },
  material_surcharge: { pla: 0, petg: 5, abs: 8 },
  minimum_order: 500,
  custom_color_surcharge: 200,
  rush_order_multiplier: 1.5,
};

export default function AdminOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [pricingOrder, setPricingOrder] = useState<Order | null>(null);
  const [itemPrices, setItemPrices] = useState<Record<string, number>>({});
  const [itemWeights, setItemWeights] = useState<Record<string, number>>({});
  const [deliveryCharge, setDeliveryCharge] = useState<number>(350);
  const [isSavingPrices, setIsSavingPrices] = useState(false);
  const [viewingSlip, setViewingSlip] = useState<string | null>(null);
  const [viewingSlipOrderId, setViewingSlipOrderId] = useState<string | null>(null);
  const [detailsOrder, setDetailsOrder] = useState<Order | null>(null);
  const [isDownloading, setIsDownloading] = useState<string | null>(null);
  const [pricingConfig, setPricingConfig] = useState<PricingConfig>(defaultPricingConfig);
  
  // Tracking number dialog state
  const [trackingDialog, setTrackingDialog] = useState<{ orderId: string; order: Order } | null>(null);
  const [trackingNumber, setTrackingNumber] = useState<string>("");
  const [isSavingTracking, setIsSavingTracking] = useState(false);
  
  // Delete order dialog state
  const [deleteDialog, setDeleteDialog] = useState<Order | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  useEffect(() => {
    fetchOrders();
    fetchPricingConfig();

    // Set up real-time subscription
    const channel = supabase
      .channel('admin-orders')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
        },
        (payload) => {
          console.log('Order change detected:', payload);
          // Show notification for new orders
          if (payload.eventType === 'INSERT') {
            toast.info("New order received!", {
              icon: <Bell className="w-4 h-4" />,
              action: {
                label: "View",
                onClick: () => fetchOrders(),
              },
            });
          }
          fetchOrders();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payment_slips',
        },
        (payload) => {
          console.log('Payment slip change detected:', payload);
          if (payload.eventType === 'INSERT') {
            toast.info("New payment slip uploaded!", {
              icon: <FileImage className="w-4 h-4" />,
            });
          }
          fetchOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchPricingConfig = async () => {
    const { data, error } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "pricing_config")
      .maybeSingle();

    if (!error && data?.value) {
      setPricingConfig(data.value as unknown as PricingConfig);
    }
  };

  // Calculate suggested price for an order item based on config and weight
  const calculateSuggestedPrice = (item: OrderItem, weightGrams?: number): number => {
    const qualityKey = item.quality as keyof typeof pricingConfig.quality_pricing;
    const materialKey = item.material as keyof typeof pricingConfig.material_surcharge;
    
    const basePrice = pricingConfig.quality_pricing[qualityKey] || 20;
    const materialSurcharge = pricingConfig.material_surcharge[materialKey] || 0;
    
    // If weight is provided, calculate based on weight
    const weight = weightGrams || item.weight_grams || 0;
    if (weight > 0) {
      const pricePerGram = basePrice + materialSurcharge;
      return Math.round(pricePerGram * weight * item.quantity);
    }
    
    // Fallback: calculate based on infill and quantity (old method)
    const infillMultiplier = 1 + (item.infill_percentage / 100);
    const pricePerUnit = (basePrice + materialSurcharge) * infillMultiplier;
    
    return Math.round(pricePerUnit * item.quantity * 100); // Assuming avg model ~100g
  };

  // Calculate price from weight for a single item
  const calculatePriceFromWeight = (itemId: string, weightGrams: number) => {
    if (!pricingOrder) return;
    
    const item = pricingOrder.order_items.find(i => i.id === itemId);
    if (!item) return;
    
    const price = calculateSuggestedPrice(item, weightGrams);
    setItemPrices(prev => ({ ...prev, [itemId]: price }));
    setItemWeights(prev => ({ ...prev, [itemId]: weightGrams }));
  };

  // Auto-calculate all prices for an order
  const autoCalculatePrices = () => {
    if (!pricingOrder) return;
    
    const calculatedPrices: Record<string, number> = {};
    pricingOrder.order_items.forEach(item => {
      calculatedPrices[item.id] = calculateSuggestedPrice(item);
    });
    
    setItemPrices(calculatedPrices);
    toast.success("Prices calculated based on configuration");
  };

  const fetchOrders = async () => {
    try {
      // Self-hosted installs may be missing newer columns (e.g. weight_grams).
      // We attempt the newest select first, then retry with a fallback select.
      const selectWithWeight = `
          *,
          order_items (
            id,
            file_name,
            file_path,
            quantity,
            color,
            material,
            quality,
            infill_percentage,
            price,
            notes,
            weight_grams
          ),
          payment_slips (
            id,
            file_name,
            file_path,
            verified,
            uploaded_at
          )
        `;

      const selectFallback = `
          *,
          order_items (
            id,
            file_name,
            file_path,
            quantity,
            color,
            material,
            quality,
            infill_percentage,
            price,
            notes
          ),
          payment_slips (
            id,
            file_name,
            file_path,
            verified,
            uploaded_at
          )
        `;

      const runOrdersQuery = (select: string) =>
        supabase
          .from("orders")
          .select(select)
          .order("created_at", { ascending: false });

      let { data: ordersData, error: ordersError } = await runOrdersQuery(selectWithWeight);

      if (ordersError?.code === "42703") {
        // column does not exist
        const retry = await runOrdersQuery(selectFallback);
        ordersData = retry.data;
        ordersError = retry.error;
      }

      if (ordersError) {
        console.error("Error fetching orders:", ordersError);
        toast.error("Failed to load orders");
        setIsLoading(false);
        return;
      }

      const safeOrders = ((ordersData as any[]) ?? []) as any[];
      const userIds = [...new Set(safeOrders.map((o) => o.user_id).filter(Boolean))];
      const orderIds = safeOrders.map((o) => o.id).filter(Boolean);
      
      // Fetch profiles
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, phone, address, email")
        .in("user_id", userIds);

      if (profilesError) {
        console.error("Error fetching profiles:", profilesError);
      }

      // Fetch applied coupons for all orders
      const { data: appliedCouponsData } = await supabase
        .from("user_coupons")
        .select(`
          used_on_order_id,
          coupons (
            id,
            code,
            discount_type,
            discount_value
          )
        `)
        .in("used_on_order_id", orderIds)
        .not("used_on_order_id", "is", null);

      const couponMap = new Map<string, AppliedCoupon>();
      appliedCouponsData?.forEach((uc: any) => {
        if (uc.used_on_order_id && uc.coupons) {
          couponMap.set(uc.used_on_order_id, {
            id: uc.coupons.id,
            code: uc.coupons.code,
            discount_type: uc.coupons.discount_type,
            discount_value: uc.coupons.discount_value,
          });
        }
      });

      const profileMap = new Map<string, Profile>();
      profilesData?.forEach(p => {
        profileMap.set(p.user_id, {
          first_name: p.first_name,
          last_name: p.last_name,
          phone: p.phone,
          address: p.address,
          email: p.email,
        });
      });

      const mappedOrders: Order[] = safeOrders.map((order: any) => ({
        ...order,
        profile: profileMap.get(order.user_id) || null,
        payment_slips: order.payment_slips || [],
        order_items: order.order_items || [],
        applied_coupon: couponMap.get(order.id) || null,
      }));

      setOrders(mappedOrders);
    } catch (error) {
      console.error("Error in fetchOrders:", error);
      toast.error("Failed to load orders");
    } finally {
      setIsLoading(false);
    }
  };

  // Filter and search orders
  const filteredOrders = useMemo(() => {
    let result = orders;

    // Filter by status
    if (filterStatus !== "all") {
      result = result.filter(o => o.status === filterStatus);
    }

    // Search by order ID, customer name, phone, or email
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(order => {
        const orderId = order.id.toLowerCase();
        const customerName = `${order.profile?.first_name || ''} ${order.profile?.last_name || ''}`.toLowerCase();
        const phone = order.profile?.phone?.toLowerCase() || '';
        const email = order.profile?.email?.toLowerCase() || '';
        
        return orderId.includes(query) || 
               customerName.includes(query) || 
               phone.includes(query) ||
               email.includes(query);
      });
    }

    return result;
  }, [orders, filterStatus, searchQuery]);

  const handleStatusChange = async (orderId: string, newStatus: string, order: Order) => {
    // If changing to "shipped", open tracking dialog first
    if (newStatus === "shipped") {
      setTrackingNumber(order.tracking_number || "");
      setTrackingDialog({ orderId, order });
      return;
    }

    await updateOrderStatus(orderId, newStatus, order);
  };

  const updateOrderStatus = async (orderId: string, newStatus: string, order: Order, trackingNum?: string) => {
    const updateData: any = { status: newStatus };
    if (trackingNum !== undefined) {
      updateData.tracking_number = trackingNum;
    }

    const { error } = await supabase
      .from("orders")
      .update(updateData)
      .eq("id", orderId);

    if (!error) {
      const notifyStatuses = [
        "priced_awaiting_payment",
        "payment_approved",
        "payment_rejected",
        "ready_to_ship",
        "shipped"
      ];

      if (notifyStatuses.includes(newStatus) && order.profile?.phone) {
        const messages: Record<string, string> = {
          priced_awaiting_payment: `Your order #${orderId.slice(0, 8)} has been priced at ${order.total_price ? formatPrice(order.total_price) : 'pending'}. Please upload your payment slip to proceed.`,
          payment_approved: `Payment approved for order #${orderId.slice(0, 8)}. Your order is now in production!`,
          payment_rejected: `Payment verification failed for order #${orderId.slice(0, 8)}. Please contact us or upload a new payment slip.`,
          ready_to_ship: `Great news! Your order #${orderId.slice(0, 8)} is ready to ship. Expect delivery soon!`,
          shipped: trackingNum 
            ? `Your order #${orderId.slice(0, 8)} has been shipped! Tracking: ${trackingNum}`
            : `Your order #${orderId.slice(0, 8)} has been shipped! Track your delivery for updates.`,
        };

        try {
          await supabase.functions.invoke("send-sms", {
            body: {
              phone: order.profile.phone,
              message: messages[newStatus],
              order_id: orderId,
              user_id: order.user_id,
            },
          });
        } catch (smsError) {
          console.error("SMS notification failed:", smsError);
        }
      }

      toast.success("Order status updated");
      fetchOrders();
    } else {
      toast.error("Failed to update status");
    }
  };

  const handleSaveTracking = async () => {
    if (!trackingDialog) return;
    
    setIsSavingTracking(true);
    await updateOrderStatus(
      trackingDialog.orderId, 
      "shipped", 
      trackingDialog.order, 
      trackingNumber.trim()
    );
    setIsSavingTracking(false);
    setTrackingDialog(null);
    setTrackingNumber("");
  };

  const handleUpdateTrackingNumber = async (orderId: string, newTracking: string) => {
    const { error } = await supabase
      .from("orders")
      .update({ tracking_number: newTracking })
      .eq("id", orderId);

    if (!error) {
      toast.success("Tracking number updated");
      fetchOrders();
    } else {
      toast.error("Failed to update tracking number");
    }
  };

  const handleDeleteOrder = async () => {
    if (!deleteDialog) return;

    setIsDeleting(true);
    try {
      // Delete order items first
      await supabase
        .from("order_items")
        .delete()
        .eq("order_id", deleteDialog.id);

      // Delete payment slips
      await supabase
        .from("payment_slips")
        .delete()
        .eq("order_id", deleteDialog.id);

      // Delete the order
      const { error } = await supabase
        .from("orders")
        .delete()
        .eq("id", deleteDialog.id);

      if (error) throw error;

      toast.success("Order deleted successfully");
      setDeleteDialog(null);
      fetchOrders();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete order");
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredOrders.length && filteredOrders.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredOrders.map(o => o.id)));
    }
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setIsBulkDeleting(true);
    try {
      await supabase.from("order_items").delete().in("order_id", ids);
      await supabase.from("payment_slips").delete().in("order_id", ids);
      const { error } = await supabase.from("orders").delete().in("id", ids);
      if (error) throw error;
      toast.success(`Deleted ${ids.length} order${ids.length > 1 ? "s" : ""}`);
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
      fetchOrders();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete orders");
    } finally {
      setIsBulkDeleting(false);
    }

  const openPricingDialog = (order: Order) => {
    setPricingOrder(order);
    const prices: Record<string, number> = {};
    const weights: Record<string, number> = {};
    order.order_items.forEach(item => {
      prices[item.id] = item.price || 0;
      weights[item.id] = item.weight_grams || 0;
    });
    setItemPrices(prices);
    setItemWeights(weights);
    setDeliveryCharge(order.delivery_charge || 350);
  };

  const calculateTotal = () => {
    const itemsTotal = Object.values(itemPrices).reduce((sum, price) => sum + (price || 0), 0);
    return itemsTotal + deliveryCharge;
  };

  // Calculate discount from applied coupon (or fallback to notes)
  const getAppliedCouponInfo = (order: Order | null): AppliedCoupon | null => {
    if (!order) return null;
    if (order.applied_coupon) return order.applied_coupon;
    
    // Fallback: parse from notes if coupon info exists there
    if (order.notes?.includes("Coupon:")) {
      const codeMatch = order.notes.match(/Coupon:\s*(\w+)/);
      if (codeMatch) {
        // Default to 10% if we can't determine - will be overridden by actual data
        return {
          id: "fallback",
          code: codeMatch[1],
          discount_type: "percentage",
          discount_value: 10,
        };
      }
    }
    return null;
  };

  const calculateDiscount = (subtotal: number, coupon: AppliedCoupon | null | undefined): number => {
    if (!coupon) return 0;
    if (coupon.discount_type === "percentage") {
      return Math.round((subtotal * coupon.discount_value) / 100);
    }
    return coupon.discount_value; // Fixed amount
  };

  // Get the final price after discount
  const calculateFinalTotal = () => {
    const subtotal = calculateTotal();
    const couponInfo = getAppliedCouponInfo(pricingOrder);
    const discount = calculateDiscount(subtotal, couponInfo);
    return Math.max(0, subtotal - discount);
  };

  const handleSavePrices = async () => {
    if (!pricingOrder) return;

    setIsSavingPrices(true);
    try {
      // Save both price and weight for each item
      for (const [itemId, price] of Object.entries(itemPrices)) {
        const weight = itemWeights[itemId] || null;
        const { error } = await supabase
          .from("order_items")
          .update({ price, weight_grams: weight })
          .eq("id", itemId);

        if (error) throw error;
      }

      const subtotal = calculateTotal();
      const couponInfo = getAppliedCouponInfo(pricingOrder);
      const discount = calculateDiscount(subtotal, couponInfo);
      const finalTotal = Math.max(0, subtotal - discount);
      const isFirstPricing = pricingOrder.status === "pending_review";
      
      // Save the final price (after discount) - this is what customer actually pays
      const updateData: any = {
        total_price: finalTotal,
        delivery_charge: deliveryCharge,
      };

      if (isFirstPricing) {
        updateData.status = "priced_awaiting_payment";
        updateData.priced_at = new Date().toISOString();
      }

      const { error: orderError } = await supabase
        .from("orders")
        .update(updateData)
        .eq("id", pricingOrder.id);

      if (orderError) throw orderError;

      // Only send SMS notification for first pricing
      if (isFirstPricing && pricingOrder.profile?.phone) {
        try {
          // Build message with discount info if applicable
          let message = `Your order #${pricingOrder.id.slice(0, 8)} has been priced at ${formatPrice(finalTotal)}.`;
          if (discount > 0 && couponInfo) {
            message = `Your order #${pricingOrder.id.slice(0, 8)} has been priced at ${formatPrice(finalTotal)} (Coupon ${couponInfo.code}: -${formatPrice(discount)} applied).`;
          }
          message += " Please upload your bank transfer slip to proceed.";

          await supabase.functions.invoke("send-sms", {
            body: {
              phone: pricingOrder.profile.phone,
              message,
              order_id: pricingOrder.id,
              user_id: pricingOrder.user_id,
            },
          });
        } catch (smsError) {
          console.error("SMS notification failed:", smsError);
        }
      }

      setPricingOrder(null);
      fetchOrders();
      toast.success(isFirstPricing ? "Prices saved and customer notified" : "Prices updated");
    } catch (error: any) {
      toast.error(error.message || "Failed to save prices");
    } finally {
      setIsSavingPrices(false);
    }
  };

  const handleViewPaymentSlip = async (filePath: string, orderId: string) => {
    const { data } = await supabase.storage
      .from("payment-slips")
      .createSignedUrl(filePath, 300);

    if (data?.signedUrl) {
      setViewingSlip(data.signedUrl);
      setViewingSlipOrderId(orderId);
    } else {
      toast.error("Failed to load payment slip");
    }
  };

  const handleVerifyPayment = async (orderId: string, slipId: string, approved: boolean) => {
    try {
      await supabase
        .from("payment_slips")
        .update({
          verified: approved,
          verified_at: new Date().toISOString(),
        })
        .eq("id", slipId);

      await supabase
        .from("orders")
        .update({
          status: approved ? "payment_approved" : "payment_rejected",
          paid_at: approved ? new Date().toISOString() : null,
          payment_rejection_reason: approved ? null : "Payment verification failed",
        })
        .eq("id", orderId);

      const order = orders.find(o => o.id === orderId);
      if (order?.profile?.phone) {
        const message = approved
          ? `Payment approved for order #${orderId.slice(0, 8)}! Your order is now in production.`
          : `Payment verification failed for order #${orderId.slice(0, 8)}. Please contact us or upload a new payment slip.`;

        try {
          await supabase.functions.invoke("send-sms", {
            body: {
              phone: order.profile.phone,
              message,
              order_id: orderId,
              user_id: order.user_id,
            },
          });
        } catch (smsError) {
          console.error("SMS notification failed:", smsError);
        }
      }

      setViewingSlip(null);
      setViewingSlipOrderId(null);
      toast.success(approved ? "Payment approved" : "Payment rejected");
    } catch (error: any) {
      toast.error(error.message || "Failed to verify payment");
    }
  };

  const handleDownloadFile = async (filePath: string, fileName: string) => {
    setIsDownloading(filePath);
    try {
      const { data, error } = await supabase.storage
        .from("models")
        .download(filePath);

      if (error) throw error;

      // Create download link
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`Downloaded ${fileName}`);
    } catch (error: any) {
      console.error("Download error:", error);
      toast.error("Failed to download file");
    } finally {
      setIsDownloading(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusInfo = ORDER_STATUSES[status as keyof typeof ORDER_STATUSES];
    const isError = status.includes("rejected");
    const isSuccess = status === "completed" || status === "shipped";

    return (
      <Badge 
        variant="outline" 
        className={
          isError ? "border-destructive text-destructive" :
          isSuccess ? "border-green-500 text-green-600" :
          "border-primary text-primary"
        }
      >
        {statusInfo?.label || status}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Orders</h1>
          <p className="text-muted-foreground">Manage customer orders and pricing</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchOrders} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Refresh
        </Button>
      </div>

      {/* Search and Filter Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by order ID, customer name, phone, or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Orders ({orders.length})</SelectItem>
                {statusOptions.map((status) => {
                  const count = orders.filter(o => o.status === status).length;
                  return (
                    <SelectItem key={status} value={status}>
                      {ORDER_STATUSES[status as keyof typeof ORDER_STATUSES]?.label} ({count})
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {filterStatus === "all" ? "All Orders" : ORDER_STATUSES[filterStatus as keyof typeof ORDER_STATUSES]?.label}
            <span className="text-muted-foreground font-normal ml-2">({filteredOrders.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : filteredOrders.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">
              {searchQuery ? "No orders match your search" : "No orders found"}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tracking</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.map((order) => (
                  <Fragment key={order.id}>
                    <TableRow className="hover:bg-muted/50">
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                        >
                          {expandedOrder === order.id ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        <button 
                          onClick={() => setDetailsOrder(order)}
                          className="hover:text-primary hover:underline"
                        >
                          #{order.id.slice(0, 8)}
                        </button>
                      </TableCell>
                      <TableCell>
                        {order.profile ? (
                          <div>
                            <p className="font-medium">
                              {order.profile.first_name} {order.profile.last_name}
                            </p>
                            <p className="text-xs text-muted-foreground">{order.profile.phone}</p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Unknown</span>
                        )}
                      </TableCell>
                      <TableCell>{order.order_items.length} items</TableCell>
                      <TableCell>
                        {order.total_price != null ? (
                          <div className="space-y-1">
                            {/* Calculate breakdown */}
                            {(() => {
                              const itemsTotal = order.order_items.reduce((sum, item) => sum + (item.price || 0), 0);
                              const delivery = order.delivery_charge || 0;
                              const subtotal = itemsTotal + delivery;
                              const discount = order.applied_coupon
                                ? order.applied_coupon.discount_type === "percentage"
                                  ? Math.round((subtotal * order.applied_coupon.discount_value) / 100)
                                  : order.applied_coupon.discount_value
                                : 0;
                              const collectAmount = Math.max(0, subtotal - discount);
                              
                              return (
                                <>
                                  {order.applied_coupon && discount > 0 && (
                                    <>
                                      <div className="text-xs text-muted-foreground">
                                        Subtotal: {formatPrice(subtotal)}
                                      </div>
                                      <div className="text-xs text-green-600 flex items-center gap-1">
                                        <Tag className="w-3 h-3" />
                                        -{formatPrice(discount)}
                                      </div>
                                    </>
                                  )}
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-primary">
                                      {formatPrice(collectAmount)}
                                    </span>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 px-2"
                                      onClick={() => openPricingDialog(order)}
                                    >
                                      <DollarSign className="w-3 h-3" />
                                    </Button>
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1"
                            onClick={() => openPricingDialog(order)}
                          >
                            <DollarSign className="w-3 h-3" />
                            Set Price
                          </Button>
                        )}
                      </TableCell>
                      <TableCell>
                        {order.payment_slips.length > 0 ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1"
                            onClick={() => handleViewPaymentSlip(order.payment_slips[0].file_path, order.id)}
                          >
                            <FileImage className="w-3 h-3" />
                            View Slip
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">No slip</span>
                        )}
                      </TableCell>
                      <TableCell>{getStatusBadge(order.status)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(order.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        {order.tracking_number ? (
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className="gap-1 text-xs">
                              <Truck className="w-3 h-3" />
                              {order.tracking_number}
                            </Badge>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0"
                              onClick={() => {
                                setTrackingNumber(order.tracking_number || "");
                                setTrackingDialog({ orderId: order.id, order });
                              }}
                            >
                              <Edit2 className="w-3 h-3" />
                            </Button>
                          </div>
                        ) : (order.status === "shipped" || order.status === "completed") ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="gap-1 text-xs"
                            onClick={() => {
                              setTrackingNumber("");
                              setTrackingDialog({ orderId: order.id, order });
                            }}
                          >
                            <Truck className="w-3 h-3" />
                            Add
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDetailsOrder(order)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleteDialog(order)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                          <Select
                            value={order.status}
                            onValueChange={(v) => handleStatusChange(order.id, v, order)}
                          >
                            <SelectTrigger className="w-32 h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {statusOptions.map((status) => (
                                <SelectItem key={status} value={status} className="text-xs">
                                  {ORDER_STATUSES[status as keyof typeof ORDER_STATUSES]?.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedOrder === order.id && (
                      <TableRow className="bg-muted/50">
                        <TableCell colSpan={10}>
                          <div className="p-4 space-y-4">
                            <div className="flex justify-between items-start">
                              <div>
                                <h4 className="font-semibold mb-2">Order Items</h4>
                                {order.notes && (
                                  <p className="text-sm text-muted-foreground mb-2">
                                    Notes: {order.notes}
                                  </p>
                                )}
                              </div>
                              {order.profile && (
                                <div className="text-right text-sm">
                                  <p className="font-medium">Delivery Address:</p>
                                  <p className="text-muted-foreground">{order.profile.address}</p>
                                </div>
                              )}
                            </div>
                            <div className="grid gap-2">
                              {order.order_items.map((item) => (
                                <div
                                  key={item.id}
                                  className="flex items-center gap-4 p-3 bg-card rounded-lg border"
                                >
                                  <div
                                    className="w-6 h-6 rounded-full border flex-shrink-0"
                                    style={{ backgroundColor: item.color }}
                                  />
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium truncate">{item.file_name}</p>
                                    <p className="text-sm text-muted-foreground">
                                      {item.material.toUpperCase()} • {item.quality} quality • {item.infill_percentage}% infill
                                    </p>
                                  </div>
                                  <span className="font-medium">×{item.quantity}</span>
                                  {item.price && (
                                    <span className="font-medium text-primary">
                                      {formatPrice(item.price)}
                                    </span>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleDownloadFile(item.file_path, item.file_name)}
                                    disabled={isDownloading === item.file_path}
                                  >
                                    {isDownloading === item.file_path ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <Download className="w-4 h-4" />
                                    )}
                                  </Button>
                                </div>
                              ))}
                            </div>
                            {order.total_price != null && (
                              <div className="flex flex-col items-end gap-1 text-sm">
                                <span className="text-muted-foreground">
                                  Delivery: {formatPrice(order.delivery_charge || 0)}
                                </span>
                                {order.applied_coupon && (
                                  <span className="text-green-600 flex items-center gap-1">
                                    <Tag className="w-3 h-3" />
                                    Coupon: {order.applied_coupon.code} (
                                    {order.applied_coupon.discount_type === "percentage"
                                      ? `${order.applied_coupon.discount_value}%`
                                      : formatPrice(order.applied_coupon.discount_value)
                                    } off)
                                  </span>
                                )}
                                <span className="font-bold">
                                  Total: {formatPrice(order.total_price)}
                                </span>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pricing Dialog */}
      <Dialog open={!!pricingOrder} onOpenChange={() => setPricingOrder(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Set Order Prices</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Order #{pricingOrder?.id.slice(0, 8)} • {pricingOrder?.profile?.first_name} {pricingOrder?.profile?.last_name}
            </DialogDescription>
          </DialogHeader>
          
          {pricingOrder && (
            <>
              <ScrollArea className="flex-1 pr-4 -mr-4">
                <div className="space-y-4 pb-4">
                  <div className="flex items-center justify-end">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={autoCalculatePrices}
                      className="gap-2"
                    >
                      <Calculator className="w-4 h-4" />
                      Auto-Calculate All
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {pricingOrder.order_items.map((item) => {
                      const currentWeight = itemWeights[item.id] || 0;
                      const suggestedPrice = calculateSuggestedPrice(item, currentWeight > 0 ? currentWeight : undefined);
                      const qualityKey = item.quality as keyof typeof pricingConfig.quality_pricing;
                      const materialKey = item.material as keyof typeof pricingConfig.material_surcharge;
                      const ratePerGram = pricingConfig.quality_pricing[qualityKey] + pricingConfig.material_surcharge[materialKey];
                      
                      return (
                        <div key={item.id} className="p-3 border rounded-lg space-y-3">
                          <div className="flex items-start gap-3">
                            <div
                              className="w-6 h-6 rounded-full border flex-shrink-0 mt-1"
                              style={{ backgroundColor: item.color }}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{item.file_name}</p>
                              <p className="text-xs text-muted-foreground">
                                {item.material.toUpperCase()} • {item.quality} • {item.infill_percentage}% • ×{item.quantity}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                Rate: {formatPrice(ratePerGram)}/gram
                              </p>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label className="text-xs text-muted-foreground">Weight (grams)</Label>
                              <div className="flex gap-2 mt-1">
                                <Input
                                  type="number"
                                  placeholder="Enter weight"
                                  value={itemWeights[item.id] || ""}
                                  onChange={(e) => {
                                    const weight = Number(e.target.value);
                                    setItemWeights(prev => ({ ...prev, [item.id]: weight }));
                                  }}
                                  className="flex-1"
                                />
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => {
                                    const weight = itemWeights[item.id] || 0;
                                    if (weight > 0) {
                                      calculatePriceFromWeight(item.id, weight);
                                      toast.success(`Calculated: ${formatPrice(calculateSuggestedPrice(item, weight))}`);
                                    } else {
                                      toast.error("Enter weight first");
                                    }
                                  }}
                                  className="gap-1"
                                >
                                  <Calculator className="w-3 h-3" />
                                  Calc
                                </Button>
                              </div>
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">Price (LKR)</Label>
                              <Input
                                type="number"
                                placeholder="Enter price"
                                value={itemPrices[item.id] || ""}
                                onChange={(e) => 
                                  setItemPrices({ ...itemPrices, [item.id]: Number(e.target.value) })
                                }
                                className="mt-1"
                              />
                              {currentWeight > 0 && (
                                <p className="text-xs text-primary mt-1">
                                  Suggested: {formatPrice(suggestedPrice)}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-4 p-3 border rounded-lg bg-muted/50">
                    <Truck className="w-4 h-4 text-muted-foreground" />
                    <div className="flex-1">
                      <Label>Delivery Charge</Label>
                    </div>
                    <div className="w-32">
                      <Input
                        type="number"
                        value={deliveryCharge}
                        onChange={(e) => setDeliveryCharge(Number(e.target.value))}
                      />
                    </div>
                  </div>

                  {/* Price Summary */}
                  {(() => {
                    const couponInfo = getAppliedCouponInfo(pricingOrder);
                    const itemsTotal = Object.values(itemPrices).reduce((sum, p) => sum + (p || 0), 0);
                    const subtotal = itemsTotal + deliveryCharge;
                    const discountAmount = calculateDiscount(subtotal, couponInfo);
                    const customerPays = Math.max(0, subtotal - discountAmount);
                    
                    return (
                      <div className="space-y-3 p-4 bg-slate-100 dark:bg-slate-800 rounded-lg border-2 border-slate-200 dark:border-slate-700">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-muted-foreground">Items Total</span>
                          <span className="font-medium">{formatPrice(itemsTotal)}</span>
                        </div>

                        <div className="flex justify-between items-center text-sm">
                          <span className="text-muted-foreground">Delivery Charge</span>
                          <span className="font-medium">{formatPrice(deliveryCharge)}</span>
                        </div>

                        <div className="flex justify-between items-center text-sm pt-2 border-t border-slate-300 dark:border-slate-600">
                          <span className="font-medium">Subtotal</span>
                          <span className="font-semibold">{formatPrice(subtotal)}</span>
                        </div>

                        {couponInfo && (
                          <div className="flex justify-between items-center p-3 bg-green-100 dark:bg-green-900/50 rounded-lg border border-green-300 dark:border-green-700">
                            <span className="flex items-center gap-2 text-green-700 dark:text-green-300 font-medium">
                              <Tag className="w-4 h-4" />
                              <span>Coupon: {couponInfo.code}</span>
                              <Badge className="bg-green-600 text-white text-xs">
                                {couponInfo.discount_type === "percentage" 
                                  ? `${couponInfo.discount_value}% OFF` 
                                  : formatPrice(couponInfo.discount_value) + " OFF"}
                              </Badge>
                            </span>
                            <span className="font-bold text-lg text-green-700 dark:text-green-300">
                              -{formatPrice(discountAmount)}
                            </span>
                          </div>
                        )}

                        <div className="flex justify-between items-center p-4 bg-primary/20 rounded-lg border-2 border-primary/30 mt-2">
                          <span className="font-bold text-lg">
                            {couponInfo ? "🎉 Customer Pays" : "Total"}
                          </span>
                          <span className="text-3xl font-bold text-primary">
                            {formatPrice(customerPays)}
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </ScrollArea>

              <DialogFooter className="flex-shrink-0 border-t pt-4 mt-4 bg-background">
                <Button variant="outline" onClick={() => setPricingOrder(null)}>
                  Cancel
                </Button>
                <Button onClick={handleSavePrices} disabled={isSavingPrices}>
                  {isSavingPrices ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 mr-2" />
                  )}
                  Save & Notify Customer
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Payment Slip Viewer */}
      <Dialog open={!!viewingSlip} onOpenChange={() => { setViewingSlip(null); setViewingSlipOrderId(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Payment Slip</DialogTitle>
          </DialogHeader>
          
          {viewingSlip && (
            <div className="space-y-4">
              <div className="max-h-[60vh] overflow-auto rounded-lg border">
                {viewingSlip.includes('.pdf') ? (
                  <iframe src={viewingSlip} className="w-full h-[60vh]" />
                ) : (
                  <img src={viewingSlip} alt="Payment slip" className="w-full" />
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button 
              variant="destructive" 
              onClick={() => {
                const order = orders.find(o => o.id === viewingSlipOrderId);
                if (order && order.payment_slips.length > 0) {
                  handleVerifyPayment(order.id, order.payment_slips[0].id, false);
                }
              }}
            >
              Reject Payment
            </Button>
            <Button 
              onClick={() => {
                const order = orders.find(o => o.id === viewingSlipOrderId);
                if (order && order.payment_slips.length > 0) {
                  handleVerifyPayment(order.id, order.payment_slips[0].id, true);
                }
              }}
            >
              Approve Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order Details Dialog */}
      <Dialog open={!!detailsOrder} onOpenChange={() => setDetailsOrder(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Order Details
            </DialogTitle>
          </DialogHeader>
          
          {detailsOrder && (
            <ScrollArea className="max-h-[70vh]">
              <div className="space-y-6 pr-4">
                {/* Order Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-mono text-lg font-semibold">#{detailsOrder.id.slice(0, 8)}</p>
                    <p className="text-sm text-muted-foreground">
                      Full ID: {detailsOrder.id}
                    </p>
                  </div>
                  {getStatusBadge(detailsOrder.status)}
                </div>

                <Separator />

                {/* Customer Info */}
                <div>
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    Customer Information
                  </h4>
                  {detailsOrder.profile ? (
                    <div className="grid gap-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground w-20">Name:</span>
                        <span className="font-medium">{detailsOrder.profile.first_name} {detailsOrder.profile.last_name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-muted-foreground" />
                        <span>{detailsOrder.profile.phone}</span>
                      </div>
                      {detailsOrder.profile.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="w-4 h-4 text-muted-foreground" />
                          <span>{detailsOrder.profile.email}</span>
                        </div>
                      )}
                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
                        <span>{detailsOrder.profile.address}</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No customer information</p>
                  )}
                </div>

                <Separator />

                {/* Timeline */}
                <div>
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Order Timeline
                  </h4>
                  <div className="grid gap-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Created:</span>
                      <span>{new Date(detailsOrder.created_at).toLocaleString()}</span>
                    </div>
                    {detailsOrder.priced_at && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Priced:</span>
                        <span>{new Date(detailsOrder.priced_at).toLocaleString()}</span>
                      </div>
                    )}
                    {detailsOrder.paid_at && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Payment Verified:</span>
                        <span>{new Date(detailsOrder.paid_at).toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Last Updated:</span>
                      <span>{new Date(detailsOrder.updated_at).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Order Items */}
                <div>
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Order Items ({detailsOrder.order_items.length})
                  </h4>
                  <div className="space-y-3">
                    {detailsOrder.order_items.map((item) => (
                      <div key={item.id} className="p-3 border rounded-lg">
                        <div className="flex items-start gap-3">
                          <div
                            className="w-8 h-8 rounded-full border flex-shrink-0"
                            style={{ backgroundColor: item.color }}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium">{item.file_name}</p>
                            <div className="text-sm text-muted-foreground space-y-1 mt-1">
                              <p>Material: {item.material.toUpperCase()}</p>
                              <p>Quality: {item.quality}</p>
                              <p>Infill: {item.infill_percentage}%</p>
                              <p>Quantity: {item.quantity}</p>
                              {item.notes && <p>Notes: {item.notes}</p>}
                              {item.price && (
                                <p className="text-primary font-medium">Price: {formatPrice(item.price)}</p>
                              )}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-2"
                            onClick={() => handleDownloadFile(item.file_path, item.file_name)}
                            disabled={isDownloading === item.file_path}
                          >
                            {isDownloading === item.file_path ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Download className="w-4 h-4" />
                            )}
                            Download
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* Pricing Summary */}
                {detailsOrder.total_price != null && (
                  <div>
                    <h4 className="font-semibold mb-3">Pricing Summary</h4>
                    <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                      {/* Calculate items total (stored total_price is already after discount) */}
                      {(() => {
                        const itemsTotal = detailsOrder.order_items.reduce((sum, item) => sum + (item.price || 0), 0);
                        const delivery = detailsOrder.delivery_charge || 0;
                        const subtotal = itemsTotal + delivery;
                        const discount = detailsOrder.applied_coupon
                          ? detailsOrder.applied_coupon.discount_type === "percentage"
                            ? Math.round((subtotal * detailsOrder.applied_coupon.discount_value) / 100)
                            : detailsOrder.applied_coupon.discount_value
                          : 0;
                        
                        return (
                          <>
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Items Total:</span>
                              <span>{formatPrice(itemsTotal)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Delivery Charge:</span>
                              <span>{formatPrice(delivery)}</span>
                            </div>
                            {detailsOrder.applied_coupon && (
                              <div className="flex justify-between text-sm text-green-600">
                                <span className="flex items-center gap-1">
                                  <Tag className="w-3 h-3" />
                                  Coupon ({detailsOrder.applied_coupon.code}):
                                </span>
                                <span className="font-medium">
                                  -{formatPrice(discount)}
                                </span>
                              </div>
                            )}
                            <Separator />
                            <div className="flex justify-between font-bold">
                              <span>Customer Pays:</span>
                              <span className="text-primary text-lg">{formatPrice(detailsOrder.total_price)}</span>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {/* Notes */}
                {detailsOrder.notes && (
                  <>
                    <Separator />
                    <div>
                      <h4 className="font-semibold mb-2">Order Notes</h4>
                      <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
                        {detailsOrder.notes}
                      </p>
                    </div>
                  </>
                )}
              </div>
            </ScrollArea>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsOrder(null)}>
              Close
            </Button>
            <Button onClick={() => {
              if (detailsOrder) {
                openPricingDialog(detailsOrder);
                setDetailsOrder(null);
              }
            }}>
              <DollarSign className="w-4 h-4 mr-2" />
              Set/Update Price
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tracking Number Dialog */}
      <Dialog open={!!trackingDialog} onOpenChange={(open) => !open && setTrackingDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5" />
              Add Tracking Number
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Order #{trackingDialog?.orderId.slice(0, 8)} will be marked as shipped.
            </p>
            <div className="space-y-2">
              <Label htmlFor="tracking">Tracking Number (optional)</Label>
              <Input
                id="tracking"
                placeholder="Enter tracking number..."
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTrackingDialog(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveTracking} disabled={isSavingTracking}>
              {isSavingTracking ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Truck className="w-4 h-4 mr-2" />
              )}
            Mark as Shipped
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Order Confirmation Dialog */}
      <Dialog open={!!deleteDialog} onOpenChange={() => setDeleteDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Delete Order
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete order #{deleteDialog?.id.slice(0, 8)}? 
              This will remove all order items and payment slips. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteOrder}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Delete Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}