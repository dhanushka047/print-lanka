import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NotificationRequest {
  order_id: string;
  order_type: 'print' | 'shop';
  notification_type: 'new_order' | 'thank_you';
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
      console.error('TEXTLK_API_TOKEN not configured');
      return new Response(
        JSON.stringify({ error: 'SMS API token not configured' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { order_id, order_type, notification_type }: NotificationRequest = await req.json();

    // Get admin phone from settings
    const { data: adminPhoneSetting } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'admin_phone')
      .single();

    const adminPhone = adminPhoneSetting?.value ? 
      (typeof adminPhoneSetting.value === 'string' ? adminPhoneSetting.value.replace(/"/g, '') : adminPhoneSetting.value) 
      : '0770000000';

    // Format phone number
    const formatPhone = (phone: string): string => {
      let cleaned = phone.replace(/[^0-9]/g, '');
      if (cleaned.startsWith('0')) {
        cleaned = '94' + cleaned.substring(1);
      }
      if (!cleaned.startsWith('94')) {
        cleaned = '94' + cleaned;
      }
      return cleaned;
    };

    let customerPhone = '';
    let customerName = '';
    let orderTotal = 0;
    let orderShortId = order_id.slice(0, 8);

    if (order_type === 'shop') {
      // Get shop order details
      const { data: order } = await supabase
        .from('shop_orders')
        .select('phone, total_price, user_id')
        .eq('id', order_id)
        .single();

      if (order) {
        customerPhone = order.phone;
        orderTotal = order.total_price;

        // Get customer name
        const { data: profile } = await supabase
          .from('profiles')
          .select('first_name')
          .eq('user_id', order.user_id)
          .single();

        customerName = profile?.first_name || 'Customer';
      }
    } else {
      // Get 3D print order details
      const { data: order } = await supabase
        .from('orders')
        .select('user_id')
        .eq('id', order_id)
        .single();

      if (order) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('first_name, phone')
          .eq('user_id', order.user_id)
          .single();

        customerName = profile?.first_name || 'Customer';
        customerPhone = profile?.phone || '';
      }
    }

    const messages: { phone: string; message: string; user_id?: string }[] = [];

    if (notification_type === 'new_order') {
      // Notify admin about new order
      messages.push({
        phone: formatPhone(adminPhone),
        message: `New ${order_type === 'shop' ? 'Shop' : '3D Print'} Order #${orderShortId} from ${customerName}! ${orderTotal > 0 ? `Total: LKR ${orderTotal.toLocaleString()}` : 'Please review and price.'}`,
      });
    }

    if (notification_type === 'thank_you' && customerPhone) {
      // Thank you message to customer
      const thankYouMessage = order_type === 'shop'
        ? `Thank you for your order #${orderShortId}! We're processing it immediately. You'll receive an update once your payment is verified. - IO Builds`
        : `Thank you for your 3D print order #${orderShortId}! We'll review and price your items shortly. - IO Builds`;

      messages.push({
        phone: formatPhone(customerPhone),
        message: thankYouMessage,
      });
    }

    // Send all messages
    const results = [];
    for (const msg of messages) {
      const response = await fetch('https://app.text.lk/api/v3/sms/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          recipient: msg.phone,
          sender_id: 'IO Builds',
          type: 'plain',
          message: msg.message,
        }),
      });

      const result = await response.json();
      console.log(`SMS to ${msg.phone}:`, result);
      results.push({ phone: msg.phone, result });

      // Log notification
      await supabase.from('notifications').insert({
        phone: msg.phone,
        message: msg.message,
        order_id,
        user_id: msg.user_id || '00000000-0000-0000-0000-000000000000',
        status: response.ok ? 'sent' : 'failed',
        provider_response: JSON.stringify(result),
      });
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Notification error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
