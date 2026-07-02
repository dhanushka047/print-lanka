import { useState, useEffect, forwardRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/constants";
import logo from "@/assets/logo.png";

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

interface AppliedCoupon {
  code: string;
  discount_type: string;
  discount_value: number;
}

interface Profile {
  first_name: string;
  last_name: string;
  phone: string;
  address: string;
  email?: string | null;
}

interface InvoiceProps {
  orderId: string;
  orderItems: OrderItem[];
  totalPrice: number;
  deliveryCharge: number;
  createdAt: string;
  paidAt?: string | null;
  trackingNumber?: string | null;
  profile: Profile | null;
  appliedCoupon?: AppliedCoupon | null;
  status: string;
  extraCharges?: { label: string; price: number }[] | null;
  adminDiscountValue?: number | null;
  adminDiscountType?: string | null;
}

interface InvoiceSettings {
  company_name: string;
  company_address: string;
  company_phone: string;
  company_email: string;
  footer_note: string;
}

interface BankDetail {
  id: string;
  bank_name: string;
  account_name: string;
  account_number: string;
  branch: string | null;
}

const defaultInvoiceSettings: InvoiceSettings = {
  company_name: "IO Builds",
  company_address: "532/1/E, Gonahena Road, Kadawatha",
  company_phone: "0717367497",
  company_email: "contact@iobuilds.lk",
  footer_note: "Thank you for your business!",
};

export const Invoice = forwardRef<HTMLDivElement, InvoiceProps>(
  (
    {
      orderId,
      orderItems,
      totalPrice,
      deliveryCharge,
      createdAt,
      paidAt,
      trackingNumber,
      profile,
      appliedCoupon,
      status,
      extraCharges,
      adminDiscountValue = 0,
      adminDiscountType = "amount",
    },
    ref
  ) => {
    const [settings, setSettings] = useState<InvoiceSettings>(defaultInvoiceSettings);
    const [bankDetails, setBankDetails] = useState<BankDetail[]>([]);

    useEffect(() => {
      const fetchSettings = async () => {
        const { data, error } = await supabase
          .from("system_settings")
          .select("value")
          .eq("key", "invoice_settings")
          .single();

        if (!error && data?.value && typeof data.value === "object") {
          setSettings({ ...defaultInvoiceSettings, ...(data.value as unknown as InvoiceSettings) });
        }
      };

      const fetchBankDetails = async () => {
        const { data, error } = await supabase
          .from("bank_details")
          .select("id, bank_name, account_name, account_number, branch")
          .eq("is_active", true)
          .order("created_at", { ascending: true });

        if (!error && data) {
          setBankDetails(data);
        }
      };

      fetchSettings();
      fetchBankDetails();
    }, []);

    // Calculate pricing breakdown
    const itemsTotal = orderItems.reduce((sum, item) => sum + (item.price || 0), 0);
    const extraTotal = Array.isArray(extraCharges)
      ? extraCharges.reduce((sum, c) => sum + (c.price || 0), 0)
      : 0;
    const subtotal = itemsTotal + deliveryCharge + extraTotal;
    const discount = appliedCoupon
      ? appliedCoupon.discount_type === "percentage"
        ? Math.round((subtotal * appliedCoupon.discount_value) / 100)
        : appliedCoupon.discount_value
      : 0;

    let adminDiscount = 0;
    if (adminDiscountValue && adminDiscountValue > 0) {
      adminDiscount = adminDiscountType === "percentage"
        ? Math.round((subtotal * adminDiscountValue) / 100)
        : adminDiscountValue;
    }

    const grandTotal = Math.max(0, subtotal - discount - adminDiscount);

    const isPaid = status === "payment_approved" || status === "in_production" || 
                   status === "ready_to_ship" || status === "shipped" || status === "completed";

    return (
      <div
        ref={ref}
        className="bg-white text-black p-8 max-w-[210mm] mx-auto"
        style={{ fontFamily: "Arial, sans-serif", fontSize: "12px" }}
      >
        {/* Header with Logo */}
        <div className="flex justify-between items-start mb-8 border-b-2 border-teal-500 pb-4">
          <div className="flex items-center gap-4">
            <img src={logo} alt="IO Builds" className="h-16 w-auto" />
            <div>
              <h1 className="text-2xl font-bold text-teal-600">{settings.company_name}</h1>
              <p className="text-gray-600 text-sm">{settings.company_address}</p>
              <p className="text-gray-600 text-sm">Phone: {settings.company_phone}</p>
              <p className="text-gray-600 text-sm">Email: {settings.company_email}</p>
            </div>
          </div>
          <div className="text-right">
            <h2 className="text-3xl font-bold text-gray-700">INVOICE</h2>
            <p className="text-gray-600 mt-2">
              <strong>Invoice No:</strong> #{orderId.slice(0, 8).toUpperCase()}
            </p>
            <p className="text-gray-600">
              <strong>Date:</strong> {new Date(createdAt).toLocaleDateString()}
            </p>
            {paidAt && (
              <p className="text-green-600">
                <strong>Paid:</strong> {new Date(paidAt).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>

        {/* Bill To */}
        <div className="grid grid-cols-2 gap-8 mb-8">
          <div>
            <h3 className="font-bold text-gray-700 border-b pb-1 mb-2">BILL TO</h3>
            {profile ? (
              <>
                <p className="font-semibold">{profile.first_name} {profile.last_name}</p>
                <p className="text-gray-600">{profile.address}</p>
                <p className="text-gray-600">Phone: {profile.phone}</p>
                {profile.email && <p className="text-gray-600">Email: {profile.email}</p>}
              </>
            ) : (
              <p className="text-gray-500">Customer details not available</p>
            )}
          </div>
          <div>
            <h3 className="font-bold text-gray-700 border-b pb-1 mb-2">ORDER DETAILS</h3>
            <p><strong>Order ID:</strong> {orderId}</p>
            <p><strong>Status:</strong> {status.replace(/_/g, " ").toUpperCase()}</p>
            {trackingNumber && <p><strong>Tracking:</strong> {trackingNumber}</p>}
          </div>
        </div>

        {/* Items Table */}
        <table className="w-full mb-6" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr className="bg-teal-500 text-white">
              <th className="py-2 px-3 text-left">#</th>
              <th className="py-2 px-3 text-left">Description</th>
              <th className="py-2 px-3 text-center">Qty</th>
              <th className="py-2 px-3 text-right">Weight</th>
              <th className="py-2 px-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {orderItems.map((item, index) => (
              <tr key={item.id} className={index % 2 === 0 ? "bg-gray-50" : "bg-white"}>
                <td className="py-2 px-3 border-b">{index + 1}</td>
                <td className="py-2 px-3 border-b">
                  <p className="font-medium">{item.file_name}</p>
                  <p className="text-xs text-gray-500">
                    {item.material.toUpperCase()} | {item.quality} | {item.infill_percentage || 20}% Infill | {item.color}
                  </p>
                </td>
                <td className="py-2 px-3 border-b text-center">{item.quantity}</td>
                <td className="py-2 px-3 border-b text-right">
                  {item.weight_grams ? `${item.weight_grams}g` : "-"}
                </td>
                <td className="py-2 px-3 border-b text-right font-medium">
                  {item.price ? formatPrice(item.price) : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end">
          <div className="w-72">
            <div className="flex justify-between py-1 border-b">
              <span>Items Total:</span>
              <span>{formatPrice(itemsTotal)}</span>
            </div>
            <div className="flex justify-between py-1 border-b">
              <span>Delivery Charge:</span>
              <span>{formatPrice(deliveryCharge)}</span>
            </div>
            {Array.isArray(extraCharges) && extraCharges.map((charge, idx) => (
              <div key={idx} className="flex justify-between py-1 border-b">
                <span>{charge.label || 'Extra Charge'}:</span>
                <span>{formatPrice(charge.price || 0)}</span>
              </div>
            ))}
            <div className="flex justify-between py-1 border-b font-medium">
              <span>Subtotal:</span>
              <span>{formatPrice(subtotal)}</span>
            </div>
            {appliedCoupon && discount > 0 && (
              <div className="flex justify-between py-1 border-b text-green-600">
                <span>Coupon ({appliedCoupon.code}):</span>
                <span>-{formatPrice(discount)}</span>
              </div>
            )}
            {adminDiscount > 0 && (
              <div className="flex justify-between py-1 border-b text-amber-600 font-medium">
                <span>Admin Discount:</span>
                <span>-{formatPrice(adminDiscount)}</span>
              </div>
            )}
            <div className="flex justify-between py-2 text-lg font-bold bg-teal-50 px-2 mt-2">
              <span>Grand Total:</span>
              <span className="text-teal-600">{formatPrice(grandTotal)}</span>
            </div>
          </div>
        </div>

        {/* Payment Status Badge */}
        <div className="mt-6 flex justify-center">
          {isPaid ? (
            <div className="inline-flex items-center gap-2 bg-green-100 text-green-700 px-6 py-2 rounded-full font-bold text-lg border-2 border-green-300">
              ✓ PAID
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 bg-yellow-100 text-yellow-700 px-6 py-2 rounded-full font-bold border-2 border-yellow-300">
              PENDING PAYMENT
            </div>
          )}
        </div>

        {/* Bank Details (if not paid) */}
        {!isPaid && bankDetails.length > 0 && (
          <div className="mt-6 p-4 bg-gray-50 rounded border">
            <h3 className="font-bold text-gray-700 mb-2">Bank Transfer Details</h3>
            <div className="space-y-3">
              {bankDetails.map((bank, index) => (
                <div key={bank.id} className="grid grid-cols-2 gap-2 text-sm">
                  {index > 0 && <div className="col-span-2 border-t pt-2"></div>}
                  <p><strong>Bank:</strong> {bank.bank_name}</p>
                  <p><strong>Branch:</strong> {bank.branch || "-"}</p>
                  <p><strong>Account Name:</strong> {bank.account_name}</p>
                  <p><strong>Account Number:</strong> {bank.account_number}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 pt-4 border-t text-center text-gray-500">
          <p>{settings.footer_note}</p>
          <p className="mt-2 text-xs">
            This is a computer-generated invoice. For queries, contact {settings.company_phone} or {settings.company_email}
          </p>
        </div>
      </div>
    );
  }
);

Invoice.displayName = "Invoice";

export default Invoice;
