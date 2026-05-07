import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OTPRequest {
  phone: string;
  purpose: 'registration' | 'forgot_password';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const apiToken = Deno.env.get('TEXTLK_API_TOKEN');
    
    if (!apiToken) {
      return new Response(
        JSON.stringify({ error: 'SMS API token not configured' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { phone, purpose }: OTPRequest = await req.json();

    if (!phone) {
      return new Response(
        JSON.stringify({ error: 'Phone number is required' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
    console.log(`Processing OTP request for ${formattedPhone}, purpose: ${purpose}`);

    // For forgot password, check if user exists
    if (purpose === 'forgot_password') {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, phone')
        .or(`phone.eq.${formattedPhone},phone.eq.0${formattedPhone.substring(2)},phone.eq.+${formattedPhone},phone.ilike.%${formattedPhone.substring(2)}%`)
        .limit(1);

      if (!profiles || profiles.length === 0) {
        console.log(`No account found for phone: ${formattedPhone}`);
        return new Response(
          JSON.stringify({ error: 'No account found with this phone number' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      console.log(`Found profile for forgot password: ${profiles[0].id}`);
    }

    // For registration, check if phone is already registered
    if (purpose === 'registration') {
      const { data: existingProfiles } = await supabase
        .from('profiles')
        .select('id, phone')
        .or(`phone.eq.${formattedPhone},phone.eq.0${formattedPhone.substring(2)},phone.eq.+${formattedPhone},phone.ilike.%${formattedPhone.substring(2)}%`)
        .limit(1);

      if (existingProfiles && existingProfiles.length > 0) {
        console.log(`Phone already registered: ${formattedPhone}`);
        return new Response(
          JSON.stringify({ error: 'This phone number is already registered' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Delete any existing OTP sessions for this phone
    await supabase
      .from('otp_sessions')
      .delete()
      .eq('phone', formattedPhone);

    // Generate 6-digit OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Set expiry to 5 minutes from now
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    // Store OTP session
    const { error: insertError } = await supabase
      .from('otp_sessions')
      .insert({
        phone: formattedPhone,
        otp_code: otpCode,
        expires_at: expiresAt,
        verified: false,
        attempts: 0,
      });

    if (insertError) {
      console.error('Failed to create OTP session:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to create OTP session' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Send OTP via SMS
    const message = `Your IO Builds verification code is: ${otpCode}. Valid for 5 minutes. Do not share this code.`;
    
    const response = await fetch('https://app.text.lk/api/v3/sms/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        recipient: formattedPhone,
        sender_id: 'IO Builds',
        type: 'plain',
        message: message,
      }),
    });

    const result = await response.json();
    const isSuccess = response.ok && (result.status === 'success' || result.data?.id);

    if (!isSuccess) {
      console.error('SMS sending failed:', result);
    }

    console.log(`OTP ${otpCode} sent to ${formattedPhone} for ${purpose}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'OTP sent successfully',
        phone: formattedPhone,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('OTP error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
