import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShieldCheck } from "lucide-react";

interface AdminOtpVerificationProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVerified: () => void;
  title?: string;
  description?: string;
}

export function AdminOtpVerification({
  open,
  onOpenChange,
  onVerified,
  title = "Admin Verification Required",
  description = "Enter the OTP sent to your phone to proceed with this sensitive operation.",
}: AdminOtpVerificationProps) {
  const { toast } = useToast();
  const [otp, setOtp] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [phone, setPhone] = useState("");
  const [resendTimer, setResendTimer] = useState(0);

  useEffect(() => {
    if (open && !otpSent) {
      fetchPhoneAndSendOtp();
    }
    if (!open) {
      setOtp("");
      setOtpSent(false);
      setResendTimer(0);
    }
  }, [open]);

  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendTimer]);

  const fetchPhoneAndSendOtp = async () => {
    setIsSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get admin's phone from profile
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("phone")
        .eq("user_id", user.id)
        .single();

      if (profileError || !profile?.phone) {
        throw new Error("Phone number not found in profile");
      }

      setPhone(profile.phone);

      // Send OTP
      const { data, error } = await supabase.functions.invoke("send-otp", {
        body: { phone: profile.phone },
      });

      if (error || !data?.success) {
        throw new Error(data?.error || "Failed to send OTP");
      }

      setOtpSent(true);
      setResendTimer(60);
      toast({
        title: "OTP Sent",
        description: `Verification code sent to ${profile.phone.slice(0, 3)}****${profile.phone.slice(-3)}`,
      });
    } catch (error) {
      console.error("OTP send error:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send OTP",
        variant: "destructive",
      });
      onOpenChange(false);
    } finally {
      setIsSending(false);
    }
  };

  const handleVerify = async () => {
    if (otp.length !== 6) return;

    setIsVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("verify-otp", {
        body: { phone, otp_code: otp },
      });

      if (error || !data?.success) {
        throw new Error(data?.error || "Invalid OTP");
      }

      toast({
        title: "Verified",
        description: "Admin verification successful",
      });
      onOpenChange(false);
      onVerified();
    } catch (error) {
      console.error("OTP verify error:", error);
      toast({
        title: "Verification Failed",
        description: error instanceof Error ? error.message : "Invalid OTP",
        variant: "destructive",
      });
      setOtp("");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    if (resendTimer > 0) return;
    await fetchPhoneAndSendOtp();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center space-y-6 py-4">
          {isSending ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Sending OTP...</p>
            </div>
          ) : otpSent ? (
            <>
              <p className="text-sm text-center text-muted-foreground">
                Enter the 6-digit code sent to your phone
              </p>
              <InputOTP
                value={otp}
                onChange={setOtp}
                maxLength={6}
                disabled={isVerifying}
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
              <Button
                variant="link"
                onClick={handleResend}
                disabled={resendTimer > 0}
                className="text-sm"
              >
                {resendTimer > 0 ? `Resend in ${resendTimer}s` : "Resend OTP"}
              </Button>
            </>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isVerifying}>
            Cancel
          </Button>
          <Button onClick={handleVerify} disabled={otp.length !== 6 || isVerifying || !otpSent}>
            {isVerifying ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Verify & Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
