import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify admin access via auth header
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the user is an admin using Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: authHeader,
        apikey: supabaseKey,
      },
    });
    
    if (!userResponse.ok) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const user = await userResponse.json();
    
    // Check if user is admin
    const roleCheckResponse = await fetch(
      `${supabaseUrl}/rest/v1/rpc/is_admin_or_moderator`,
      {
        method: "POST",
        headers: {
          Authorization: authHeader,
          apikey: supabaseKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ _user_id: user.id }),
      }
    );

    const isAdmin = await roleCheckResponse.json();
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get the database URL from secrets
    const dbUrl = Deno.env.get("SUPABASE_DB_URL");
    if (!dbUrl) {
      return new Response(
        JSON.stringify({ error: "Database URL not configured. Please add SUPABASE_DB_URL secret." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Connect to the database
    const client = new Client(dbUrl);
    await client.connect();

    const sqlStatements: string[] = [];
    sqlStatements.push("-- Full Database Dump");
    sqlStatements.push(`-- Generated at: ${new Date().toISOString()}`);
    sqlStatements.push("-- This dump includes schema and data for all public tables\n");

    // Get all tables in public schema
    const tablesResult = await client.queryObject<{ tablename: string }>`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename
    `;

    const tables = tablesResult.rows.map((r) => r.tablename);

    // Get enum types first
    sqlStatements.push("-- =====================");
    sqlStatements.push("-- ENUM TYPES");
    sqlStatements.push("-- =====================\n");

    const enumsResult = await client.queryObject<{ typname: string; enumlabel: string }>`
      SELECT t.typname, e.enumlabel
      FROM pg_type t 
      JOIN pg_enum e ON t.oid = e.enumtypid  
      JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
      ORDER BY t.typname, e.enumsortorder
    `;

    const enumsByType: Record<string, string[]> = {};
    for (const row of enumsResult.rows) {
      if (!enumsByType[row.typname]) {
        enumsByType[row.typname] = [];
      }
      enumsByType[row.typname].push(row.enumlabel);
    }

    for (const [typeName, values] of Object.entries(enumsByType)) {
      sqlStatements.push(
        `CREATE TYPE public.${typeName} AS ENUM (${values.map((v) => `'${v}'`).join(", ")});`
      );
    }

    sqlStatements.push("\n");

    // For each table, get CREATE TABLE and INSERT statements
    for (const table of tables) {
      sqlStatements.push(`-- =====================`);
      sqlStatements.push(`-- TABLE: ${table}`);
      sqlStatements.push(`-- =====================\n`);

      // Get column definitions
      const columnsResult = await client.queryObject<{
        column_name: string;
        data_type: string;
        udt_name: string;
        is_nullable: string;
        column_default: string | null;
        character_maximum_length: number | null;
      }>`
        SELECT 
          column_name, 
          data_type, 
          udt_name,
          is_nullable, 
          column_default,
          character_maximum_length
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = ${table}
        ORDER BY ordinal_position
      `;

      // Get primary key
      const pkResult = await client.queryObject<{ column_name: string }>`
        SELECT a.attname as column_name
        FROM pg_index i
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = ${`public.${table}`}::regclass AND i.indisprimary
      `;
      const pkColumns = pkResult.rows.map((r) => r.column_name);

      // Build CREATE TABLE statement
      const columnDefs = columnsResult.rows.map((col) => {
        let typeDef = col.data_type;
        if (col.data_type === "USER-DEFINED") {
          typeDef = col.udt_name;
        } else if (col.data_type === "character varying" && col.character_maximum_length) {
          typeDef = `varchar(${col.character_maximum_length})`;
        } else if (col.data_type === "ARRAY") {
          typeDef = `${col.udt_name.replace("_", "")}[]`;
        }

        let def = `  ${col.column_name} ${typeDef}`;
        if (col.is_nullable === "NO") def += " NOT NULL";
        if (col.column_default) def += ` DEFAULT ${col.column_default}`;
        return def;
      });

      if (pkColumns.length > 0) {
        columnDefs.push(`  PRIMARY KEY (${pkColumns.join(", ")})`);
      }

      sqlStatements.push(`CREATE TABLE IF NOT EXISTS public.${table} (`);
      sqlStatements.push(columnDefs.join(",\n"));
      sqlStatements.push(`);\n`);

      // Get data for INSERT statements
      const dataResult = await client.queryObject(`SELECT * FROM public.${table}`);

      if (dataResult.rows.length > 0) {
        const columns = Object.keys(dataResult.rows[0] as Record<string, unknown>);

        for (const row of dataResult.rows) {
          const rowData = row as Record<string, unknown>;
          const values = columns.map((col) => {
            const val = rowData[col];
            if (val === null) return "NULL";
            if (typeof val === "string") return `'${val.replace(/'/g, "''")}'`;
            if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
            if (val instanceof Date) return `'${val.toISOString()}'`;
            if (typeof val === "object") return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
            return String(val);
          });

          sqlStatements.push(
            `INSERT INTO public.${table} (${columns.join(", ")}) VALUES (${values.join(", ")}) ON CONFLICT DO NOTHING;`
          );
        }
        sqlStatements.push("");
      }
    }

    // Add RLS policies
    sqlStatements.push("\n-- =====================");
    sqlStatements.push("-- RLS POLICIES");
    sqlStatements.push("-- =====================\n");

    const policiesResult = await client.queryObject<{
      tablename: string;
      policyname: string;
      permissive: string;
      roles: string[];
      cmd: string;
      qual: string | null;
      with_check: string | null;
    }>`
      SELECT 
        schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
      FROM pg_policies 
      WHERE schemaname = 'public'
      ORDER BY tablename, policyname
    `;

    for (const policy of policiesResult.rows) {
      sqlStatements.push(`-- Policy: ${policy.policyname} on ${policy.tablename}`);
      let policyDef = `CREATE POLICY "${policy.policyname}" ON public.${policy.tablename}`;
      policyDef += ` AS ${policy.permissive}`;
      policyDef += ` FOR ${policy.cmd}`;
      policyDef += ` TO ${policy.roles.join(", ")}`;
      if (policy.qual) policyDef += ` USING (${policy.qual})`;
      if (policy.with_check) policyDef += ` WITH CHECK (${policy.with_check})`;
      sqlStatements.push(policyDef + ";\n");
    }

    // Enable RLS on all tables
    sqlStatements.push("\n-- Enable RLS on all tables");
    for (const table of tables) {
      sqlStatements.push(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`);
    }

    await client.end();

    const sqlContent = sqlStatements.join("\n");

    return new Response(sqlContent, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/sql",
        "Content-Disposition": `attachment; filename="db-dump-${new Date().toISOString().split("T")[0]}.sql"`,
      },
    });
  } catch (error: unknown) {
    console.error("Database dump error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to create database dump";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
