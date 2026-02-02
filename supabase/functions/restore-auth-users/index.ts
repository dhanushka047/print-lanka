import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ProfileData {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify the caller is an admin
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use anon key client to verify the user
    const anonClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await anonClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user is admin
    const { data: isAdmin } = await anonClient.rpc("is_admin_or_moderator", {
      _user_id: user.id,
    });

    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get profiles from request body
    const { profiles } = await req.json() as { profiles: ProfileData[] };

    if (!profiles || !Array.isArray(profiles)) {
      return new Response(JSON.stringify({ error: "Invalid profiles data" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role client for admin operations
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const results = {
      created: 0,
      skipped: 0,
      failed: 0,
      resetEmailsSent: 0,
      errors: [] as string[],
    };

    for (const profile of profiles) {
      if (!profile.email) {
        results.skipped++;
        continue;
      }

      try {
        // Check if user already exists
        const { data: existingUsers } = await adminClient.auth.admin.listUsers();
        const existingUser = existingUsers?.users?.find(
          (u) => u.email?.toLowerCase() === profile.email.toLowerCase()
        );

        if (existingUser) {
          results.skipped++;
          continue;
        }

        // Create new user with a random password (they'll reset it)
        const tempPassword = crypto.randomUUID() + "Aa1!"; // Ensure password meets requirements
        
        const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
          email: profile.email,
          password: tempPassword,
          email_confirm: true, // Auto-confirm since these are existing users
          user_metadata: {
            first_name: profile.first_name,
            last_name: profile.last_name,
            phone: profile.phone,
          },
        });

        if (createError) {
          results.failed++;
          results.errors.push(`Failed to create ${profile.email}: ${createError.message}`);
          continue;
        }

        results.created++;

        // Send password reset email so user can set their own password
        const { error: resetError } = await adminClient.auth.admin.generateLink({
          type: "recovery",
          email: profile.email,
        });

        if (!resetError) {
          // Actually send the reset email
          const { error: sendError } = await adminClient.auth.resetPasswordForEmail(
            profile.email,
            { redirectTo: `${req.headers.get("origin") || supabaseUrl}/login` }
          );
          
          if (!sendError) {
            results.resetEmailsSent++;
          }
        }

        // Update the profile to link to the new user_id if different
        if (newUser?.user && newUser.user.id !== profile.user_id) {
          // The profile already has the old user_id, we might need to update it
          // For now, we'll leave the profile as-is since the new user has same email
        }
      } catch (err: unknown) {
        results.failed++;
        const errMsg = err instanceof Error ? err.message : "Unknown error";
        results.errors.push(`Error processing ${profile.email}: ${errMsg}`);
      }
    }

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Restore auth users error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to restore users";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
