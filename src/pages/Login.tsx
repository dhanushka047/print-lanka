import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { getOrderData } from "@/lib/orderStore";
import logo from "@/assets/logo.png";

export default function Login() {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const redirectToCheckout = location.state?.redirectToCheckout || getOrderData() !== null;

  // Format phone for display (local format)
  const formatPhoneDisplay = (value: string) => {
    // Remove all non-digits
    const digits = value.replace(/[^0-9]/g, "");
    // Limit to 10 digits
    return digits.slice(0, 10);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Format phone as email for Supabase auth
      const phoneDigits = phone.replace(/[^0-9]/g, "");

      // Try the new domain first (.app), then fall back to legacy (.local)
      // for accounts created before the self-hosted compatibility fix.
      const candidates = [
        `${phoneDigits}@iobuilds.app`,
        `${phoneDigits}@iobuilds.local`,
      ];

      let lastError: any = null;
      let signedIn = false;
      for (const email of candidates) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (!error) {
          signedIn = true;
          break;
        }
        lastError = error;
      }

      if (!signedIn) throw lastError;

      toast.success("Welcome back!");
      navigate(redirectToCheckout ? "/checkout" : "/dashboard");
    } catch (error: any) {
      const raw = (error?.message || "").toString();
      const lower = raw.toLowerCase();
      if (lower.includes("failed to fetch") || lower.includes("networkerror") || lower.includes("network request failed")) {
        toast.error("Server is offline or unreachable. Please check your connection and try again.");
      } else if (lower.includes("invalid login") || lower.includes("invalid credentials") || lower.includes("invalid_grant")) {
        toast.error("Incorrect phone number or password.");
      } else if (lower.includes("email not confirmed")) {
        toast.error("Account not confirmed yet. Please contact support.");
      } else if (lower.includes("rate") || lower.includes("too many")) {
        toast.error("Too many login attempts. Please wait and try again.");
      } else if (lower.includes("503") || lower.includes("502") || lower.includes("504") || lower.includes("unavailable")) {
        toast.error("Server is temporarily unavailable. Please try again shortly.");
      } else {
        toast.error(raw || "Failed to sign in");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Layout showFooter={false}>
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 bg-secondary/30">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <img src={logo} alt="IO Builds Logo" className="h-16 w-auto" />
            </div>
            <CardTitle className="font-display text-2xl">Welcome Back</CardTitle>
            <CardDescription>Sign in to your IO Builds account</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="0771234567"
                  value={phone}
                  onChange={(e) => setPhone(formatPhoneDisplay(e.target.value))}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Enter your phone number (e.g., 0771234567)
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link
                    to="/forgot-password"
                    className="text-xs text-primary hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full bg-primary-gradient" disabled={isLoading}>
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Sign In
              </Button>
            </form>
            <p className="text-center text-sm text-muted-foreground mt-4">
              Don't have an account?{" "}
              <Link to="/register" className="text-primary hover:underline font-medium">
                Register here
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
