import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Invoice } from "@/components/Invoice";
import { Button } from "@/components/ui/button";
import { Loader2, Download, Printer, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export default function PublicInvoice() {
  const { orderId } = useParams<{ orderId: string }>();
  const [invoiceData, setInvoiceData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const invoiceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (orderId) {
      fetchInvoice();
    }
  }, [orderId]);

  const fetchInvoice = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_public_invoice", {
        p_order_id: orderId,
      });

      if (error) throw error;
      if (!data) throw new Error("Invoice not found");

      setInvoiceData(data);
    } catch (error: any) {
      console.error("Failed to load invoice:", error);
      toast.error(error.message || "Failed to load invoice");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadInvoice = async () => {
    if (!invoiceRef.current || !invoiceData) return;
    toast.loading("Generating PDF...", { id: "pdf-generation" });

    try {
      const html2canvas = (await import("html2canvas")).default;
      const jsPDF = (await import("jspdf")).default;

      const canvas = await html2canvas(invoiceRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const imgWidth = 210; // A4 width in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);
      pdf.save(`Invoice-${orderId?.slice(0, 8).toUpperCase()}.pdf`);

      toast.success("Invoice downloaded!", { id: "pdf-generation" });
    } catch (error) {
      console.error("PDF generation failed:", error);
      toast.error("Failed to generate PDF", { id: "pdf-generation" });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground text-sm">Loading Invoice...</p>
        </div>
      </div>
    );
  }

  if (!invoiceData || !invoiceData.order) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-6">
        <div className="text-center bg-white p-8 rounded-lg shadow max-w-md w-full">
          <h2 className="text-xl font-bold text-destructive mb-2">Invoice Not Found</h2>
          <p className="text-muted-foreground text-sm mb-6">
            The requested invoice does not exist or you do not have permission to view it.
          </p>
          <Button asChild>
            <Link to="/">Go to Home</Link>
          </Button>
        </div>
      </div>
    );
  }

  const { order, items, profile, coupon } = invoiceData;

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4 flex flex-col items-center">
      {/* Top Controls Bar */}
      <div className="max-w-[210mm] w-full mb-6 flex justify-between items-center bg-white p-4 rounded-lg shadow-sm">
        <Button variant="ghost" asChild className="gap-2">
          <Link to="/">
            <ArrowLeft className="w-4 h-4" />
            Home
          </Link>
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()} className="gap-2">
            <Printer className="w-4 h-4" />
            Print
          </Button>
          <Button onClick={handleDownloadInvoice} className="gap-2">
            <Download className="w-4 h-4" />
            Download PDF
          </Button>
        </div>
      </div>

      {/* Invoice Sheet */}
      <div className="bg-white shadow-md rounded-lg overflow-hidden w-full max-w-[210mm]">
        <Invoice
          ref={invoiceRef}
          orderId={order.id}
          orderItems={items}
          totalPrice={order.total_price || 0}
          deliveryCharge={order.delivery_charge || 0}
          createdAt={order.created_at}
          paidAt={order.paid_at}
          trackingNumber={order.tracking_number}
          profile={profile}
          appliedCoupon={coupon}
          status={order.status}
          extraCharges={order.extra_charges}
        />
      </div>
    </div>
  );
}
