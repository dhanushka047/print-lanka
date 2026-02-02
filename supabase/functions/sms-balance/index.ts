import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get API token from secrets
    const apiToken = Deno.env.get('TEXTLK_API_TOKEN');
    
    if (!apiToken) {
      console.error('TEXTLK_API_TOKEN not configured');
      return new Response(
        JSON.stringify({ error: 'SMS API token not configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get SMS balance from Text.lk API
    const response = await fetch('https://app.text.lk/api/v3/balance', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    const result = await response.json();
    console.log('Text.lk balance response:', JSON.stringify(result));
    
    if (result.status === 'success') {
      // Extract balance from response
      const balanceData = result.data;
      let balance = 0;
      
      // Handle different response formats
      if (typeof balanceData === 'number') {
        balance = balanceData;
      } else if (typeof balanceData === 'object' && balanceData !== null) {
        // Try common field names - remaining_balance is what Text.lk returns
        balance = balanceData.remaining_balance || balanceData.remaining_unit || balanceData.balance || balanceData.units || balanceData.sms_unit || 0;
        // Parse if it's a string
        if (typeof balance === 'string') {
          balance = parseFloat(balance) || 0;
        }
      } else if (typeof balanceData === 'string') {
        // Try to parse if it's a string number
        balance = parseFloat(balanceData) || 0;
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          balance: balance,
          raw: balanceData,
          lowBalance: balance < 100
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: result.message || 'Failed to fetch balance',
          raw: result
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Balance check error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
