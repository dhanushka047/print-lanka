import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SMSRequest {
  phone: string; // Can be single number or comma-separated numbers
  message: string;
  order_id?: string;
  user_id: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get API token from secrets
    const apiToken = Deno.env.get('TEXTLK_API_TOKEN');
    
    if (!apiToken) {
      console.error('TEXTLK_API_TOKEN not configured');
      return new Response(
        JSON.stringify({ error: 'SMS API token not configured' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { phone, message, order_id, user_id }: SMSRequest = await req.json();

    // Format phone number(s) to Sri Lankan international format
    const formatSriLankanPhone = (phoneNum: string): string => {
      let cleaned = phoneNum.replace(/[^0-9]/g, '');
      // If starts with 0, replace with 94
      if (cleaned.startsWith('0')) {
        cleaned = '94' + cleaned.substring(1);
      }
      // If doesn't start with 94, add it
      if (!cleaned.startsWith('94')) {
        cleaned = '94' + cleaned;
      }
      return cleaned;
    };

    // Handle multiple phone numbers (comma-separated)
    const phoneNumbers = phone.split(',').map(p => p.trim()).filter(p => p.length > 0);
    const formattedPhones = phoneNumbers.map(formatSriLankanPhone);
    const recipient = formattedPhones.join(',');
    
    console.log('Sending SMS via Text.lk v3 API');
    console.log('To:', recipient);
    console.log('Message:', message.substring(0, 50) + '...');

    // Log the notification attempt (for first phone number)
    const { data: notification, error: notifError } = await supabase
      .from('notifications')
      .insert({
        phone: formattedPhones[0] || recipient,
        message,
        order_id,
        user_id,
        status: 'pending'
      })
      .select()
      .single();

    if (notifError) {
      console.error('Failed to log notification:', notifError);
    }

    // Send SMS using Text.lk v3 API with Bearer token authentication
    const textlkUrl = 'https://app.text.lk/api/v3/sms/send';
    
    const response = await fetch(textlkUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        recipient: recipient,
        sender_id: 'IO Builds',
        type: 'plain',
        message: message,
      }),
    });

    const result = await response.json();
    console.log('Text.lk v3 API response:', JSON.stringify(result));
    
    // Check for success - Text.lk v3 returns status in different format
    const isSuccess = response.ok && (result.status === 'success' || result.data?.id);

    // Update notification status
    if (notification) {
      await supabase
        .from('notifications')
        .update({
          status: isSuccess ? 'sent' : 'failed',
          provider_response: JSON.stringify(result),
        })
        .eq('id', notification.id);
    }

    return new Response(
      JSON.stringify({ 
        success: isSuccess, 
        message: isSuccess ? 'SMS sent successfully' : 'SMS sending failed',
        response: result 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('SMS error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
