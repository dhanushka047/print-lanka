import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  User, Package, Tag, Clock, CheckCircle, XCircle, 
  Truck, Printer, CreditCard, Edit2, Save, Loader2,
  Calendar, Percent, ChevronRight, Upload, FileImage, X, AlertCircle, Building2, ShoppingBag, Download, FileText
} from "lucide-react";
import { formatPrice, ORDER_STATUSES } from "@/lib/constants";
import { toast } from "sonner";
import { BankDetailsDialog } from "@/components/BankDetailsDialog";
import { UserShopOrders } from "@/components/dashboard/UserShopOrders";
import { Invoice } from "@/components/Invoice";

interface OrderItem {
  id: string;
  file_name: string;
  quantity: number;
  color: string;
  material: string;
  quality: string;
  infill_percentage?: number;
  price: number | null;
  weight_grams?: number | null;
}

interface PaymentSlip {
  id: string;
  file_name: string;
  verified: boolean | null;
}

interface AppliedCoupon {
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
  paid_at?: string | null;
  notes: string | null;
  tracking_number: string | null;
  order_items: OrderItem[];
  payment_slips: PaymentSlip[];
  applied_coupon?: AppliedCoupon | null;
}

interface UserCoupon {
  id: string;
  is_used: boolean;
  used_at: string | null;
  assigned_at: string;
  coupon: {
    code: string;
    discount_type: string;
    discount_value: number;
    valid_until: string | null;
  };
}

const getOrderPricingBreakdown = (order: Order) => {
  const itemsTotal = order.order_items.reduce((sum, item) => sum + (item.price || 0), 0);
  const delivery = order.delivery_charge || 0;
  const subtotal = itemsTotal + delivery;

  const discount = order.applied_coupon
    ? order.applied_coupon.discount_type === "percentage"
      ? Math.round((subtotal * order.applied_coupon.discount_value) / 100)
      : order.applied_coupon.discount_value
    : 0;

  const payable = Math.max(0, subtotal - discount);
  return { itemsTotal, delivery, subtotal, discount, payable };
};

const statusIcons: Record<string, React.ReactNode> = {
  pending_review: <Clock className="w-4 h-4" />,
  priced_awaiting_payment: <CreditCard className="w-4 h-4" />,
  payment_submitted: <CreditCard className="w-4 h-4" />,
  payment_approved: <CheckCircle className="w-4 h-4" />,
  in_production: <Printer className="w-4 h-4" />,
  ready_to_ship: <Package className="w-4 h-4" />,
  shipped: <Truck className="w-4 h-4" />,
  completed: <CheckCircle className="w-4 h-4" />,
  rejected: <XCircle className="w-4 h-4" />,
  payment_rejected: <XCircle className="w-4 h-4" />,
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, profile, isLoading: authLoading, refreshProfile } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [coupons, setCoupons] = useState<UserCoupon[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [isLoadingCoupons, setIsLoadingCoupons] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    address: "",
  });
  
  // Get default tab from URL
  const defaultTab = searchParams.get("tab") || "orders";
  
  // Payment slip upload
  const [uploadingOrderId, setUploadingOrderId] = useState<string | null>(null);
  const [paymentSlip, setPaymentSlip] = useState<File | null>(null);
  const [paymentSlipPreview, setPaymentSlipPreview] = useState<string | null>(null);
  const [isUploadingSlip, setIsUploadingSlip] = useState(false);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [showBankDetails, setShowBankDetails] = useState(false);
  const [adminPhone, setAdminPhone] = useState("0717367497");
  const [invoiceOrder, setInvoiceOrder] = useState<Order | null>(null);
  const invoiceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/login");
    }
  }, [user, authLoading, navigate]);

  // Fetch admin phone for notifications
  useEffect(() => {
    const fetchAdminPhone = async () => {
      const { data } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "contact_config")
        .maybeSingle();

      if (data?.value && typeof data.value === 'object' && !Array.isArray(data.value)) {
        const config = data.value as { admin_phone?: string };
        if (config.admin_phone) {
          setAdminPhone(config.admin_phone);
        }
      }
    };
    fetchAdminPhone();
  }, []);

  useEffect(() => {
    if (profile) {
      setEditForm({
        first_name: profile.first_name,
        last_name: profile.last_name,
        phone: profile.phone,
        address: profile.address,
      });
    }
  }, [profile]);

  const fetchOrders = async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from("orders")
      .select(`
        id,
        status,
        total_price,
        delivery_charge,
        created_at,
        paid_at,
        notes,
        tracking_number,
        order_items (
          id,
          file_name,
          quantity,
          color,
          material,
          quality,
          infill_percentage,
          price,
          weight_grams
        ),
        payment_slips (
          id,
          file_name,
          verified
        )
      `)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (!error && data) {
      // Fetch applied coupons for all orders
      const orderIds = data.map(o => o.id);
      const { data: appliedCouponsData } = await supabase
        .from("user_coupons")
        .select(`
          used_on_order_id,
          coupons (
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
            code: uc.coupons.code,
            discount_type: uc.coupons.discount_type,
            discount_value: uc.coupons.discount_value,
          });
        }
      });

      const mappedOrders: Order[] = data.map((order: any) => ({
        ...order,
        applied_coupon: couponMap.get(order.id) || null,
      }));

      setOrders(mappedOrders);
    }
    setIsLoadingOrders(false);
  };

  const fetchCoupons = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from("user_coupons")
      .select(`
        id,
        is_used,
        used_at,
        assigned_at,
        coupon:coupons (
          code,
          discount_type,
          discount_value,
          valid_until
        )
      `)
      .eq("user_id", user.id)
      .order("assigned_at", { ascending: false });

    if (!error && data) {
      // Filter out coupons where the coupon data is null (deleted coupons)
      const mappedCoupons = data
        .filter((uc: any) => uc.coupon !== null)
        .map((uc: any) => ({
          id: uc.id,
          is_used: uc.is_used,
          used_at: uc.used_at,
          assigned_at: uc.assigned_at,
          coupon: uc.coupon
        }));
      setCoupons(mappedCoupons);
    }
    setIsLoadingCoupons(false);
  };

  useEffect(() => {
    if (user) {
      fetchOrders();
      fetchCoupons();

      // Set up real-time subscriptions
      const ordersChannel = supabase
        .channel('user-orders')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'orders',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            console.log('Order update:', payload);
            if (payload.eventType === 'UPDATE') {
              const newStatus = (payload.new as any).status;
              const statusInfo = ORDER_STATUSES[newStatus as keyof typeof ORDER_STATUSES];
              if (statusInfo) {
                toast.info(`Order status updated: ${statusInfo.label}`);
              }
            }
            fetchOrders();
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'user_coupons',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            console.log('Coupon update:', payload);
            if (payload.eventType === 'INSERT') {
              toast.success("New coupon added to your wallet!");
            }
            fetchCoupons();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(ordersChannel);
      };
    }
  }, [user]);

  const handleSaveProfile = async () => {
    if (!user) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: editForm.first_name,
          last_name: editForm.last_name,
          phone: editForm.phone,
          address: editForm.address,
        })
        .eq("user_id", user.id);

      if (error) throw error;
      
      await refreshProfile();
      setIsEditing(false);
      toast.success("Profile updated successfully");
    } catch (error) {
      toast.error("Failed to update profile");
    } finally {
      setIsSaving(false);
    }
  };

  const handlePaymentSlipChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
        toast.error("Please upload an image or PDF file");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error("File size must be less than 10MB");
        return;
      }
      setPaymentSlip(file);
      if (file.type.startsWith('image/')) {
        setPaymentSlipPreview(URL.createObjectURL(file));
      } else {
        setPaymentSlipPreview(null);
      }
    }
  };

  const handleUploadPaymentSlip = async () => {
    if (!user || !uploadingOrderId || !paymentSlip) return;

    setIsUploadingSlip(true);
    try {
      const slipPath = `${user.id}/${uploadingOrderId}/payment_slip_${Date.now()}_${paymentSlip.name}`;
      
      const { error: uploadError } = await supabase.storage
        .from("payment-slips")
        .upload(slipPath, paymentSlip);

      if (uploadError) throw uploadError;

      // Create payment slip record
      const { error: recordError } = await supabase
        .from("payment_slips")
        .insert({
          order_id: uploadingOrderId,
          user_id: user.id,
          file_name: paymentSlip.name,
          file_path: slipPath,
        });

      if (recordError) throw recordError;

      // Update order status
      const { error: statusError } = await supabase
        .from("orders")
        .update({ status: "payment_submitted" })
        .eq("id", uploadingOrderId);

      if (statusError) throw statusError;

      // Notify admin about payment slip
      try {
        await supabase.functions.invoke("send-sms", {
          body: {
            phone: adminPhone,
            message: `Payment slip uploaded for order #${uploadingOrderId.slice(0, 8)} by ${profile?.first_name || 'Customer'}. Please verify.`,
            order_id: uploadingOrderId,
            user_id: user.id,
          },
        });
      } catch (smsError) {
        console.error("Failed to send admin notification:", smsError);
      }

      // Close dialog and refresh
      setUploadingOrderId(null);
      setPaymentSlip(null);
      if (paymentSlipPreview) {
        URL.revokeObjectURL(paymentSlipPreview);
        setPaymentSlipPreview(null);
      }
      
      fetchOrders();
      toast.success("Payment slip uploaded successfully!");
    } catch (error: any) {
      toast.error(error.message || "Failed to upload payment slip");
    } finally {
      setIsUploadingSlip(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusInfo = ORDER_STATUSES[status as keyof typeof ORDER_STATUSES];
    if (!statusInfo) return <Badge variant="outline">{status}</Badge>;

    const isError = status.includes("rejected");
    const isSuccess = status === "completed" || status === "shipped";
    const isPending = status.includes("pending") || status.includes("awaiting");

    return (
      <Badge 
        variant="outline" 
        className={`gap-1 ${
          isError ? "border-destructive text-destructive" :
          isSuccess ? "border-success text-success" :
          isPending ? "border-warning text-warning" :
          "border-primary text-primary"
        }`}
      >
        {statusIcons[status]}
        {statusInfo.label}
      </Badge>
    );
  };

  const canUploadPaymentSlip = (order: Order) => {
    return (
      order.status === "priced_awaiting_payment" || 
      order.status === "payment_rejected"
    ) && order.total_price;
  };

  const handleDownloadInvoice = async () => {
    if (!invoiceRef.current || !invoiceOrder) return;
    
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
    } catch (error) {
      console.error("PDF generation failed:", error);
      toast.error("Failed to generate PDF", { id: "pdf-generation" });
    }
  };

  if (authLoading) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen bg-background py-8">
        <div className="container mx-auto px-4">
          <div className="mb-8">
            <h1 className="font-display text-3xl font-bold">My Dashboard</h1>
            <p className="text-muted-foreground">
              Manage your orders, coupons, and profile
            </p>
          </div>

          <Tabs defaultValue={defaultTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
              <TabsTrigger value="orders" className="gap-2">
                <Package className="w-4 h-4" />
                <span className="hidden sm:inline">3D Print</span> Orders
              </TabsTrigger>
              <TabsTrigger value="shop-orders" className="gap-2">
                <ShoppingBag className="w-4 h-4" />
                Shop
              </TabsTrigger>
              <TabsTrigger value="coupons" className="gap-2">
                <Tag className="w-4 h-4" />
                Coupons
              </TabsTrigger>
              <TabsTrigger value="profile" className="gap-2">
                <User className="w-4 h-4" />
                Profile
              </TabsTrigger>
            </TabsList>

            {/* Orders Tab */}
            <TabsContent value="orders" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Order History</CardTitle>
                  <CardDescription>
                    View all your orders and their status
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoadingOrders ? (
                    <div className="flex justify-center py-12">
                      <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    </div>
                  ) : orders.length === 0 ? (
                    <div className="text-center py-12">
                      <Package className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
                      <p className="text-muted-foreground mb-4">No orders yet</p>
                      <Button onClick={() => navigate("/")}>
                        Start Your First Order
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {orders.map((order) => (
                        <Card key={order.id} className="hover:border-primary/30 transition-colors">
                          <CardContent className="p-4">
                            <div className="flex flex-col gap-4">
                              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                                <div className="space-y-2">
                                  <div className="flex items-center gap-3 flex-wrap">
                                    <span className="font-mono text-sm text-muted-foreground">
                                      #{order.id.slice(0, 8)}
                                    </span>
                                    {getStatusBadge(order.status)}
                                    {order.payment_slips.length > 0 && (
                                      <Badge variant="secondary" className="gap-1">
                                        <FileImage className="w-3 h-3" />
                                        Slip uploaded
                                      </Badge>
                                    )}
                                    {order.tracking_number && (order.status === "shipped" || order.status === "completed") && (
                                      <Badge variant="outline" className="gap-1 border-success text-success">
                                        <Truck className="w-3 h-3" />
                                        {order.tracking_number}
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    {order.order_items.slice(0, 3).map((item) => (
                                      <div 
                                        key={item.id}
                                        className="flex items-center gap-2 bg-secondary px-2 py-1 rounded text-sm"
                                      >
                                        <div 
                                          className="w-3 h-3 rounded-full border"
                                          style={{ backgroundColor: item.color }}
                                        />
                                        <span className="truncate max-w-[150px]">{item.file_name}</span>
                                        <span className="text-muted-foreground">×{item.quantity}</span>
                                      </div>
                                    ))}
                                    {order.order_items.length > 3 && (
                                      <span className="text-sm text-muted-foreground">
                                        +{order.order_items.length - 3} more
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-4">
                                  <div className="text-right">
                                    {order.total_price != null ? (
                                      (() => {
                                        const { subtotal, discount, payable } = getOrderPricingBreakdown(order);
                                        return (
                                          <div className="space-y-0.5">
                                            <p className="font-semibold text-primary">
                                              {formatPrice(payable)}
                                            </p>
                                            {order.applied_coupon && discount > 0 && (
                                              <p className="text-xs text-success">
                                                Coupon {order.applied_coupon.code}: -{formatPrice(discount)}
                                              </p>
                                            )}
                                            <p className="text-xs text-muted-foreground">
                                              Subtotal {formatPrice(subtotal)}
                                            </p>
                                          </div>
                                        );
                                      })()
                                    ) : (
                                      <p className="font-semibold">Pending quote</p>
                                    )}
                                    <p className="text-xs text-muted-foreground">
                                      {new Date(order.created_at).toLocaleDateString()}
                                    </p>
                                  </div>
                                  <Button 
                                    variant="ghost" 
                                    size="icon"
                                    onClick={() => setExpandedOrderId(
                                      expandedOrderId === order.id ? null : order.id
                                    )}
                                  >
                                    <ChevronRight className={`w-4 h-4 transition-transform ${
                                      expandedOrderId === order.id ? 'rotate-90' : ''
                                    }`} />
                                  </Button>
                                </div>
                              </div>

                              {/* Action buttons */}
                              {canUploadPaymentSlip(order) && (
                                <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-lg border border-primary/20">
                                  <AlertCircle className="w-5 h-5 text-primary flex-shrink-0" />
                                  <div className="flex-1">
                                    <p className="text-sm font-medium">Payment Required</p>
                                    <p className="text-xs text-muted-foreground">
                                      Upload your bank transfer slip to proceed
                                    </p>
                                  </div>
                                  <Button 
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setShowBankDetails(true)}
                                  >
                                    <Building2 className="w-4 h-4 mr-1" />
                                    Bank Details
                                  </Button>
                                  <Button 
                                    size="sm" 
                                    onClick={() => setUploadingOrderId(order.id)}
                                  >
                                    <Upload className="w-4 h-4 mr-2" />
                                    Upload Slip
                                  </Button>
                                </div>
                              )}

                              {/* Expanded details */}
                              {expandedOrderId === order.id && (
                                <div className="border-t pt-4 space-y-3">
                                  <h4 className="font-medium text-sm">Order Items</h4>
                                  <div className="space-y-2">
                                    {order.order_items.map((item) => (
                                      <div 
                                        key={item.id}
                                        className="flex items-center gap-3 p-2 bg-muted rounded"
                                      >
                                        <div 
                                          className="w-4 h-4 rounded-full border"
                                          style={{ backgroundColor: item.color }}
                                        />
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm font-medium truncate">{item.file_name}</p>
                                          <p className="text-xs text-muted-foreground">
                                            {item.material.toUpperCase()} • {item.quality}
                                          </p>
                                        </div>
                                        <span className="text-sm">×{item.quantity}</span>
                                        {item.price && (
                                          <span className="text-sm font-medium">
                                            {formatPrice(item.price)}
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                  {order.total_price != null && (
                                    <div className="pt-2 border-t space-y-2">
                                      {/* Calculate proper breakdown */}
                                      {(() => {
                                        const itemsTotal = order.order_items.reduce((sum, item) => sum + (item.price || 0), 0);
                                        const delivery = order.delivery_charge || 0;
                                        const subtotal = itemsTotal + delivery;
                                        const discount = order.applied_coupon
                                          ? order.applied_coupon.discount_type === "percentage"
                                            ? Math.round((subtotal * order.applied_coupon.discount_value) / 100)
                                            : order.applied_coupon.discount_value
                                          : 0;
                                        
                                        return (
                                          <>
                                            <div className="flex justify-between items-center text-sm">
                                              <span className="text-muted-foreground">Items Subtotal</span>
                                              <span>{formatPrice(itemsTotal)}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm">
                                              <span className="text-muted-foreground">Delivery</span>
                                              <span>{formatPrice(delivery)}</span>
                                            </div>
                                            {/* Show coupon discount if applied */}
                                            {order.applied_coupon && (
                                              <div className="flex justify-between items-center text-sm text-green-600">
                                                <span className="flex items-center gap-1">
                                                  <Percent className="w-3 h-3" />
                                                  Coupon ({order.applied_coupon.code})
                                                </span>
                                                <span className="font-medium">
                                                  -{formatPrice(discount)}
                                                </span>
                                              </div>
                                            )}
                                            <div className="flex justify-between items-center pt-2 border-t">
                                              <span className="font-bold">You Pay</span>
                                              <span className="font-bold text-lg text-primary">
                                                {formatPrice(order.total_price)}
                                              </span>
                                            </div>
                                          </>
                                        );
                                      })()}
                                    </div>
                                  )}
                                  {/* Tracking Info */}
                                  {order.tracking_number && (order.status === "shipped" || order.status === "completed") && (
                                    <div className="pt-3 border-t">
                                      <div className="flex items-center gap-2 p-3 bg-success/10 rounded-lg border border-success/20">
                                        <Truck className="w-5 h-5 text-success flex-shrink-0" />
                                        <div>
                                          <p className="text-sm font-medium">Tracking Number</p>
                                          <p className="text-base font-mono">{order.tracking_number}</p>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                  {/* Invoice Download Button */}
                                  {order.total_price != null && (
                                    <div className="pt-3 border-t flex justify-end">
                                      <Button 
                                        variant="outline" 
                                        size="sm"
                                        onClick={() => setInvoiceOrder(order)}
                                        className="gap-2"
                                      >
                                        <FileText className="w-4 h-4" />
                                        View Invoice
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Shop Orders Tab */}
            <TabsContent value="shop-orders" className="space-y-4">
              <UserShopOrders />
            </TabsContent>

            {/* Coupons Tab */}
            <TabsContent value="coupons" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>My Coupons</CardTitle>
                  <CardDescription>
                    View your available and used coupons
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoadingCoupons ? (
                    <div className="flex justify-center py-12">
                      <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    </div>
                  ) : coupons.length === 0 ? (
                    <div className="text-center py-12">
                      <Tag className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
                      <p className="text-muted-foreground">No coupons available</p>
                      <p className="text-sm text-muted-foreground mt-2">
                        Coupons will appear here when assigned to your account
                      </p>
                    </div>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                      {coupons.map((uc) => {
                        const isExpired = uc.coupon.valid_until && new Date(uc.coupon.valid_until) < new Date();
                        const isAvailable = !uc.is_used && !isExpired;

                        return (
                          <Card 
                            key={uc.id} 
                            className={`relative overflow-hidden ${
                              isAvailable ? "border-primary/30 bg-primary/5" : "opacity-60"
                            }`}
                          >
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <Percent className="w-5 h-5 text-primary" />
                                    <span className="font-display font-bold text-lg">
                                      {uc.coupon.code}
                                    </span>
                                  </div>
                                  <p className="text-2xl font-bold text-primary">
                                    {uc.coupon.discount_type === "percentage" 
                                      ? `${uc.coupon.discount_value}% OFF`
                                      : `LKR ${uc.coupon.discount_value} OFF`
                                    }
                                  </p>
                                </div>
                                <Badge variant={isAvailable ? "default" : "secondary"}>
                                  {uc.is_used ? "Used" : isExpired ? "Expired" : "Available"}
                                </Badge>
                              </div>
                              
                              <Separator className="my-3" />
                              
                              <div className="flex items-center justify-between text-sm text-muted-foreground">
                                <div className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  {uc.coupon.valid_until 
                                    ? `Expires ${new Date(uc.coupon.valid_until).toLocaleDateString()}`
                                    : "No expiry"
                                  }
                                </div>
                                {uc.is_used && uc.used_at && (
                                  <span>Used on {new Date(uc.used_at).toLocaleDateString()}</span>
                                )}
                              </div>
                            </CardContent>
                            
                            {/* Decorative dashed border */}
                            <div className="absolute left-0 top-1/2 w-4 h-4 -translate-x-1/2 -translate-y-1/2 bg-background rounded-full" />
                            <div className="absolute right-0 top-1/2 w-4 h-4 translate-x-1/2 -translate-y-1/2 bg-background rounded-full" />
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Profile Tab */}
            <TabsContent value="profile" className="space-y-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Profile Information</CardTitle>
                    <CardDescription>
                      Your personal details and delivery address
                    </CardDescription>
                  </div>
                  {!isEditing ? (
                    <Button variant="outline" onClick={() => setIsEditing(true)}>
                      <Edit2 className="w-4 h-4 mr-2" />
                      Edit
                    </Button>
                  ) : (
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => setIsEditing(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleSaveProfile} disabled={isSaving}>
                        {isSaving ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Save className="w-4 h-4 mr-2" />
                        )}
                        Save
                      </Button>
                    </div>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="first_name">First Name</Label>
                      {isEditing ? (
                        <Input
                          id="first_name"
                          value={editForm.first_name}
                          onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })}
                        />
                      ) : (
                        <p className="text-lg">{profile?.first_name || "-"}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="last_name">Last Name</Label>
                      {isEditing ? (
                        <Input
                          id="last_name"
                          value={editForm.last_name}
                          onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })}
                        />
                      ) : (
                        <p className="text-lg">{profile?.last_name || "-"}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone</Label>
                      {isEditing ? (
                        <Input
                          id="phone"
                          value={editForm.phone}
                          onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                        />
                      ) : (
                        <p className="text-lg">{profile?.phone || "-"}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <p className="text-lg text-muted-foreground">{profile?.email || user?.email || "-"}</p>
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="address">Delivery Address</Label>
                      {isEditing ? (
                        <Input
                          id="address"
                          value={editForm.address}
                          onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                        />
                      ) : (
                        <p className="text-lg">{profile?.address || "-"}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Payment Slip Upload Dialog */}
      <Dialog open={!!uploadingOrderId} onOpenChange={() => {
        setUploadingOrderId(null);
        setPaymentSlip(null);
        if (paymentSlipPreview) {
          URL.revokeObjectURL(paymentSlipPreview);
          setPaymentSlipPreview(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Payment Slip</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {uploadingOrderId && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium">
                  Order #{uploadingOrderId.slice(0, 8)}
                </p>
                <p className="text-lg font-bold text-primary">
                  {orders.find(o => o.id === uploadingOrderId)?.total_price 
                    ? formatPrice(orders.find(o => o.id === uploadingOrderId)!.total_price!)
                    : "N/A"
                  }
                </p>
              </div>
            )}

            {paymentSlip ? (
              <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/50">
                {paymentSlipPreview ? (
                  <img 
                    src={paymentSlipPreview} 
                    alt="Payment slip preview" 
                    className="w-16 h-16 object-cover rounded"
                  />
                ) : (
                  <div className="w-16 h-16 bg-primary/10 rounded flex items-center justify-center">
                    <FileImage className="w-8 h-8 text-primary" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{paymentSlip.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(paymentSlip.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => {
                    setPaymentSlip(null);
                    if (paymentSlipPreview) {
                      URL.revokeObjectURL(paymentSlipPreview);
                      setPaymentSlipPreview(null);
                    }
                  }}
                  className="text-destructive hover:text-destructive"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="border-2 border-dashed rounded-lg p-6 text-center">
                <input
                  type="file"
                  id="paymentSlipUpload"
                  accept="image/*,application/pdf"
                  onChange={handlePaymentSlipChange}
                  className="hidden"
                />
                <label htmlFor="paymentSlipUpload" className="cursor-pointer">
                  <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm font-medium">Click to upload payment slip</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    PNG, JPG, or PDF up to 10MB
                  </p>
                </label>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setUploadingOrderId(null);
              setPaymentSlip(null);
              if (paymentSlipPreview) {
                URL.revokeObjectURL(paymentSlipPreview);
                setPaymentSlipPreview(null);
              }
            }}>
              Cancel
            </Button>
            <Button 
              onClick={handleUploadPaymentSlip}
              disabled={!paymentSlip || isUploadingSlip}
            >
              {isUploadingSlip ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 mr-2" />
              )}
              Upload & Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <BankDetailsDialog open={showBankDetails} onOpenChange={setShowBankDetails} />
      
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
                  profile={profile}
                  appliedCoupon={invoiceOrder.applied_coupon}
                  status={invoiceOrder.status}
                />
              </ScrollArea>
              
              <DialogFooter className="px-6 pb-6 border-t pt-4">
                <Button variant="outline" onClick={() => setInvoiceOrder(null)}>
                  Close
                </Button>
                <Button onClick={handleDownloadInvoice} className="gap-2">
                  <Download className="w-4 h-4" />
                  Download PDF
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
