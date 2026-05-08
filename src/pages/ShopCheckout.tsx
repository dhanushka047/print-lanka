import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, Loader2, CheckCircle, AlertCircle, Building2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { BankDetailsDialog } from "@/components/BankDetailsDialog";

interface CartItem {
  id: string;
  quantity: number;
  product_id: string;
  shop_products: {
    id: string;
    name: string;
    price: number;
    stock: number;
  };
}

export default function ShopCheckout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [shippingAddress, setShippingAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentSlip, setPaymentSlip] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showBankDetails, setShowBankDetails] = useState(false);

  // Get user profile for pre-fill
  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (profile) {
      setShippingAddress(profile.address || "");
      setPhone(profile.phone || "");
    }
  }, [profile]);

  const { data: cartItems, isLoading } = useQuery({
    queryKey: ["cart-items", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shop_cart_items")
        .select(`
          id,
          quantity,
          product_id,
          shop_products (id, name, price, stock)
        `)
        .eq("user_id", user!.id);
      if (error) throw error;
      return data as CartItem[];
    },
    enabled: !!user,
  });

  const { data: shippingConfig } = useQuery({
    queryKey: ["shop-shipping-config"],
    queryFn: async () => {
      const { data } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "shop_shipping_config")
        .maybeSingle();
      return (data?.value as { shipping_cost: number }) || { shipping_cost: 350 };
    },
  });

  const subtotal = cartItems?.reduce(
    (sum, item) => sum + item.shop_products.price * item.quantity,
    0
  ) || 0;
  const shippingCost = shippingConfig?.shipping_cost || 350;
  const total = subtotal + shippingCost;

  const placeOrder = async () => {
    if (!user || !cartItems || cartItems.length === 0) return;

    if (!shippingAddress.trim() || !phone.trim()) {
      toast({ title: "Error", description: "Please fill in shipping address and phone", variant: "destructive" });
      return;
    }

    if (!paymentSlip || paymentSlip.size === 0) {
      toast({ title: "Payment slip required", description: "Please upload your bank transfer payment slip to place order", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);

    let uploadedSlipPath: string | null = null;

    try {
      // STEP 1: Upload payment slip FIRST. Order is only created if upload succeeds.
      // This prevents empty/slip-less orders on the VPS when storage upload fails.
      const fileExt = paymentSlip.name.split(".").pop();
      const tempPath = `${user.id}/pending_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("payment-slips")
        .upload(tempPath, paymentSlip, { upsert: false });

      if (uploadError) {
        const m = (uploadError.message || "").toLowerCase();
        if (m.includes("failed to fetch") || m.includes("networkerror")) {
          throw new Error("Payment slip upload is blocked or the storage server is unreachable. Your order was NOT placed. This is usually a storage CORS/server configuration issue on the VPS.");
        }
        throw new Error(`Failed to upload payment slip: ${uploadError.message}`);
      }
      uploadedSlipPath = tempPath;

      // STEP 2: Create the order
      const { data: order, error: orderError } = await supabase
        .from("shop_orders")
        .insert({
          user_id: user.id,
          subtotal,
          shipping_cost: shippingCost,
          total_price: total,
          shipping_address: shippingAddress,
          phone,
          notes: notes || null,
          status: "payment_submitted",
        })
        .select()
        .single();

      if (orderError) throw new Error(`Failed to create order: ${orderError.message}`);

      // 3. Create order items
      const orderItems = cartItems.map((item) => ({
        order_id: order.id,
        product_id: item.product_id,
        product_name: item.shop_products.name,
        quantity: item.quantity,
        price_at_purchase: item.shop_products.price,
      }));

      const { error: itemsError } = await supabase
        .from("shop_order_items")
        .insert(orderItems);

      if (itemsError) throw new Error(`Failed to save order items: ${itemsError.message}`);

      // 4. Create payment slip record (file already uploaded)
      const { error: slipError } = await supabase
        .from("shop_payment_slips")
        .insert({
          order_id: order.id,
          user_id: user.id,
          file_path: uploadedSlipPath,
          file_name: paymentSlip.name,
        });

      if (slipError) throw new Error(`Failed to save payment slip record: ${slipError.message}`);

      // 5. Clear cart
      await supabase
        .from("shop_cart_items")
        .delete()
        .eq("user_id", user.id);

      // 6. Update product stock
      for (const item of cartItems) {
        await supabase
          .from("shop_products")
          .update({ stock: item.shop_products.stock - item.quantity })
          .eq("id", item.product_id);
      }

      queryClient.invalidateQueries({ queryKey: ["cart-items"] });
      queryClient.invalidateQueries({ queryKey: ["cart-count"] });

      // Send notifications (admin + thank you to user)
      try {
        await supabase.functions.invoke("send-order-notification", {
          body: {
            order_id: order.id,
            order_type: "shop",
            notification_type: "new_order",
          },
        });
        await supabase.functions.invoke("send-order-notification", {
          body: {
            order_id: order.id,
            order_type: "shop",
            notification_type: "thank_you",
          },
        });
      } catch (notifyError) {
        console.error("Notification error:", notifyError);
      }

      toast({
        title: "Order placed successfully!",
        description: "Your payment is being verified. You'll receive an SMS notification once approved.",
      });

      navigate("/dashboard?tab=shop-orders");
    } catch (error: any) {
      console.error("Order error:", error);
      // Roll back uploaded slip if order failed
      if (uploadedSlipPath) {
        try { await supabase.storage.from("payment-slips").remove([uploadedSlipPath]); } catch {}
      }
      const raw = (error?.message || "").toString();
      const lower = raw.toLowerCase();
      let friendly = raw || "Failed to place order. Please try again.";
      if (lower.includes("cors") || lower.includes("upload is blocked")) {
        friendly = "Payment slip upload is blocked by the storage server configuration. Your order was NOT placed. Please contact support or try again after the VPS CORS fix is applied.";
      } else if (lower.includes("failed to fetch") || lower.includes("networkerror") || lower.includes("network request failed")) {
        friendly = "Storage server is offline, unreachable, or blocking uploads. Your order was NOT placed. Please try again later.";
      } else if (lower.includes("payload too large") || lower.includes("413")) {
        friendly = "Payment slip file is too large. Please upload a smaller file.";
      } else if (lower.includes("permission") || lower.includes("rls")) {
        friendly = "You are not authorized to place this order. Please log in again.";
      }
      toast({ title: "Error", description: friendly, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user) {
    navigate("/login");
    return null;
  }

  if (isLoading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        </div>
      </Layout>
    );
  }

  if (!cartItems || cartItems.length === 0) {
    navigate("/shop/cart");
    return null;
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <h1 className="font-display text-3xl font-bold mb-8">Checkout</h1>

        <div className="grid lg:grid-cols-5 gap-8">
          {/* Left - Form */}
          <div className="lg:col-span-3 space-y-6">
            {/* Shipping Info */}
            <Card>
              <CardHeader>
                <CardTitle>Shipping Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="phone">Phone Number *</Label>
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="07XXXXXXXX"
                  />
                </div>
                <div>
                  <Label htmlFor="address">Shipping Address *</Label>
                  <Textarea
                    id="address"
                    value={shippingAddress}
                    onChange={(e) => setShippingAddress(e.target.value)}
                    placeholder="Enter your full shipping address"
                    rows={3}
                  />
                </div>
                <div>
                  <Label htmlFor="notes">Order Notes (Optional)</Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Any special instructions..."
                    rows={2}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Payment */}
            <Card>
              <CardHeader>
                <CardTitle>Payment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert>
                  <AlertCircle className="w-4 h-4" />
                  <AlertDescription>
                    Bank transfer is required to complete your order. Upload your payment slip after making the transfer.
                  </AlertDescription>
                </Alert>

                <Button variant="outline" onClick={() => setShowBankDetails(true)} className="w-full">
                  <Building2 className="w-4 h-4 mr-2" />
                  View Bank Details
                </Button>

                <div className="space-y-2">
                  <Label>Upload Payment Slip *</Label>
                  <div className="border-2 border-dashed rounded-lg p-6 text-center">
                    {paymentSlip ? (
                      <div className="flex items-center justify-center gap-2">
                        <CheckCircle className="w-5 h-5 text-green-500" />
                        <span className="text-sm">{paymentSlip.name}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPaymentSlip(null)}
                        >
                          Remove
                        </Button>
                      </div>
                    ) : (
                      <label className="cursor-pointer">
                        <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">
                          Click to upload payment slip (PDF, JPG, PNG)
                        </p>
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          className="hidden"
                          onChange={(e) => setPaymentSlip(e.target.files?.[0] || null)}
                        />
                      </label>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right - Summary */}
          <div className="lg:col-span-2">
            <Card className="sticky top-4">
              <CardHeader>
                <CardTitle>Order Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {cartItems.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span>
                      {item.shop_products.name} × {item.quantity}
                    </span>
                    <span>LKR {(item.shop_products.price * item.quantity).toLocaleString()}</span>
                  </div>
                ))}
                <Separator />
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>LKR {subtotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Shipping</span>
                  <span>LKR {shippingCost.toLocaleString()}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-bold text-lg">
                  <span>Total</span>
                  <span>LKR {total.toLocaleString()}</span>
                </div>

                <Button
                  className="w-full"
                  size="lg"
                  onClick={placeOrder}
                  disabled={isSubmitting || !paymentSlip}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Placing Order...
                    </>
                  ) : (
                    "Place Order"
                  )}
                </Button>

                {!paymentSlip && (
                  <p className="text-xs text-center text-muted-foreground">
                    Upload payment slip to enable order placement
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <BankDetailsDialog open={showBankDetails} onOpenChange={setShowBankDetails} />
    </Layout>
  );
}
