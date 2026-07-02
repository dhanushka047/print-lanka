import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import Index from "./pages/Index";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import Pricing from "./pages/Pricing";
import Coupons from "./pages/Coupons";
import Gallery from "./pages/Gallery";
import Dashboard from "./pages/Dashboard";
import Checkout from "./pages/Checkout";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsConditions from "./pages/TermsConditions";
import RefundPolicy from "./pages/RefundPolicy";
import Shop from "./pages/Shop";
import ShopProduct from "./pages/ShopProduct";
import ShopCart from "./pages/ShopCart";
import ShopCheckout from "./pages/ShopCheckout";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminOrders from "./pages/admin/AdminOrders";
import AdminCoupons from "./pages/admin/AdminCoupons";
import AdminColors from "./pages/admin/AdminColors";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminSettings from "./pages/admin/AdminSettings";
import AdminBankDetails from "./pages/admin/AdminBankDetails";
import AdminGallery from "./pages/admin/AdminGallery";
import AdminShopProducts from "./pages/admin/AdminShopProducts";
import AdminShopOrders from "./pages/admin/AdminShopOrders";
import AdminShopSettings from "./pages/admin/AdminShopSettings";
import AdminCategories from "./pages/admin/AdminCategories";
import AdminSMSCampaigns from "./pages/admin/AdminSMSCampaigns";
import AdminBackup from "./pages/admin/AdminBackup";
import AdminFilaments from "./pages/admin/AdminFilaments";
import AdminPrinters from "./pages/admin/AdminPrinters";
import PublicInvoice from "./pages/PublicInvoice";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/coupons" element={<Coupons />} />
            <Route path="/gallery" element={<Gallery />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/terms-conditions" element={<TermsConditions />} />
            <Route path="/refund-policy" element={<RefundPolicy />} />
            <Route path="/invoice/:orderId" element={<PublicInvoice />} />
            
            {/* Shop Routes */}
            <Route path="/shop" element={<Shop />} />
            <Route path="/shop/product/:id" element={<ShopProduct />} />
            <Route path="/shop/cart" element={<ShopCart />} />
            <Route path="/shop/checkout" element={<ShopCheckout />} />
            
            {/* Admin Routes */}
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminDashboard />} />
              <Route path="orders" element={<AdminOrders />} />
              <Route path="coupons" element={<AdminCoupons />} />
              <Route path="colors" element={<AdminColors />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="settings" element={<AdminSettings />} />
              <Route path="bank-details" element={<AdminBankDetails />} />
              <Route path="gallery" element={<AdminGallery />} />
              <Route path="shop-products" element={<AdminShopProducts />} />
              <Route path="shop-categories" element={<AdminCategories />} />
              <Route path="shop-orders" element={<AdminShopOrders />} />
              <Route path="shop-settings" element={<AdminShopSettings />} />
              <Route path="sms-campaigns" element={<AdminSMSCampaigns />} />
              <Route path="backup" element={<AdminBackup />} />
              <Route path="filaments" element={<AdminFilaments />} />
              <Route path="printers" element={<AdminPrinters />} />
            </Route>
            
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
