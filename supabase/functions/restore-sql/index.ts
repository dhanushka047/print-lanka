import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const dbUrl = Deno.env.get('SUPABASE_DB_URL');

    if (!dbUrl) {
      return new Response(
        JSON.stringify({ error: 'Database URL not configured. Please add SUPABASE_DB_URL secret.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify admin role
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is admin
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin');

    if (!roles || roles.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { sqlContent, sessionId } = await req.json();

    if (!sqlContent) {
      return new Response(
        JSON.stringify({ error: 'SQL content is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify OTP session
    if (sessionId) {
      const { data: session } = await supabase
        .from('otp_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('verified', true)
        .maybeSingle();

      if (!session) {
        return new Response(
          JSON.stringify({ error: 'Invalid or expired OTP session' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log('Starting SQL restore...');

    // Import postgres client
    const { Client } = await import("https://deno.land/x/postgres@v0.17.0/mod.ts");
    const client = new Client(dbUrl);
    await client.connect();

    // Parse SQL statements - split by semicolons but handle multi-line statements
    const statements = sqlContent
      .split(/;\s*\n/)
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 0 && !s.startsWith('--'));

    let executed = 0;
    let skipped = 0;
    let errors: string[] = [];

    for (const statement of statements) {
      try {
        // Skip certain statements that might cause issues
        if (
          statement.toUpperCase().startsWith('DROP') ||
          statement.toUpperCase().startsWith('TRUNCATE') ||
          statement.toUpperCase().startsWith('ALTER DATABASE') ||
          statement.toUpperCase().startsWith('CREATE DATABASE')
        ) {
          console.log('Skipping dangerous statement:', statement.substring(0, 50));
          skipped++;
          continue;
        }

        // Execute the statement
        await client.queryObject(statement);
        executed++;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        // Log but continue on errors (e.g., duplicate key violations with ON CONFLICT)
        if (!errorMsg.includes('duplicate key') && !errorMsg.includes('already exists')) {
          errors.push(`Statement error: ${errorMsg.substring(0, 100)}`);
        }
        console.log('Statement error (continuing):', errorMsg);
      }
    }

    await client.end();

    console.log(`SQL restore complete: ${executed} executed, ${skipped} skipped, ${errors.length} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'SQL restore completed',
        stats: {
          total: statements.length,
          executed,
          skipped,
          errors: errors.length,
          errorDetails: errors.slice(0, 10) // First 10 errors only
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('SQL restore error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
