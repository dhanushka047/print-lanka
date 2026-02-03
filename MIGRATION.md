# IOBuilds Self-Hosted Migration Guide

Complete guide for migrating from Lovable Cloud to a self-hosted VPS with Ubuntu and Supabase Docker.

---

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Pre-Migration Checklist](#pre-migration-checklist)
3. [VPS Setup](#vps-setup)
4. [Supabase Self-Hosted Setup](#supabase-self-hosted-setup)
5. [Database Migration](#database-migration)
6. [Storage Migration](#storage-migration)
7. [Edge Functions Deployment](#edge-functions-deployment)
8. [Frontend Deployment](#frontend-deployment)
9. [Nginx & SSL Configuration](#nginx--ssl-configuration)
10. [Environment Variables Reference](#environment-variables-reference)
11. [Migration Sequence](#migration-sequence)
12. [Troubleshooting](#troubleshooting)
13. [Post-Migration Verification](#post-migration-verification)

---

## Prerequisites

### VPS Requirements
- **OS**: Ubuntu 22.04 LTS or 24.04 LTS
- **RAM**: Minimum 4GB (8GB recommended for production)
- **Storage**: 20GB+ SSD
- **CPU**: 2+ cores

### Software Requirements
- Docker & Docker Compose
- Node.js 20.x
- Nginx
- Certbot (for SSL)
- Git

### Access Requirements
- SSH access to VPS
- Domain name (optional but recommended)
- Admin access to Lovable project

---

## Pre-Migration Checklist

Before starting migration:

- [ ] Export project code from Lovable (Settings → Export)
- [ ] Download SQL dump from Admin → Backup
- [ ] Download ZIP backup (storage files + JSON data)
- [ ] Note all environment variables/secrets
- [ ] Document current SMS provider settings (TEXTLK_API_TOKEN)
- [ ] Inform users of planned downtime

---

## VPS Setup

### Step 1: Update System

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git unzip
```

### Step 2: Install Docker

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Apply group changes (or logout/login)
newgrp docker

# Verify installation
docker --version
```

### Step 3: Install Docker Compose

```bash
sudo apt install docker-compose-plugin -y

# Verify
docker compose version
```

### Step 4: Install Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node --version
npm --version
```

### Step 5: Install Nginx

```bash
sudo apt install nginx -y
sudo systemctl enable nginx
sudo systemctl start nginx
```

---

## Supabase Self-Hosted Setup

### Step 1: Clone Supabase Docker

```bash
cd /opt
sudo git clone --depth 1 https://github.com/supabase/supabase
sudo chown -R $USER:$USER supabase
cd supabase/docker
```

### Step 2: Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with secure values:

```bash
nano .env
```

**Critical variables to set:**

```env
############
# Secrets
############
POSTGRES_PASSWORD=your-super-secure-password-here
JWT_SECRET=your-jwt-secret-at-least-32-characters
ANON_KEY=your-generated-anon-key
SERVICE_ROLE_KEY=your-generated-service-role-key

############
# API
############
SITE_URL=https://your-domain.com
API_EXTERNAL_URL=https://api.your-domain.com

############
# Studio
############
STUDIO_PORT=3000
```

### Step 3: Generate JWT Keys

Use the Supabase JWT generator: https://supabase.com/docs/guides/self-hosting/docker#generate-api-keys

Or generate manually:

```bash
# Generate JWT_SECRET
openssl rand -base64 32

# Generate keys using the JWT secret at:
# https://supabase.com/docs/guides/self-hosting/docker#api-keys
```

### Step 4: Start Supabase

```bash
docker compose up -d

# Check status
docker compose ps

# View logs
docker compose logs -f
```

### Step 5: Verify Installation

Access Supabase Studio: `http://YOUR_VPS_IP:3000`

---

## Database Migration

### Migration File Execution Order

The project has 22 migration files. Execute in this order:

```
1.  20250626034310_damp_feather.sql         - Core enums and profiles
2.  20250626034502_muddy_spire.sql          - User roles and RLS
3.  20250626040001_late_cave.sql            - Bank details
4.  20250626041001_small_brook.sql          - Coupons system
5.  20250626042001_floating_water.sql       - Orders and items
6.  20250626043001_nameless_scene.sql       - Files and payment slips
7.  20250626044001_velvet_sun.sql           - Notifications
8.  20250626045001_amber_bird.sql           - Storage buckets
9.  20250626045901_small_disk.sql           - Gallery posts
10. 20250626050001_divine_fire.sql          - Reviews
11. 20250626051001_soft_truth.sql           - OTP sessions
12. 20250626055648_wooden_sound.sql         - Update triggers
13. 20250627092610_summer_lantern.sql       - Pricing config
14. 20250627121256_proud_summit.sql         - Available colors
15. 20250627122710_sweet_night.sql          - Coupons public flag
16. 20250628135956_yellow_wave.sql          - User coupons usage
17. 20250629054906_calm_waterfall.sql       - SMS campaigns
18. 20250629085719_round_cake.sql           - Order tracking
19. 20250629100728_bright_reef.sql          - Product categories
20. 20250629101419_rustic_wave.sql          - Shop products system
21. 20250629152508_falling_credit.sql       - Shop orders system
22. 20250630090628_summer_silence.sql       - Site assets bucket
```

### Option A: Run Individual Migrations

```bash
cd /path/to/your/project

for file in supabase/migrations/*.sql; do
    echo "Running: $file"
    docker exec -i supabase-db psql -U postgres -d postgres < "$file"
done
```

### Option B: Restore from SQL Dump

```bash
# Copy SQL dump to VPS
scp db-dump-YYYY-MM-DD.sql user@YOUR_VPS_IP:~/

# Restore
docker exec -i supabase-db psql -U postgres -d postgres < ~/db-dump-YYYY-MM-DD.sql
```

### Verify Database

```bash
# Connect to database
docker exec -it supabase-db psql -U postgres -d postgres

# List tables
\dt public.*

# Check row counts
SELECT 
    schemaname,
    relname as table_name,
    n_tup_ins as rows
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY relname;
```

---

## Storage Migration

### Step 1: Create Storage Buckets

The migrations create these buckets automatically:
- `models` (private)
- `payment-slips` (private)
- `site-assets` (public)
- `shop-products` (public)

### Step 2: Upload Files

```bash
# Extract ZIP backup
unzip backup-YYYY-MM-DD.zip -d backup

# Upload to Supabase storage via API or Studio
# Use the Supabase Studio at http://YOUR_VPS_IP:3000
```

### Step 3: Verify Storage Policies

Ensure RLS policies are applied:

```sql
-- Check storage policies
SELECT * FROM storage.policies;
```

---

## Edge Functions Deployment

### Step 1: Install Supabase CLI

```bash
npm install -g supabase
```

### Step 2: Configure for Self-Hosted

Create `supabase/.env`:

```env
SUPABASE_URL=http://localhost:8000
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_DB_URL=postgresql://postgres:your-password@localhost:5432/postgres
TEXTLK_API_TOKEN=your-textlk-token
```

### Step 3: Deploy Functions

```bash
cd /path/to/your/project

# Deploy all functions
supabase functions deploy send-otp --no-verify-jwt
supabase functions deploy verify-otp --no-verify-jwt
supabase functions deploy reset-password --no-verify-jwt
supabase functions deploy send-order-notification
supabase functions deploy send-sms
supabase functions deploy sms-balance
supabase functions deploy db-dump
supabase functions deploy restore-sql
supabase functions deploy restore-auth-users
```

### Edge Functions Reference

| Function | JWT Verify | Description |
|----------|------------|-------------|
| `send-otp` | false | Send OTP via SMS |
| `verify-otp` | false | Verify OTP code |
| `reset-password` | false | Password reset |
| `send-order-notification` | true | Order SMS notifications |
| `send-sms` | true | Generic SMS sending |
| `sms-balance` | true | Check SMS balance |
| `db-dump` | true | Database backup |
| `restore-sql` | true | SQL restoration |
| `restore-auth-users` | true | Auth user recovery |

---

## Frontend Deployment

### Step 1: Setup Project

```bash
cd /var/www
unzip iobuilds-export.zip -d iobuilds
cd iobuilds
npm install
```

### Step 2: Configure Environment

```bash
cat > .env << 'EOF'
VITE_SUPABASE_URL=https://api.your-domain.com
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
VITE_SUPABASE_PROJECT_ID=self-hosted
EOF
```

### Step 3: Build

```bash
npm run build
```

### Step 4: Setup PM2 (Optional for SSR)

For static hosting, skip this. The build output is in `dist/`.

---

## Nginx & SSL Configuration

### Main Site Configuration

```bash
sudo nano /etc/nginx/sites-available/iobuilds
```

```nginx
# Frontend
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;
    root /var/www/iobuilds/dist;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

    # SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}

# API Proxy
server {
    listen 80;
    server_name api.your-domain.com;

    location / {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# Supabase Studio (restrict access!)
server {
    listen 80;
    server_name studio.your-domain.com;

    # IP restriction (update with your IP)
    allow YOUR_IP_ADDRESS;
    deny all;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }
}
```

### Enable Site

```bash
sudo ln -s /etc/nginx/sites-available/iobuilds /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### SSL with Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx -y

# Get certificates
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
sudo certbot --nginx -d api.your-domain.com
sudo certbot --nginx -d studio.your-domain.com

# Auto-renewal
sudo certbot renew --dry-run
```

---

## Environment Variables Reference

### Frontend (.env)

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_SUPABASE_URL` | Supabase API URL | `https://api.your-domain.com` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Anon key | `eyJhbGc...` |
| `VITE_SUPABASE_PROJECT_ID` | Project identifier | `self-hosted` |

### Supabase Docker (.env)

| Variable | Description |
|----------|-------------|
| `POSTGRES_PASSWORD` | Database password |
| `JWT_SECRET` | JWT signing secret (32+ chars) |
| `ANON_KEY` | Public API key |
| `SERVICE_ROLE_KEY` | Admin API key |
| `SITE_URL` | Frontend URL |
| `API_EXTERNAL_URL` | API public URL |

### Edge Functions Secrets

| Secret | Description |
|--------|-------------|
| `SUPABASE_URL` | Supabase API URL |
| `SUPABASE_ANON_KEY` | Anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key |
| `SUPABASE_DB_URL` | Direct database connection |
| `TEXTLK_API_TOKEN` | SMS provider token |

---

## Migration Sequence

### Complete Step-by-Step

```
┌─────────────────────────────────────────────────────────────┐
│                    MIGRATION SEQUENCE                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. PREPARATION                                              │
│     ├── Export code from Lovable                            │
│     ├── Download SQL dump                                   │
│     ├── Download ZIP backup (storage)                       │
│     └── Document all secrets                                │
│                                                              │
│  2. VPS SETUP                                               │
│     ├── Update Ubuntu                                       │
│     ├── Install Docker                                      │
│     ├── Install Docker Compose                              │
│     ├── Install Node.js 20                                  │
│     └── Install Nginx                                       │
│                                                              │
│  3. SUPABASE SETUP                                          │
│     ├── Clone Supabase Docker                               │
│     ├── Configure .env                                      │
│     ├── Generate JWT keys                                   │
│     └── Start containers                                    │
│                                                              │
│  4. DATABASE MIGRATION                                       │
│     ├── Run migrations OR restore SQL dump                  │
│     ├── Verify tables created                               │
│     └── Check RLS policies                                  │
│                                                              │
│  5. STORAGE MIGRATION                                        │
│     ├── Verify buckets exist                                │
│     ├── Upload files from backup                            │
│     └── Verify storage policies                             │
│                                                              │
│  6. EDGE FUNCTIONS                                           │
│     ├── Install Supabase CLI                                │
│     ├── Configure secrets                                   │
│     └── Deploy all functions                                │
│                                                              │
│  7. FRONTEND DEPLOYMENT                                      │
│     ├── Extract project files                               │
│     ├── Configure .env                                      │
│     ├── Build project                                       │
│     └── Copy to /var/www                                    │
│                                                              │
│  8. NGINX & SSL                                              │
│     ├── Configure virtual hosts                             │
│     ├── Enable sites                                        │
│     └── Install SSL certificates                            │
│                                                              │
│  9. VERIFICATION                                             │
│     ├── Test frontend loads                                 │
│     ├── Test authentication                                 │
│     ├── Test database operations                            │
│     ├── Test file uploads                                   │
│     └── Test SMS functionality                              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Troubleshooting

### Docker Issues

#### Containers not starting

```bash
# Check logs
docker compose logs -f

# Restart all containers
docker compose down && docker compose up -d

# Check disk space
df -h
```

#### Database connection refused

```bash
# Check if postgres is running
docker ps | grep supabase-db

# Check postgres logs
docker logs supabase-db

# Verify port binding
netstat -tlnp | grep 5432
```

### Database Issues

#### Migration fails with "relation already exists"

```bash
# Connect to database
docker exec -it supabase-db psql -U postgres -d postgres

# Drop and recreate (CAUTION: data loss)
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
```

#### Storage bucket insert conflicts

The migrations use `ON CONFLICT DO NOTHING` for buckets. If you see errors:

```sql
-- Check existing buckets
SELECT * FROM storage.buckets;

-- Manually create if needed
INSERT INTO storage.buckets (id, name, public)
VALUES ('models', 'models', false)
ON CONFLICT (id) DO NOTHING;
```

#### RLS policy errors

```bash
# Check existing policies
SELECT * FROM pg_policies WHERE schemaname = 'public';

# Drop and recreate if needed
DROP POLICY IF EXISTS "policy_name" ON table_name;
```

#### Missing column errors (e.g., "column does not exist")

If you see errors like `column order_items.weight_grams does not exist`, it means migrations weren't fully applied:

```bash
# Connect to database
docker exec -it supabase-db psql -U postgres -d postgres
```

**Add missing columns to `order_items`:**

```sql
-- Check current columns
\d order_items

-- Add missing columns
ALTER TABLE public.order_items 
ADD COLUMN IF NOT EXISTS weight_grams numeric;

ALTER TABLE public.order_items 
ADD COLUMN IF NOT EXISTS price numeric;

ALTER TABLE public.order_items 
ADD COLUMN IF NOT EXISTS file_size bigint;
```

**Add missing columns to `orders`:**

```sql
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS delivery_charge numeric DEFAULT 0;

ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS priced_at timestamp with time zone;

ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS paid_at timestamp with time zone;

ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS payment_rejection_reason text;

ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS rejection_reason text;

ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS tracking_number text;
```

**Full schema verification script:**

```sql
-- Run this to check all tables have required columns
DO $$
BEGIN
  -- order_items columns
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_items' AND column_name='weight_grams') THEN
    ALTER TABLE public.order_items ADD COLUMN weight_grams numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_items' AND column_name='price') THEN
    ALTER TABLE public.order_items ADD COLUMN price numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_items' AND column_name='file_size') THEN
    ALTER TABLE public.order_items ADD COLUMN file_size bigint;
  END IF;
  
  -- orders columns  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='delivery_charge') THEN
    ALTER TABLE public.orders ADD COLUMN delivery_charge numeric DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='priced_at') THEN
    ALTER TABLE public.orders ADD COLUMN priced_at timestamp with time zone;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='paid_at') THEN
    ALTER TABLE public.orders ADD COLUMN paid_at timestamp with time zone;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='payment_rejection_reason') THEN
    ALTER TABLE public.orders ADD COLUMN payment_rejection_reason text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='rejection_reason') THEN
    ALTER TABLE public.orders ADD COLUMN rejection_reason text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='tracking_number') THEN
    ALTER TABLE public.orders ADD COLUMN tracking_number text;
  END IF;
  
  RAISE NOTICE 'Schema verification complete';
END $$;
```

### Storage Restore Errors (Critical for ZIP Backup Restore)

When restoring from a ZIP backup on self-hosted Supabase, you may encounter:

- **"StorageApiError: new row violates row-level security policy"**
- **CORS blocked errors**
- **504 Gateway Timeout / 502 Bad Gateway**

#### 1. Fix Storage RLS Policies

Self-hosted Supabase requires explicit storage RLS policies. Run these SQL commands:

```sql
-- Enable RLS on storage.objects (if not enabled)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to upload to all buckets
CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow authenticated users to update their uploads
CREATE POLICY "Allow authenticated updates"
ON storage.objects FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Allow authenticated users to delete
CREATE POLICY "Allow authenticated deletes"
ON storage.objects FOR DELETE
TO authenticated
USING (true);

-- Allow public read for public buckets
CREATE POLICY "Allow public read for public buckets"
ON storage.objects FOR SELECT
TO public
USING (bucket_id IN ('site-assets', 'shop-products'));

-- Allow authenticated read for private buckets
CREATE POLICY "Allow authenticated read for private buckets"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id IN ('models', 'payment-slips'));
```

Or for admin-only restore operations:

```sql
-- Allow service role full access (for restore operations)
CREATE POLICY "Service role full access"
ON storage.objects
TO service_role
USING (true)
WITH CHECK (true);
```

#### 2. Fix CORS for Storage

Edit your Supabase Kong configuration (`/opt/supabase/docker/volumes/api/kong.yml`):

```yaml
# Add or update CORS plugin for storage
plugins:
  - name: cors
    config:
      origins:
        - "*"  # Or your specific domain
      methods:
        - GET
        - POST
        - PUT
        - PATCH
        - DELETE
        - OPTIONS
      headers:
        - Accept
        - Accept-Version
        - Authorization
        - Content-Length
        - Content-Type
        - X-Client-Info
        - apikey
        - x-upsert
      exposed_headers:
        - X-Supabase-Api-Version
      credentials: true
      max_age: 3600
```

Restart Kong after changes:

```bash
docker compose restart kong
```

#### 3. Alternative: Direct Storage Restore via CLI

If web restore fails, use Supabase CLI for storage:

```bash
# Extract backup ZIP
unzip backup-full-2026-02-03.zip -d restore_temp

# Upload files directly using supabase CLI
cd restore_temp/storage

# For each bucket
for bucket in models payment-slips site-assets shop-products; do
  if [ -d "$bucket" ]; then
    echo "Uploading $bucket..."
    find $bucket -type f -exec sh -c '
      supabase storage cp "$1" "sb://'$bucket'/$(dirname "$1" | sed "s|^'$bucket'/||")"
    ' _ {} \;
  fi
done
```

#### 4. Alternative: Direct PostgreSQL Storage Insert

For maximum control, insert directly via psql:

```bash
# Connect to database
docker exec -it supabase-db psql -U postgres -d postgres

# Then insert storage object records
INSERT INTO storage.objects (bucket_id, name, owner, created_at, updated_at)
SELECT 'models', path, auth.uid(), now(), now()
FROM (VALUES ('file1.stl'), ('file2.stl')) AS t(path);
```

#### 5. Increase Timeouts for Large Files

Edit Nginx configuration:

```nginx
location /storage/v1/ {
    proxy_pass http://localhost:8000;
    proxy_read_timeout 300;
    proxy_connect_timeout 300;
    proxy_send_timeout 300;
    client_max_body_size 100M;
    
    # Disable buffering for uploads
    proxy_request_buffering off;
    proxy_buffering off;
}
```

Edit Kong timeout in `docker-compose.yml`:

```yaml
kong:
  environment:
    - KONG_NGINX_PROXY_PROXY_READ_TIMEOUT=300000
    - KONG_NGINX_PROXY_PROXY_SEND_TIMEOUT=300000
```

Restart services:

```bash
docker compose restart kong
sudo systemctl restart nginx
```

### Nginx Issues

#### 502 Bad Gateway

```bash
# Check if upstream is running
curl http://localhost:8000

# Check nginx error logs
sudo tail -f /var/log/nginx/error.log

# Verify proxy settings
sudo nginx -t
```

#### SSL certificate errors

```bash
# Renew certificates
sudo certbot renew

# Check certificate status
sudo certbot certificates
```

### Edge Functions Issues

#### Function not found

```bash
# List deployed functions
supabase functions list

# Check function logs
supabase functions logs function-name

# Redeploy
supabase functions deploy function-name
```

#### CORS errors

Verify your function includes CORS headers:

```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

if (req.method === 'OPTIONS') {
  return new Response(null, { headers: corsHeaders });
}
```

### Authentication Issues

#### Users can't login

1. Check `JWT_SECRET` matches between `.env` and generated keys
2. Verify `ANON_KEY` is correctly set in frontend
3. Check auth service logs:

```bash
docker logs supabase-auth
```

#### OTP not sending

1. Verify `TEXTLK_API_TOKEN` is set
2. Check edge function logs:

```bash
supabase functions logs send-otp
```

### Performance Issues

#### Slow database queries

```sql
-- Check slow queries
SELECT * FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;

-- Analyze tables
ANALYZE;

-- Check missing indexes
SELECT * FROM pg_stat_user_indexes WHERE idx_scan = 0;
```

#### High memory usage

```bash
# Check container resources
docker stats

# Adjust postgres memory in docker-compose.yml
# Add under supabase-db service:
deploy:
  resources:
    limits:
      memory: 2G
```

---

## Post-Migration Verification

### Checklist

- [ ] Frontend loads correctly
- [ ] User registration works
- [ ] User login works
- [ ] OTP verification works
- [ ] Password reset works
- [ ] Orders can be created
- [ ] File uploads work
- [ ] Admin panel accessible
- [ ] Admin can view orders
- [ ] Admin can update order status
- [ ] SMS notifications send
- [ ] Database backup works
- [ ] Database restore works
- [ ] Gallery images display
- [ ] Shop products display
- [ ] Shop checkout works

### Health Check Script

```bash
#!/bin/bash

echo "=== Health Check ==="

# Check Docker containers
echo "Docker containers:"
docker compose ps

# Check Nginx
echo -e "\nNginx status:"
sudo systemctl status nginx --no-pager

# Check SSL
echo -e "\nSSL certificates:"
sudo certbot certificates

# Check disk space
echo -e "\nDisk space:"
df -h

# Check memory
echo -e "\nMemory usage:"
free -h

# Test API
echo -e "\nAPI health:"
curl -s http://localhost:8000/rest/v1/ | head -c 100

echo -e "\n\n=== Health Check Complete ==="
```

---

## Maintenance

### Regular Tasks

**Daily:**
- Check error logs
- Monitor disk space

**Weekly:**
- Review database size
- Check backup integrity

**Monthly:**
- Update Docker images
- Renew SSL (auto)
- Security updates

### Backup Script

```bash
#!/bin/bash
BACKUP_DIR="/backups/$(date +%Y-%m-%d)"
mkdir -p $BACKUP_DIR

# Database
docker exec supabase-db pg_dump -U postgres postgres > $BACKUP_DIR/db.sql

# Storage
docker cp supabase-storage:/var/lib/storage $BACKUP_DIR/storage

# Compress
tar -czf $BACKUP_DIR.tar.gz $BACKUP_DIR
rm -rf $BACKUP_DIR

# Keep last 7 days
find /backups -name "*.tar.gz" -mtime +7 -delete
```

Add to crontab:
```bash
0 2 * * * /path/to/backup.sh
```

---

## Support

For issues:
1. Check this troubleshooting guide
2. Review Docker/Nginx logs
3. Check Supabase GitHub issues
4. Community Discord

---

*Last updated: February 2026*
