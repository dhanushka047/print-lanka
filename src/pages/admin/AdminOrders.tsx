import { useState, useEffect, Fragment, useMemo, useRef } from "react";
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
  Trash2, AlertTriangle, Copy, ExternalLink, Printer
} from "lucide-react";
import { formatPrice, ORDER_STATUSES } from "@/lib/constants";
import { toast } from "sonner";
import { Invoice } from "@/components/Invoice";

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
  admin_discount_value?: number | null;
  admin_discount_type?: string | null;
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
  const [adminDiscountValue, setAdminDiscountValue] = useState<number>(0);
  const [adminDiscountType, setAdminDiscountType] = useState<"amount" | "percentage">("amount");
  const [isSavingPrices, setIsSavingPrices] = useState(false);
  const [extraCharges, setExtraCharges] = useState<{ id: string; label: string; price: number }[]>([]);
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

  const [availableColors, setAvailableColors] = useState<{ id: string; name: string; hex_value: string }[]>([]);
  
  // Batch edit order specifications state
  const [editingOrderSpecs, setEditingOrderSpecs] = useState<Order | null>(null);
  const [editedItemsState, setEditedItemsState] = useState<Record<string, OrderItem>>({});
  const [isSavingSpecs, setIsSavingSpecs] = useState(false);

  // Print Job Logging State
  const [printLogDialog, setPrintLogDialog] = useState<{ orderId: string; order: Order } | null>(null);
  const [availablePrinters, setAvailablePrinters] = useState<any[]>([]);
  const [availableFilaments, setAvailableFilaments] = useState<any[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>("");
  const [itemFilaments, setItemFilaments] = useState<Record<string, string>>({});
  const [itemHours, setItemHours] = useState<Record<string, number>>({});
  const [itemWeightsUsed, setItemWeightsUsed] = useState<Record<string, number>>({});
  const [isLoggingPrint, setIsLoggingPrint] = useState(false);

  // Invoice Dialog and Copy Link State
  const invoiceRef = useRef<HTMLDivElement>(null);
  const [invoiceOrder, setInvoiceOrder] = useState<Order | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const handleCopyInvoiceLink = (orderId: string) => {
    const publicUrl = `${window.location.origin}/invoice/${orderId}`;
    navigator.clipboard.writeText(publicUrl);
    toast.success("Invoice link copied to clipboard!");
  };

  const handleDownloadInvoice = async () => {
    if (!invoiceRef.current || !invoiceOrder) return;
    
    setIsGeneratingPdf(true);
    toast.loading("Generating PDF...", { id: "pdf-generation" });
    
    try {
      const html2canvas = (await import('html2canvas')).default;
      const jsPDF = (await import('jspdf')).default;
      
      const canvas = await html2canvas(invoiceRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });
      
      const imgWidth = 210; // A4 width in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
      pdf.save(`Invoice-${invoiceOrder.id.slice(0, 8).toUpperCase()}.pdf`);
      
      toast.success("Invoice downloaded!", { id: "pdf-generation" });
      setInvoiceOrder(null);
    } catch (error) {
      console.error("PDF generation failed:", error);
      toast.error("Failed to generate PDF", { id: "pdf-generation" });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  useEffect(() => {
    if (printLogDialog) {
      const loadPrintLogData = async () => {
        const [printersRes, filamentsRes] = await Promise.all([
          supabase.from("printers").select("id, name").eq("status", "active"),
          supabase.from("filaments").select("id, name, material, color, weight_remaining").eq("is_over", false)
        ]);
        if (printersRes.data) {
          setAvailablePrinters(printersRes.data);
          if (printersRes.data.length > 0) setSelectedPrinter(printersRes.data[0].id);
        }
        if (filamentsRes.data) {
          setAvailableFilaments(filamentsRes.data);
          
          const initialFilaments: Record<string, string> = {};
          const initialHours: Record<string, number> = {};
          const initialWeights: Record<string, number> = {};
          
          printLogDialog.order.order_items.forEach(item => {
            const match = filamentsRes.data.find(
              f => f.material.toLowerCase() === item.material.toLowerCase() &&
              Number(f.weight_remaining) >= (item.weight_grams || 0) * item.quantity
            );
            if (match) {
              initialFilaments[item.id] = match.id;
            } else {
              const materialMatch = filamentsRes.data.find(
                f => f.material.toLowerCase() === item.material.toLowerCase()
              );
              if (materialMatch) initialFilaments[item.id] = materialMatch.id;
            }
            initialHours[item.id] = 2; // Default 2 hours
            initialWeights[item.id] = (item.weight_grams || 0) * item.quantity;
          });
          setItemFilaments(initialFilaments);
          setItemHours(initialHours);
          setItemWeightsUsed(initialWeights);
        }
      };
      loadPrintLogData();
    }
  }, [printLogDialog]);

  const handleSavePrintLog = async () => {
    if (!printLogDialog) return;
    setIsLoggingPrint(true);
    try {
      for (const item of printLogDialog.order.order_items) {
        const filamentId = itemFilaments[item.id];
        const weightUsed = itemWeightsUsed[item.id] || 0;
        const printHours = itemHours[item.id] || 0;

        if (filamentId && weightUsed > 0) {
          const { error: usageErr } = await supabase.from("filament_usages").insert({
            filament_id: filamentId,
            order_item_id: item.id,
            printer_id: selectedPrinter || null,
            weight_used: weightUsed,
            print_hours: printHours,
            notes: `Auto-logged for Order #${printLogDialog.orderId.slice(0, 8)} - Item: ${item.file_name}`
          });
          if (usageErr) throw usageErr;

          const { data: filamentData } = await supabase
            .from("filaments")
            .select("weight_remaining")
            .eq("id", filamentId)
            .single();

          if (filamentData) {
            const newRemaining = Math.max(0, Number(filamentData.weight_remaining) - weightUsed);
            const { error: updateErr } = await supabase
              .from("filaments")
              .update({ 
                weight_remaining: newRemaining,
                is_over: newRemaining <= 0
              })
              .eq("id", filamentId);
            if (updateErr) throw updateErr;
          }
        }
      }

      await updateOrderStatus(printLogDialog.orderId, "in_production", printLogDialog.order);
      setPrintLogDialog(null);
    } catch (error: any) {
      toast.error(error.message || "Failed to log print details");
    } finally {
      setIsLoggingPrint(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    fetchPricingConfig();

    // Fetch available colors
    const fetchColors = async () => {
      const { data } = await supabase
        .from("available_colors")
        .select("id, name, hex_value")
        .eq("is_active", true)
        .order("sort_order");
      if (data) {
        setAvailableColors(data);
      }
    };
    fetchColors();

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

    // Intercept in_production status change to log printer/filament usage
    if (newStatus === "in_production") {
      setPrintLogDialog({ orderId, order });
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
  };

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
    setDeliveryCharge(Number(order.delivery_charge) || 350);
    setAdminDiscountValue(Number(order.admin_discount_value) || 0);
    setAdminDiscountType((order.admin_discount_type as "amount" | "percentage") || "amount");

    const initialCharges = Array.isArray(order.extra_charges) 
      ? (order.extra_charges as any[]).map((c, index) => ({
          id: c.id || String(index),
          label: c.label || "",
          price: Number(c.price) || 0
        }))
      : [];
    setExtraCharges(initialCharges);
  };

  const calculateTotal = () => {
    const itemsTotal = Object.values(itemPrices).reduce((sum, price) => sum + (price || 0), 0);
    const extraChargesTotal = extraCharges.reduce((sum, c) => sum + (c.price || 0), 0);
    return itemsTotal + deliveryCharge + extraChargesTotal;
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

  // Admin manual discount calculation
  const calculateAdminDiscount = (subtotal: number): number => {
    if (!adminDiscountValue || adminDiscountValue <= 0) return 0;
    if (adminDiscountType === "percentage") {
      return Math.round((subtotal * adminDiscountValue) / 100);
    }
    return adminDiscountValue;
  };

  // Get the final price after coupon + admin discount
  const calculateFinalTotal = () => {
    const subtotal = calculateTotal();
    const couponInfo = getAppliedCouponInfo(pricingOrder);
    const couponDiscount = calculateDiscount(subtotal, couponInfo);
    const adminDiscount = calculateAdminDiscount(subtotal);
    return Math.max(0, subtotal - couponDiscount - adminDiscount);
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
      const couponDiscount = calculateDiscount(subtotal, couponInfo);
      const adminDiscount = calculateAdminDiscount(subtotal);
      const finalTotal = Math.max(0, subtotal - couponDiscount - adminDiscount);
      const isFirstPricing = pricingOrder.status === "pending_review";
      
      // Save the final price (after discount) - this is what customer actually pays
      const updateData: any = {
        total_price: finalTotal,
        delivery_charge: deliveryCharge,
        admin_discount_value: adminDiscountValue || 0,
        admin_discount_type: adminDiscountType,
        extra_charges: extraCharges,
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
          if (couponDiscount > 0 && couponInfo) {
            message = `Your order #${pricingOrder.id.slice(0, 8)} has been priced at ${formatPrice(finalTotal)} (Coupon ${couponInfo.code}: -${formatPrice(couponDiscount)} applied).`;
          }
          if (adminDiscount > 0) {
            message += ` Special discount: -${formatPrice(adminDiscount)}.`;
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

  const openEditOrderSpecsDialog = (order: Order) => {
    setEditingOrderSpecs(order);
    const initialItemsState: Record<string, OrderItem> = {};
    order.order_items.forEach(item => {
      initialItemsState[item.id] = { ...item };
    });
    setEditedItemsState(initialItemsState);
  };

  const updateEditedItemField = (itemId: string, key: keyof OrderItem, value: any) => {
    setEditedItemsState(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        [key]: value
      }
    }));
  };

  const updateOrderTotal = async (orderId: string) => {
    const { data: items, error: itemsError } = await supabase
      .from("order_items")
      .select("price")
      .eq("order_id", orderId);
      
    if (itemsError) throw itemsError;
    
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("delivery_charge, admin_discount_value, admin_discount_type, total_price, user_id")
      .eq("id", orderId)
      .single();
      
    if (orderError) throw orderError;
    
    if (order.total_price === null) {
      return { finalTotal: null };
    }
    
    const itemsTotal = items.reduce((sum, item) => sum + (item.price || 0), 0);
    const delivery = order.delivery_charge || 0;
    const subtotal = itemsTotal + delivery;
    
    let couponDiscount = 0;
    const { data: userCoupons } = await supabase
      .from("user_coupons")
      .select(`
        coupons (
          discount_type,
          discount_value
        )
      `)
      .eq("used_on_order_id", orderId)
      .maybeSingle();
      
    if (userCoupons?.coupons) {
      const cp = userCoupons.coupons as any;
      couponDiscount = cp.discount_type === "percentage"
        ? Math.round((subtotal * cp.discount_value) / 100)
        : cp.discount_value;
    }
    
    let adminDiscount = 0;
    if (order.admin_discount_value && order.admin_discount_value > 0) {
      adminDiscount = order.admin_discount_type === "percentage"
        ? Math.round((subtotal * order.admin_discount_value) / 100)
        : order.admin_discount_value;
    }
    
    const finalTotal = Math.max(0, subtotal - couponDiscount - adminDiscount);
    
    const { error: updateError } = await supabase
      .from("orders")
      .update({ total_price: finalTotal })
      .eq("id", orderId);
      
    if (updateError) throw updateError;
    
    return { finalTotal, itemsTotal };
  };

  const handleSaveOrderSpecs = async () => {
    if (!editingOrderSpecs) return;

    setIsSavingSpecs(true);
    try {
      // 1. Save all modified order items
      for (const [itemId, item] of Object.entries(editedItemsState)) {
        const { error: itemError } = await supabase
          .from("order_items")
          .update({
            color: item.color,
            quantity: item.quantity,
            material: item.material as any,
            quality: item.quality as any,
            infill_percentage: item.infill_percentage,
            weight_grams: item.weight_grams === "" || item.weight_grams === null ? null : Number(item.weight_grams),
            price: item.price === "" || item.price === null ? null : Number(item.price),
            notes: item.notes || null,
          })
          .eq("id", itemId);

        if (itemError) throw itemError;
      }

      // 2. Recalculate order total price
      const updateRes = await updateOrderTotal(editingOrderSpecs.id);

      // 3. Compile changed specs and send unified SMS
      if (editingOrderSpecs.profile?.phone) {
        const changeMessages: string[] = [];
        
        editingOrderSpecs.order_items.forEach(originalItem => {
          const newItem = editedItemsState[originalItem.id];
          if (!newItem) return;
          
          const itemChanges: string[] = [];
          if (originalItem.color !== newItem.color) {
            const oldColor = availableColors.find(c => c.hex_value === originalItem.color)?.name || originalItem.color;
            const newColor = availableColors.find(c => c.hex_value === newItem.color)?.name || newItem.color;
            itemChanges.push(`color changed from ${oldColor} to ${newColor}`);
          }
          if (originalItem.quantity !== newItem.quantity) {
            itemChanges.push(`qty: ${originalItem.quantity} -> ${newItem.quantity}`);
          }
          if (originalItem.material !== newItem.material) {
            itemChanges.push(`material: ${originalItem.material.toUpperCase()} -> ${newItem.material.toUpperCase()}`);
          }
          if (originalItem.quality !== newItem.quality) {
            itemChanges.push(`quality: ${originalItem.quality} -> ${newItem.quality}`);
          }
          if (originalItem.infill_percentage !== newItem.infill_percentage) {
            itemChanges.push(`infill: ${originalItem.infill_percentage}% -> ${newItem.infill_percentage}%`);
          }
          if (originalItem.weight_grams !== newItem.weight_grams) {
            const oldW = originalItem.weight_grams !== null ? `${originalItem.weight_grams}g` : "not set";
            const newW = newItem.weight_grams !== null ? `${newItem.weight_grams}g` : "not set";
            itemChanges.push(`weight: ${oldW} -> ${newW}`);
          }
          if (originalItem.price !== newItem.price) {
            const oldP = originalItem.price !== null ? formatPrice(originalItem.price) : "not set";
            const newP = newItem.price !== null ? formatPrice(newItem.price) : "not set";
            itemChanges.push(`price: ${oldP} -> ${newP}`);
          }

          if (itemChanges.length > 0) {
            changeMessages.push(`"${originalItem.file_name}": ${itemChanges.join(", ")}`);
          }
        });

        if (changeMessages.length > 0) {
          let changesMsg = `Changes: ${changeMessages.join("; ")}.`;
          let totalMsg = "";
          if (updateRes.finalTotal !== null) {
            totalMsg = ` New order total: ${formatPrice(updateRes.finalTotal)}.`;
          }
          const message = `Your order #${editingOrderSpecs.id.slice(0, 8)} specifications have been updated by admin. ${changesMsg}${totalMsg}`;

          try {
            await supabase.functions.invoke("send-sms", {
              body: {
                phone: editingOrderSpecs.profile.phone,
                message,
                order_id: editingOrderSpecs.id,
                user_id: editingOrderSpecs.user_id,
              },
            });
          } catch (smsError) {
            console.error("SMS notification failed:", smsError);
          }
        }
      }

      setEditingOrderSpecs(null);
      fetchOrders();
      
      if (detailsOrder && detailsOrder.id === editingOrderSpecs.id) {
        const updatedOrderItems = detailsOrder.order_items.map(item => {
          const newItem = editedItemsState[item.id];
          return newItem ? { ...newItem } : item;
        });
        
        let newTotal = detailsOrder.total_price;
        if (updateRes.finalTotal !== null) {
          newTotal = updateRes.finalTotal;
        }

        setDetailsOrder(prev => prev ? {
          ...prev,
          order_items: updatedOrderItems,
          total_price: newTotal
        } : null);
      }

      toast.success("Order specifications updated and customer notified");
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Failed to update order specifications");
    } finally {
      setIsSavingSpecs(false);
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
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle>
              {filterStatus === "all" ? "All Orders" : ORDER_STATUSES[filterStatus as keyof typeof ORDER_STATUSES]?.label}
              <span className="text-muted-foreground font-normal ml-2">({filteredOrders.length})</span>
            </CardTitle>
            {selectedIds.size > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setBulkDeleteOpen(true)}
                className="gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Delete Selected ({selectedIds.size})
              </Button>
            )}
          </div>
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
                  <TableHead className="w-10">
                    <Checkbox
                      checked={filteredOrders.length > 0 && selectedIds.size === filteredOrders.length}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all"
                    />
                  </TableHead>
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
                    <TableRow className="hover:bg-muted/50" data-state={selectedIds.has(order.id) ? "selected" : undefined}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(order.id)}
                          onCheckedChange={() => toggleSelect(order.id)}
                          aria-label={`Select order ${order.id.slice(0, 8)}`}
                        />
                      </TableCell>
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
                      <TableCell>
                        <Select
                          value={order.status}
                          onValueChange={(v) => handleStatusChange(order.id, v, order)}
                        >
                          <SelectTrigger className="w-auto h-auto p-0 border-none shadow-none focus:ring-0 bg-transparent cursor-pointer">
                            {getStatusBadge(order.status)}
                          </SelectTrigger>
                          <SelectContent>
                            {statusOptions.map((status) => (
                              <SelectItem key={status} value={status} className="text-xs">
                                {ORDER_STATUSES[status as keyof typeof ORDER_STATUSES]?.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
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
                            title="View Details"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title="View Invoice"
                            onClick={() => setInvoiceOrder(order)}
                          >
                            <FileText className="w-4 h-4 text-cyan-600" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Copy Invoice Link"
                            onClick={() => handleCopyInvoiceLink(order.id)}
                          >
                            <Copy className="w-4 h-4 text-emerald-600" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Assign Printer & Spool"
                            onClick={() => setPrintLogDialog({ orderId: order.id, order })}
                          >
                            <Printer className="w-4 h-4 text-indigo-600" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleteDialog(order)}
                            title="Delete Order"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedOrder === order.id && (
                      <TableRow className="bg-muted/50">
                        <TableCell colSpan={11}>
                          <div className="p-4 space-y-4">
                            <div className="flex justify-between items-start gap-4 flex-wrap">
                              <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-4 flex-wrap">
                                  <h4 className="font-semibold">Order Items</h4>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => openEditOrderSpecsDialog(order)}
                                    className="gap-2 h-8 text-xs"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                    Edit Specifications
                                  </Button>
                                </div>
                                {order.notes && (
                                  <p className="text-sm text-muted-foreground">
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
        <DialogContent className="max-w-2xl max-h-[90vh] !flex !flex-col overflow-hidden">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Set Order Prices</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Order #{pricingOrder?.id.slice(0, 8)} • {pricingOrder?.profile?.first_name} {pricingOrder?.profile?.last_name}
            </DialogDescription>
          </DialogHeader>
          
          {pricingOrder && (
            <>
              <div className="flex-1 overflow-y-auto pr-4">
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

                  {/* Extra Charges Section */}
                  <div className="space-y-3 border rounded-lg p-3 bg-muted/30">
                    <div className="flex justify-between items-center">
                      <Label className="font-semibold flex items-center gap-1 text-sm">
                        <DollarSign className="w-4 h-4 text-primary" />
                        Extra Charges
                      </Label>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setExtraCharges([...extraCharges, { id: Math.random().toString(), label: "", price: 0 }])}
                        className="h-8 text-xs gap-1"
                      >
                        + Add Extra Charge
                      </Button>
                    </div>

                    {extraCharges.length > 0 ? (
                      <div className="space-y-2">
                        {extraCharges.map((charge, idx) => (
                          <div key={charge.id} className="flex gap-2 items-center">
                            <Input
                              placeholder="e.g. Design Cost, Post-processing"
                              value={charge.label}
                              onChange={(e) => {
                                const newCharges = [...extraCharges];
                                newCharges[idx].label = e.target.value;
                                setExtraCharges(newCharges);
                              }}
                              className="flex-1 h-9 text-sm"
                            />
                            <Input
                              type="number"
                              placeholder="Price"
                              value={charge.price || ""}
                              onChange={(e) => {
                                const newCharges = [...extraCharges];
                                newCharges[idx].price = Number(e.target.value) || 0;
                                setExtraCharges(newCharges);
                              }}
                              className="w-28 h-9 text-sm"
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="text-destructive h-9 w-9 p-0 hover:bg-destructive/10"
                              onClick={() => setExtraCharges(extraCharges.filter(c => c.id !== charge.id))}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">No extra charges added yet.</p>
                    )}
                  </div>

                  {/* Admin Discount */}
                  <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/50">
                    <Tag className="w-4 h-4 text-muted-foreground" />
                    <div className="flex-1">
                      <Label>Discount</Label>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        className="w-28"
                        value={adminDiscountValue || ""}
                        placeholder="0"
                        onChange={(e) => setAdminDiscountValue(Number(e.target.value) || 0)}
                      />
                      <select
                        value={adminDiscountType}
                        onChange={(e) => setAdminDiscountType(e.target.value as "amount" | "percentage")}
                        className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                      >
                        <option value="amount">LKR</option>
                        <option value="percentage">%</option>
                      </select>
                    </div>
                  </div>

                  {/* Price Summary */}
                  {(() => {
                    const couponInfo = getAppliedCouponInfo(pricingOrder);
                    const itemsTotal = Object.values(itemPrices).reduce((sum, p) => sum + (p || 0), 0);
                    const subtotal = itemsTotal + deliveryCharge;
                    const discountAmount = calculateDiscount(subtotal, couponInfo);
                    const adminDiscountAmount = calculateAdminDiscount(subtotal);
                    const customerPays = Math.max(0, subtotal - discountAmount - adminDiscountAmount);
                    
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

                        {adminDiscountAmount > 0 && (
                          <div className="flex justify-between items-center p-3 bg-amber-100 dark:bg-amber-900/40 rounded-lg border border-amber-300 dark:border-amber-700">
                            <span className="flex items-center gap-2 text-amber-700 dark:text-amber-300 font-medium">
                              <Tag className="w-4 h-4" />
                              <span>Admin Discount</span>
                              <Badge className="bg-amber-600 text-white text-xs">
                                {adminDiscountType === "percentage"
                                  ? `${adminDiscountValue}% OFF`
                                  : formatPrice(adminDiscountValue) + " OFF"}
                              </Badge>
                            </span>
                            <span className="font-bold text-lg text-amber-700 dark:text-amber-300">
                              -{formatPrice(adminDiscountAmount)}
                            </span>
                          </div>
                        )}

                        <div className="flex justify-between items-center p-4 bg-primary/20 rounded-lg border-2 border-primary/30 mt-2">
                          <span className="font-bold text-lg">
                            {(couponInfo || adminDiscountAmount > 0) ? "🎉 Customer Pays" : "Total"}
                          </span>
                          <span className="text-3xl font-bold text-primary">
                            {formatPrice(customerPays)}
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

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
                        const extraTotal = Array.isArray(detailsOrder.extra_charges)
                          ? (detailsOrder.extra_charges as any[]).reduce((sum, c) => sum + Number(c.price || 0), 0)
                          : 0;
                        const subtotal = itemsTotal + delivery + extraTotal;
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
                            {Array.isArray(detailsOrder.extra_charges) && (detailsOrder.extra_charges as any[]).map((charge, idx) => (
                              <div key={idx} className="flex justify-between text-sm">
                                <span className="text-muted-foreground">{charge.label || 'Extra Charge'}:</span>
                                <span>{formatPrice(Number(charge.price || 0))}</span>
                              </div>
                            ))}
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

          <DialogFooter className="flex-wrap gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDetailsOrder(null)}>
              Close
            </Button>
            <Button 
              variant="outline"
              onClick={() => {
                if (detailsOrder) {
                  setInvoiceOrder(detailsOrder);
                  setDetailsOrder(null);
                }
              }}
              className="gap-2 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-600 border-cyan-200"
            >
              <FileText className="w-4 h-4" />
              View Invoice
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (detailsOrder) {
                  handleCopyInvoiceLink(detailsOrder.id);
                }
              }}
              className="gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 border-emerald-200"
            >
              <Copy className="w-4 h-4" />
              Copy Link
            </Button>
            <Button 
              variant="outline"
              onClick={() => {
                if (detailsOrder) {
                  openEditOrderSpecsDialog(detailsOrder);
                  setDetailsOrder(null);
                }
              }}
              className="gap-2"
            >
              <Edit2 className="w-4 h-4" />
              Edit Specs
            </Button>
            <Button onClick={() => {
              if (detailsOrder) {
                openPricingDialog(detailsOrder);
                setDetailsOrder(null);
              }
            }}>
              <DollarSign className="w-4 h-4 mr-2" />
              Price
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Order Specs Dialog */}
      <Dialog open={!!editingOrderSpecs} onOpenChange={() => setEditingOrderSpecs(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] !flex !flex-col overflow-hidden">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Edit Order Specifications</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Order #{editingOrderSpecs?.id.slice(0, 8)} • {editingOrderSpecs?.profile?.first_name} {editingOrderSpecs?.profile?.last_name}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-4 space-y-4 py-2">
            {editingOrderSpecs && editingOrderSpecs.order_items.map((originalItem) => {
              const item = editedItemsState[originalItem.id];
              if (!item) return null;

              return (
                <div key={item.id} className="p-4 border rounded-lg space-y-4 bg-card">
                  <div className="flex items-center justify-between border-b pb-2">
                    <span className="font-semibold text-sm text-primary truncate max-w-lg">
                      {item.file_name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Original: {originalItem.material.toUpperCase()} • {originalItem.quality} • {originalItem.infill_percentage}% • {originalItem.quantity}x
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Color selection */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">Color</Label>
                      <div className="flex gap-2">
                        <Select 
                          value={item.color} 
                          onValueChange={(val) => updateEditedItemField(item.id, "color", val)}
                        >
                          <SelectTrigger className="h-9 text-xs flex-1">
                            <SelectValue placeholder="Select color" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableColors.map((color) => (
                              <SelectItem key={color.id} value={color.hex_value} className="text-xs">
                                <div className="flex items-center gap-2">
                                  <div className="w-3.5 h-3.5 rounded-full border" style={{ backgroundColor: color.hex_value }} />
                                  <span>{color.name}</span>
                                </div>
                              </SelectItem>
                            ))}
                            {!availableColors.some(c => c.hex_value === item.color) && item.color && (
                              <SelectItem value={item.color} className="text-xs">
                                <div className="flex items-center gap-2">
                                  <div className="w-3.5 h-3.5 rounded-full border" style={{ backgroundColor: item.color }} />
                                  <span>Current Color ({item.color})</span>
                                </div>
                              </SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                        <Input 
                          type="text" 
                          placeholder="#HEX" 
                          value={item.color} 
                          onChange={(e) => updateEditedItemField(item.id, "color", e.target.value)}
                          className="h-9 text-xs font-mono w-24"
                        />
                        <div className="w-9 h-9 rounded-md border flex-shrink-0" style={{ backgroundColor: item.color || '#FFFFFF' }} />
                      </div>
                    </div>

                    {/* Material & Quality */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold">Material</Label>
                        <Select 
                          value={item.material} 
                          onValueChange={(val) => updateEditedItemField(item.id, "material", val)}
                        >
                          <SelectTrigger className="h-9 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pla" className="text-xs">PLA</SelectItem>
                            <SelectItem value="petg" className="text-xs">PETG</SelectItem>
                            <SelectItem value="abs" className="text-xs">ABS</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs font-semibold">Quality</Label>
                        <Select 
                          value={item.quality} 
                          onValueChange={(val) => updateEditedItemField(item.id, "quality", val)}
                        >
                          <SelectTrigger className="h-9 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="draft" className="text-xs">Draft (0.3mm)</SelectItem>
                            <SelectItem value="normal" className="text-xs">Normal (0.2mm)</SelectItem>
                            <SelectItem value="high" className="text-xs">High (0.1mm)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">Infill %</Label>
                      <Input
                        type="number"
                        min={10}
                        max={100}
                        value={item.infill_percentage}
                        onChange={(e) => updateEditedItemField(item.id, "infill_percentage", Number(e.target.value))}
                        className="h-9 text-xs"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">Quantity</Label>
                      <Input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(e) => updateEditedItemField(item.id, "quantity", Number(e.target.value))}
                        className="h-9 text-xs"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">Weight (g)</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder="Not set"
                        value={item.weight_grams !== null ? item.weight_grams : ""}
                        onChange={(e) => updateEditedItemField(item.id, "weight_grams", e.target.value === "" ? null : Number(e.target.value))}
                        className="h-9 text-xs"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">Price (LKR)</Label>
                      <Input
                        type="number"
                        min={0}
                        placeholder="Not set"
                        value={item.price !== null ? item.price : ""}
                        onChange={(e) => updateEditedItemField(item.id, "price", e.target.value === "" ? null : Number(e.target.value))}
                        className="h-9 text-xs"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Notes</Label>
                    <Input
                      placeholder="Special instructions..."
                      value={item.notes || ""}
                      onChange={(e) => updateEditedItemField(item.id, "notes", e.target.value)}
                      className="h-9 text-xs"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <DialogFooter className="flex-shrink-0 border-t pt-4 mt-2">
            <Button variant="outline" onClick={() => setEditingOrderSpecs(null)} size="sm">
              Cancel
            </Button>
            <Button onClick={handleSaveOrderSpecs} disabled={isSavingSpecs} size="sm">
              {isSavingSpecs ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              Save & Notify Customer
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

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Delete {selectedIds.size} Order{selectedIds.size > 1 ? "s" : ""}
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedIds.size} selected order{selectedIds.size > 1 ? "s" : ""}?
              All related order items and payment slips will also be removed. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={isBulkDeleting}>
              {isBulkDeleting ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Delete {selectedIds.size} Order{selectedIds.size > 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Print Logging / Production Dialog */}
      <Dialog open={!!printLogDialog} onOpenChange={() => setPrintLogDialog(null)}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Log Print Job Details</DialogTitle>
            <DialogDescription>
              Assign printers and track filament usage before starting production on Order #{printLogDialog?.orderId.slice(0, 8)}
            </DialogDescription>
          </DialogHeader>

          {printLogDialog && (
            <div className="space-y-6 py-4">
              <div className="space-y-2">
                <Label htmlFor="printer-select">Select Printer</Label>
                {availablePrinters.length === 0 ? (
                  <p className="text-sm text-destructive font-semibold">
                    No active printers available! Please register and activate printers first.
                  </p>
                ) : (
                  <Select value={selectedPrinter} onValueChange={setSelectedPrinter}>
                    <SelectTrigger id="printer-select">
                      <SelectValue placeholder="Select a printer" />
                    </SelectTrigger>
                    <SelectContent>
                      {availablePrinters.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-semibold">Usage logs per item</h4>
                {printLogDialog.order.order_items.map((item) => {
                  const matchingSpools = availableFilaments.filter(
                    (f) => f.material.toLowerCase() === item.material.toLowerCase()
                  );

                  return (
                    <div key={item.id} className="p-3 border rounded-lg space-y-3 bg-secondary/20">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold text-sm">{item.file_name}</p>
                          <p className="text-xs text-muted-foreground">
                            Qty: {item.quantity} | Material: <span className="uppercase">{item.material}</span> | Color: {item.color} | Weight: {item.weight_grams || 0}g
                          </p>
                        </div>
                        <Badge className="bg-primary/15 text-primary border-none">
                          Qty: {item.quantity}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Filament Spool</Label>
                          {matchingSpools.length === 0 ? (
                            <p className="text-xs text-destructive font-medium">No matching filaments spools.</p>
                          ) : (
                            <Select 
                              value={itemFilaments[item.id] || ""} 
                              onValueChange={(val) => setItemFilaments(prev => ({ ...prev, [item.id]: val }))}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Select spool" />
                              </SelectTrigger>
                              <SelectContent>
                                {matchingSpools.map((f) => (
                                  <SelectItem key={f.id} value={f.id} className="text-xs">
                                    {f.name} ({f.color}) - {f.weight_remaining}g left
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Hours</Label>
                            <Input
                              type="number"
                              className="h-8 text-xs"
                              value={itemHours[item.id] || ""}
                              onChange={(e) => setItemHours(prev => ({ ...prev, [item.id]: Number(e.target.value) }))}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Weight (g)</Label>
                            <Input
                              type="number"
                              className="h-8 text-xs"
                              value={itemWeightsUsed[item.id] || ""}
                              onChange={(e) => setItemWeightsUsed(prev => ({ ...prev, [item.id]: Number(e.target.value) }))}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={async () => {
                if (printLogDialog) {
                  await updateOrderStatus(printLogDialog.orderId, "in_production", printLogDialog.order);
                  setPrintLogDialog(null);
                }
              }}
            >
              Skip & Start Production
            </Button>
            <Button 
              onClick={handleSavePrintLog} 
              disabled={isLoggingPrint || availablePrinters.length === 0}
            >
              {isLoggingPrint && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save & Start Production
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invoice Dialog */}
      <Dialog open={!!invoiceOrder} onOpenChange={() => setInvoiceOrder(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Invoice
            </DialogTitle>
          </DialogHeader>
          
          {invoiceOrder && (
            <>
              <ScrollArea className="max-h-[65vh] px-6">
                <Invoice
                  ref={invoiceRef}
                  orderId={invoiceOrder.id}
                  orderItems={invoiceOrder.order_items}
                  totalPrice={invoiceOrder.total_price || 0}
                  deliveryCharge={invoiceOrder.delivery_charge || 0}
                  createdAt={invoiceOrder.created_at}
                  paidAt={invoiceOrder.paid_at}
                  trackingNumber={invoiceOrder.tracking_number}
                  profile={invoiceOrder.profile}
                  appliedCoupon={invoiceOrder.applied_coupon}
                  status={invoiceOrder.status}
                  extraCharges={invoiceOrder.extra_charges}
                />
              </ScrollArea>
              
              <DialogFooter className="px-6 pb-6 border-t pt-4">
                <Button variant="outline" onClick={() => setInvoiceOrder(null)}>
                  Close
                </Button>
                <Button variant="outline" onClick={() => handleCopyInvoiceLink(invoiceOrder.id)} className="gap-2">
                  <Copy className="w-4 h-4" />
                  Copy Link
                </Button>
                <Button onClick={handleDownloadInvoice} disabled={isGeneratingPdf} className="gap-2">
                  {isGeneratingPdf ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  Download PDF
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}