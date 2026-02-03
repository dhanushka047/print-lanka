import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface VerifyRequest {
  phone: string;
  otp_code: string;
  // Backwards compatibility: some older clients send `otp`
  otp?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { phone, otp_code, otp }: VerifyRequest = await req.json();

    const providedOtp = otp_code ?? otp;

    if (!phone || !providedOtp) {
      return new Response(
        JSON.stringify({ error: 'Phone and OTP code are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format phone number
    const formatPhone = (phoneNum: string): string => {
      let cleaned = phoneNum.replace(/[^0-9]/g, '');
      if (cleaned.startsWith('0')) {
        cleaned = '94' + cleaned.substring(1);
      }
      if (!cleaned.startsWith('94')) {
        cleaned = '94' + cleaned;
      }
      return cleaned;
    };

    const formattedPhone = formatPhone(phone);
    console.log(`Verifying OTP for ${formattedPhone}`);

    // Get OTP session using maybeSingle to avoid errors
    const { data: session, error: fetchError } = await supabase
      .from('otp_sessions')
      .select('*')
      .eq('phone', formattedPhone)
      .eq('verified', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      console.error('Error fetching OTP session:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to verify OTP' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!session) {
      console.log(`No pending OTP found for ${formattedPhone}`);
      return new Response(
        JSON.stringify({ error: 'No pending OTP found. Please request a new code.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if expired
    if (new Date(session.expires_at) < new Date()) {
      await supabase.from('otp_sessions').delete().eq('id', session.id);
      return new Response(
        JSON.stringify({ error: 'OTP has expired. Please request a new code.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check attempts (max 5)
    if ((session.attempts || 0) >= 5) {
      await supabase.from('otp_sessions').delete().eq('id', session.id);
      return new Response(
        JSON.stringify({ error: 'Too many attempts. Please request a new code.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Increment attempts
    await supabase
      .from('otp_sessions')
      .update({ attempts: (session.attempts || 0) + 1 })
      .eq('id', session.id);

    // Verify OTP
    if (session.otp_code !== providedOtp) {
      const remainingAttempts = 4 - (session.attempts || 0);
      return new Response(
        JSON.stringify({ 
          error: `Invalid OTP. ${remainingAttempts} attempts remaining.`,
          remaining_attempts: remainingAttempts 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Mark as verified
    await supabase
      .from('otp_sessions')
      .update({ verified: true })
      .eq('id', session.id);

    console.log(`OTP verified successfully for ${formattedPhone}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'OTP verified successfully',
        session_id: session.id,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Verify OTP error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
