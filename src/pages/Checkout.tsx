import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { 
  Box, Upload, Loader2, CheckCircle, ChevronRight, 
  Percent, AlertCircle, CalendarIcon, Tag, Check, Building2
} from "lucide-react";
import { formatPrice, MATERIALS, QUALITY_PRESETS } from "@/lib/constants";
import { toast } from "sonner";
import { format, addDays } from "date-fns";
import { cn } from "@/lib/utils";
import { getOrderData, clearOrderData } from "@/lib/orderStore";
import { BankDetailsDialog } from "@/components/BankDetailsDialog";

interface ModelConfig {
  material: string;
  quality: string;
  color: string;
  infill: number;
  quantity: number;
  notes: string;
}

interface UploadedModel {
  file: File;
  name: string;
  config: ModelConfig;
}

interface CouponData {
  user_coupon_id: string;
  code: string;
  discount_type: string;
  discount_value: number;
}

interface UserCoupon {
  id: string;
  is_used: boolean;
  coupon: {
    code: string;
    discount_type: string;
    discount_value: number;
    valid_until: string | null;
  };
}

export default function Checkout() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<number, number>>({});
  const [orderSubmitted, setOrderSubmitted] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState<Date | undefined>(
    addDays(new Date(), 7)
  );
  const [userCoupons, setUserCoupons] = useState<UserCoupon[]>([]);
  const [selectedCouponId, setSelectedCouponId] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);
  const [showBankDetails, setShowBankDetails] = useState(false);
  const [adminPhone, setAdminPhone] = useState("0717367497");

  // Get order data from memory store
  const orderData = getOrderData();
  const models: UploadedModel[] = orderData?.models || [];
  const preSelectedCoupon: CouponData | null = orderData?.coupon || null;

  // Fetch user's available coupons (only unused ones with valid expiration)
  useEffect(() => {
    const fetchUserCoupons = async () => {
      if (!user) return;
      
      const { data, error } = await supabase
        .from("user_coupons")
        .select(`
          id,
          is_used,
          use_count,
          coupon:coupons (
            code,
            discount_type,
            discount_value,
            valid_until,
            uses_per_user
          )
        `)
        .eq("user_id", user.id)
        .eq("is_used", false);

      if (!error && data) {
        // Filter out coupons that have been fully used or are expired
        const validCoupons = data.filter((uc: any) => {
          // Skip if coupon data is missing
          if (!uc.coupon) return false;
          
          // Check if coupon is expired
          if (uc.coupon.valid_until && new Date(uc.coupon.valid_until) < new Date()) {
            return false;
          }
          
          // Check if user has already used all their allowed uses
          const usesPerUser = uc.coupon.uses_per_user || 1;
          const useCount = uc.use_count || 0;
          if (useCount >= usesPerUser) {
            return false;
          }
          
          return true;
        });

        const mappedCoupons = validCoupons.map((uc: any) => ({
          id: uc.id,
          is_used: uc.is_used,
          coupon: uc.coupon
        }));
        setUserCoupons(mappedCoupons);
        
        // Pre-select coupon if passed from upload page (only if it's valid)
        if (preSelectedCoupon) {
          const isValidPreselected = mappedCoupons.some(c => c.id === preSelectedCoupon.user_coupon_id);
          if (isValidPreselected) {
            setSelectedCouponId(preSelectedCoupon.user_coupon_id);
          }
        }
      }
    };

    fetchUserCoupons();
  }, [user, preSelectedCoupon]);

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
    if (!user) {
      navigate("/login", { state: { redirectToCheckout: true } });
    }
  }, [user, navigate]);

  useEffect(() => {
    if (models.length === 0 && !orderSubmitted) {
      navigate("/");
    }
  }, [models.length, navigate, orderSubmitted]);

  // Get selected coupon data
  const selectedCoupon = selectedCouponId 
    ? userCoupons.find(uc => uc.id === selectedCouponId)
    : null;

  const handleSubmitOrder = async () => {
    if (!user || models.length === 0) return;

    // Validate all files exist before doing anything
    for (let i = 0; i < models.length; i++) {
      if (!models[i].file || models[i].file.size === 0) {
        toast.error(`Model "${models[i].name}" file is missing or empty. Please re-upload.`);
        return;
      }
    }

    setIsSubmitting(true);

    try {
      // STEP 1: Upload ALL files to storage FIRST. Only proceed to create order
      // if every file uploaded successfully. This prevents empty orders on the VPS
      // when storage upload silently fails.
      const tempOrderRef = `${user.id}/pending_${Date.now()}`;
      const uploadedPaths: { path: string; model: typeof models[0] }[] = [];

      for (let i = 0; i < models.length; i++) {
        const model = models[i];
        setUploadProgress((prev) => ({ ...prev, [i]: 0 }));

        const filePath = `${tempOrderRef}/${i}_${Date.now()}_${model.file.name}`;

        const { error: uploadError } = await supabase.storage
          .from("models")
          .upload(filePath, model.file, { upsert: false });

        if (uploadError) {
          // Clean up any already-uploaded files
          if (uploadedPaths.length > 0) {
            await supabase.storage.from("models").remove(uploadedPaths.map(u => u.path));
          }
          const msg = uploadError.message || "Unknown error";
          if (msg.toLowerCase().includes("failed to fetch") || msg.toLowerCase().includes("networkerror")) {
            throw new Error(`Server offline or network error while uploading "${model.name}". Please check your connection and try again.`);
          }
          throw new Error(`Failed to upload "${model.name}": ${msg}`);
        }

        uploadedPaths.push({ path: filePath, model });
        setUploadProgress((prev) => ({ ...prev, [i]: 100 }));
      }

      // STEP 2: Now that all files are uploaded, create the order
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          user_id: user.id,
          status: "pending_review",
          notes: [
            selectedCoupon ? `Coupon: ${selectedCoupon.coupon.code}` : null,
            expectedDeliveryDate ? `Expected delivery: ${format(expectedDeliveryDate, 'PPP')}` : null
          ].filter(Boolean).join(' | ') || null,
        })
        .select()
        .single();

      if (orderError) {
        // Clean up uploaded files since the order failed
        await supabase.storage.from("models").remove(uploadedPaths.map(u => u.path));
        throw new Error(`Failed to create order: ${orderError.message}`);
      }

      // STEP 3: Create order items referencing the uploaded file paths
      const items = uploadedPaths.map(({ path, model }) => ({
        order_id: order.id,
        file_name: model.file.name,
        file_path: path,
        file_size: model.file.size,
        material: model.config.material as any,
        quality: model.config.quality as any,
        color: model.config.color,
        infill_percentage: model.config.infill,
        quantity: model.config.quantity,
        notes: model.config.notes || null,
      }));

      const { error: itemsError } = await supabase.from("order_items").insert(items);
      if (itemsError) {
        throw new Error(`Failed to save order items: ${itemsError.message}`);
      }

      // 3. Mark coupon as used if applicable
      if (selectedCoupon) {
        await supabase
          .from("user_coupons")
          .update({
            is_used: true,
            used_at: new Date().toISOString(),
            used_on_order_id: order.id,
            use_count: 1,
          })
          .eq("id", selectedCoupon.id);
      }

      // Clear order data from memory
      clearOrderData();
      
      // Notify admins about new order
      try {
        await supabase.functions.invoke("send-sms", {
          body: {
            phone: adminPhone,
            message: `New order #${order.id.slice(0, 8)} received from ${profile?.first_name || 'Customer'}! ${models.length} item(s). Please review and price.`,
            order_id: order.id,
            user_id: user.id,
          },
        });
      } catch (smsError) {
        console.error("Failed to send admin notification:", smsError);
        // Don't fail the order if SMS fails
      }
      
      setOrderId(order.id);
      setOrderSubmitted(true);
      toast.success("Order submitted successfully!");
    } catch (error: any) {
      console.error("Order submission error:", error);
      const raw = (error?.message || "").toString();
      const lower = raw.toLowerCase();
      let friendly = raw || "Failed to submit order";
      if (lower.includes("failed to fetch") || lower.includes("networkerror") || lower.includes("network request failed")) {
        friendly = "Server is offline or unreachable. Your order was NOT submitted. Please check your internet and try again.";
      } else if (lower.includes("payload too large") || lower.includes("413")) {
        friendly = "One of your model files is too large to upload. Please use a smaller file.";
      } else if (lower.includes("permission") || lower.includes("rls") || lower.includes("not authorized")) {
        friendly = "You are not authorized to submit this order. Please log in again.";
      }
      toast.error(friendly);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (orderSubmitted && orderId) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center bg-background py-12">
          <Card className="max-w-md w-full mx-4">
            <CardContent className="pt-8 text-center">
              <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-success" />
              </div>
              <h2 className="font-display text-2xl font-bold mb-2">Order Submitted!</h2>
              <p className="text-muted-foreground mb-4">
                Your order has been received. We'll review and price your items soon.
              </p>
              <p className="text-sm font-mono bg-muted p-2 rounded mb-6">
                Order ID: #{orderId.slice(0, 8)}
              </p>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => navigate("/")} className="flex-1">
                  Back Home
                </Button>
                <Button onClick={() => navigate("/dashboard")} className="flex-1 bg-primary-gradient">
                  View Orders
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  // Minimum date is 3 days from now
  const minDeliveryDate = addDays(new Date(), 3);

  return (
    <Layout>
      <div className="min-h-screen bg-background py-8">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="mb-8">
            <h1 className="font-display text-3xl font-bold">Checkout</h1>
            <p className="text-muted-foreground">Review your order and submit</p>
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            {/* Order Items */}
            <div className="lg:col-span-2 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Box className="w-5 h-5" />
                    Order Items ({models.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {models.map((model, index) => {
                    const progress = uploadProgress[index];
                    const material = MATERIALS[model.config.material as keyof typeof MATERIALS];
                    const quality = QUALITY_PRESETS[model.config.quality as keyof typeof QUALITY_PRESETS];

                    return (
                      <div
                        key={index}
                        className="flex items-start gap-4 p-4 rounded-lg border bg-card"
                      >
                        <div
                          className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: model.config.color }}
                        >
                          {progress !== undefined ? (
                            progress === 100 ? (
                              <CheckCircle className="w-6 h-6 text-white" />
                            ) : (
                              <Loader2 className="w-6 h-6 text-white animate-spin" />
                            )
                          ) : (
                            <Box className="w-6 h-6 text-white mix-blend-difference" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{model.name}</p>
                          <div className="flex flex-wrap gap-2 mt-1 text-sm text-muted-foreground">
                            <span>{material?.name || model.config.material}</span>
                            <span>•</span>
                            <span>{quality?.name || model.config.quality}</span>
                            <span>•</span>
                            <span>{model.config.infill}% infill</span>
                          </div>
                          {model.config.notes && (
                            <p className="text-sm text-muted-foreground mt-1 italic">
                              "{model.config.notes}"
                            </p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <span className="font-semibold">×{model.config.quantity}</span>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              {/* Expected Delivery Date */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CalendarIcon className="w-5 h-5" />
                    Expected Delivery Date
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">
                      When would you like to receive your order?
                    </Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !expectedDeliveryDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {expectedDeliveryDate ? format(expectedDeliveryDate, "PPP") : <span>Pick a date</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={expectedDeliveryDate}
                          onSelect={setExpectedDeliveryDate}
                          disabled={(date) => date < minDeliveryDate}
                          initialFocus
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                    <p className="text-xs text-muted-foreground">
                      Minimum 3 days from today. Actual delivery date may vary based on complexity.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Coupon Selection */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Tag className="w-5 h-5" />
                    Apply Coupon
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Coupon code input */}
                    <div className="space-y-2">
                      <Label className="text-sm">Have a coupon code?</Label>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Enter coupon code"
                          value={couponCode}
                          onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                          className="flex-1"
                        />
                        <Button
                          variant="secondary"
                          disabled={!couponCode.trim() || isApplyingCoupon}
                          onClick={async () => {
                            if (!user || !couponCode.trim()) return;
                            setIsApplyingCoupon(true);
                            try {
                              // First check if coupon exists and is valid
                              const { data: coupon, error: couponError } = await supabase
                                .from("coupons")
                                .select("*")
                                .eq("code", couponCode.trim())
                                .eq("is_active", true)
                                .single();

                              if (couponError || !coupon) {
                                toast.error("Invalid or expired coupon code");
                                return;
                              }

                              // Check if already claimed
                              const { data: existingClaim } = await supabase
                                .from("user_coupons")
                                .select("id")
                                .eq("user_id", user.id)
                                .eq("coupon_id", coupon.id)
                                .single();

                              if (existingClaim) {
                                toast.error("You have already claimed this coupon");
                                return;
                              }

                              // Claim the coupon
                              const { data: newUserCoupon, error: claimError } = await supabase
                                .from("user_coupons")
                                .insert({
                                  user_id: user.id,
                                  coupon_id: coupon.id,
                                })
                                .select()
                                .single();

                              if (claimError) {
                                toast.error("Failed to apply coupon");
                                return;
                              }

                              // Add to user coupons and select it
                              const newCoupon: UserCoupon = {
                                id: newUserCoupon.id,
                                is_used: false,
                                coupon: {
                                  code: coupon.code,
                                  discount_type: coupon.discount_type,
                                  discount_value: coupon.discount_value,
                                  valid_until: coupon.valid_until,
                                }
                              };
                              setUserCoupons([...userCoupons, newCoupon]);
                              setSelectedCouponId(newUserCoupon.id);
                              setCouponCode("");
                              toast.success("Coupon applied successfully!");
                            } catch (error) {
                              toast.error("Failed to apply coupon");
                            } finally {
                              setIsApplyingCoupon(false);
                            }
                          }}
                        >
                          {isApplyingCoupon ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            "Apply"
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Available coupons from wallet */}
                    {userCoupons.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">
                          Or select from your wallet:
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {userCoupons.map((uc) => (
                            <button
                              key={uc.id}
                              onClick={() => setSelectedCouponId(selectedCouponId === uc.id ? null : uc.id)}
                              className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
                                selectedCouponId === uc.id
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "bg-secondary border-border hover:border-primary/50"
                              }`}
                            >
                              {selectedCouponId === uc.id && <Check className="w-4 h-4" />}
                              <Percent className="w-3 h-3" />
                              <span className="font-medium text-sm">{uc.coupon.code}</span>
                              <span className="text-xs opacity-80">
                                {uc.coupon.discount_type === 'percentage' 
                                  ? `${uc.coupon.discount_value}% off` 
                                  : `LKR ${uc.coupon.discount_value} off`}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Info about payment */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3 p-4 bg-muted rounded-lg">
                    <AlertCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium text-sm">Payment After Pricing</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Once we review and price your order, you'll receive an SMS notification. 
                        You can then upload your bank transfer slip from your dashboard.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowBankDetails(true)}
                    >
                      <Building2 className="w-4 h-4 mr-1" />
                      View Bank Details
                    </Button>
                  </div>
                </CardContent>
              </Card>
              
              <BankDetailsDialog open={showBankDetails} onOpenChange={setShowBankDetails} />

              {/* Delivery Info */}
              <Card>
                <CardHeader>
                  <CardTitle>Delivery Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <p className="font-medium">
                      {profile?.first_name} {profile?.last_name}
                    </p>
                    <p className="text-muted-foreground">{profile?.phone}</p>
                    <p className="text-muted-foreground">{profile?.address}</p>
                  </div>
                  <Button 
                    variant="link" 
                    className="px-0 mt-2"
                    onClick={() => navigate("/dashboard?tab=profile")}
                  >
                    Edit delivery address
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Order Summary */}
            <div className="space-y-4">
              <Card className="sticky top-4">
                <CardHeader>
                  <CardTitle>Order Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Items</span>
                    <span>{models.length} model(s)</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Quantity</span>
                    <span>{models.reduce((sum, m) => sum + m.config.quantity, 0)} piece(s)</span>
                  </div>

                  {expectedDeliveryDate && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Expected by</span>
                      <span>{format(expectedDeliveryDate, "MMM d, yyyy")}</span>
                    </div>
                  )}

                  {selectedCoupon && (
                    <>
                      <Separator />
                      <div className="flex items-center justify-between text-sm bg-success/10 p-2 rounded">
                        <div className="flex items-center gap-2 text-success">
                          <Percent className="w-4 h-4" />
                          <span className="font-medium">{selectedCoupon.coupon.code}</span>
                        </div>
                        <span className="text-success font-medium">
                          {selectedCoupon.coupon.discount_type === "percentage"
                            ? `-${selectedCoupon.coupon.discount_value}%`
                            : `-${formatPrice(selectedCoupon.coupon.discount_value)}`}
                        </span>
                      </div>
                    </>
                  )}


                  <Separator />

                  <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                    <AlertCircle className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                    <p className="text-sm text-muted-foreground">
                      Price will be calculated after we review your models
                    </p>
                  </div>

                  <Button
                    size="lg"
                    disabled={isSubmitting || models.length === 0}
                    onClick={handleSubmitOrder}
                    className="w-full bg-primary-gradient shadow-glow"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        Submit Order
                        <ChevronRight className="w-4 h-4 ml-2" />
                      </>
                    )}
                  </Button>

                  <p className="text-xs text-center text-muted-foreground">
                    By submitting, you agree to our terms of service
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
