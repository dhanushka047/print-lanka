import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, CheckCircle2, Phone, ArrowRight } from "lucide-react";
import { getOrderData } from "@/lib/orderStore";
import logo from "@/assets/logo.png";

type Step = 'phone' | 'otp' | 'details';

export default function Register() {
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [isVerified, setIsVerified] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    address: "",
    password: "",
    confirmPassword: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
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

  // Countdown timer for resend
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleSendOtp = async () => {
    const digits = phone.replace(/[^0-9]/g, "");
    if (!phone || digits.length < 9) {
      toast.error("Please enter a valid phone number (e.g., 0771234567)");
      return;
    }

    setIsSendingOtp(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-otp", {
        body: { phone, purpose: 'registration' },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success("OTP sent to your phone!");
      setStep('otp');
      setCountdown(60); // 60 second cooldown for resend
    } catch (error: any) {
      toast.error(error.message || "Failed to send OTP");
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otpCode.length !== 6) {
      toast.error("Please enter the 6-digit code");
      return;
    }

    setIsVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("verify-otp", {
        body: { phone, otp_code: otpCode },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setIsVerified(true);
      toast.success("Phone verified successfully!");
      
      // Short delay to show verified state
      setTimeout(() => {
        setStep('details');
      }, 1000);
    } catch (error: any) {
      toast.error(error.message || "Failed to verify OTP");
      setOtpCode("");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.password !== formData.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    if (formData.password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setIsLoading(true);

    try {
      const phoneDigits = phone.replace(/[^0-9]/g, "");
      // Use a valid-looking TLD so self-hosted Supabase GoTrue accepts it
      const email = `${phoneDigits}@iobuilds.app`;

      const { error } = await supabase.auth.signUp({
        email,
        password: formData.password,
        options: {
          emailRedirectTo: window.location.origin,
          data: {
            first_name: formData.firstName,
            last_name: formData.lastName,
            phone: phone,
            address: formData.address,
          },
        },
      });

      if (error) throw error;

      toast.success("Account created! You can now sign in.");
      navigate("/login", { state: { redirectToCheckout } });
    } catch (error: any) {
      toast.error(error.message || "Failed to create account");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Layout showFooter={false}>
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 bg-secondary/30 py-12">
        <Card className="w-full max-w-lg">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <img src={logo} alt="IO Builds Logo" className="h-16 w-auto" />
            </div>
            <CardTitle className="font-display text-2xl">Create Account</CardTitle>
            <CardDescription>
              {step === 'phone' && "Enter your phone number to get started"}
              {step === 'otp' && "Enter the verification code sent to your phone"}
              {step === 'details' && "Complete your registration"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Step 1: Phone Number */}
            {step === 'phone' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number *</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="0771234567"
                    value={phone}
                    onChange={(e) => setPhone(formatPhoneDisplay(e.target.value))}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter your phone number (e.g., 0771234567). We'll send a verification code.
                  </p>
                </div>
                <Button
                  type="button"
                  className="w-full bg-primary-gradient"
                  onClick={handleSendOtp}
                  disabled={isSendingOtp || !phone}
                >
                  {isSendingOtp ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Phone className="w-4 h-4 mr-2" />
                  )}
                  Get OTP
                </Button>
              </div>
            )}

            {/* Step 2: OTP Verification */}
            {step === 'otp' && (
              <div className="space-y-6">
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Phone className="w-4 h-4" />
                  <span>{phone}</span>
                  <Button
                    variant="link"
                    size="sm"
                    className="p-0 h-auto text-primary"
                    onClick={() => {
                      setStep('phone');
                      setOtpCode("");
                      setIsVerified(false);
                    }}
                  >
                    Change
                  </Button>
                </div>

                {isVerified ? (
                  <div className="flex flex-col items-center gap-3 py-4">
                    <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                      <CheckCircle2 className="w-8 h-8 text-green-600" />
                    </div>
                    <p className="font-medium text-green-600">Phone Verified!</p>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col items-center gap-4">
                      <InputOTP
                        maxLength={6}
                        value={otpCode}
                        onChange={setOtpCode}
                      >
                        <InputOTPGroup>
                          <InputOTPSlot index={0} />
                          <InputOTPSlot index={1} />
                          <InputOTPSlot index={2} />
                          <InputOTPSlot index={3} />
                          <InputOTPSlot index={4} />
                          <InputOTPSlot index={5} />
                        </InputOTPGroup>
                      </InputOTP>
                      <p className="text-xs text-muted-foreground">
                        Code expires in 5 minutes
                      </p>
                    </div>

                    <Button
                      type="button"
                      className="w-full bg-primary-gradient"
                      onClick={handleVerifyOtp}
                      disabled={isVerifying || otpCode.length !== 6}
                    >
                      {isVerifying ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                      )}
                      Verify
                    </Button>

                    <div className="text-center">
                      <Button
                        variant="link"
                        size="sm"
                        onClick={handleSendOtp}
                        disabled={countdown > 0 || isSendingOtp}
                        className="text-muted-foreground"
                      >
                        {countdown > 0
                          ? `Resend code in ${countdown}s`
                          : "Resend code"}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Step 3: Registration Details */}
            {step === 'details' && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg border border-green-200 mb-4">
                  <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                  <span className="text-sm text-green-700">
                    Phone verified: {phone}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name *</Label>
                    <Input
                      id="firstName"
                      name="firstName"
                      value={formData.firstName}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name *</Label>
                    <Input
                      id="lastName"
                      name="lastName"
                      value={formData.lastName}
                      onChange={handleChange}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email (Optional)</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Delivery Address *</Label>
                  <Textarea
                    id="address"
                    name="address"
                    placeholder="Full address for delivery"
                    value={formData.address}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="password">Password *</Label>
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      value={formData.password}
                      onChange={handleChange}
                      required
                      minLength={6}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm *</Label>
                    <Input
                      id="confirmPassword"
                      name="confirmPassword"
                      type="password"
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      required
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full bg-primary-gradient"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <ArrowRight className="w-4 h-4 mr-2" />
                  )}
                  Create Account
                </Button>
              </form>
            )}

            <p className="text-center text-sm text-muted-foreground mt-4">
              Already have an account?{" "}
              <Link to="/login" className="text-primary hover:underline font-medium">
                Sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
