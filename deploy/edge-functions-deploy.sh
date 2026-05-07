#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Deploy ALL Supabase edge functions to the self-hosted instance.
# Requires:
#   - supabase CLI installed (https://supabase.com/docs/guides/cli)
#   - SUPABASE_ACCESS_TOKEN exported (or `supabase login` already done)
#   - The self-hosted project linked:  supabase link --project-ref <ref>
# -----------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")/.."

FUNCTIONS=(
  send-otp
  verify-otp
  reset-password
  send-sms
  send-order-notification
  sms-balance
  db-dump
  restore-sql
  restore-auth-users
)

for fn in "${FUNCTIONS[@]}"; do
  echo "▶ Deploying $fn…"
  supabase functions deploy "$fn" --no-verify-jwt
done

echo "✅  All edge functions deployed."
echo "Reminder: set secrets on the self-hosted instance:"
echo "  supabase secrets set TEXTLK_API_TOKEN=xxx"
