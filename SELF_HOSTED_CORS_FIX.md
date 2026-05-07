# Self-Hosted Upload Fix — keeping `db.3dprint.iobuilds.com`

You want to keep the **separate subdomain** `https://db.3dprint.iobuilds.com` for Supabase.
Frontend stays as-is (`VITE_SUPABASE_URL=https://db.3dprint.iobuilds.com`). **Do not change the frontend.**

The upload errors (`ERR_FAILED`, CORS blocked, `ERR_BLOCKED_BY_CLIENT`) come from **3 layers** on the VPS that all need to allow:
1. Cross-origin requests from `https://3dprint.iobuilds.com`
2. File uploads up to 100 MB

Fix all 3 layers below in order, then restart.

---

## 1. Host Nginx — `db.3dprint.iobuilds.com` server block

Edit `/etc/nginx/sites-available/db.3dprint.iobuilds.com` (or wherever your db vhost lives).

```nginx
server {
    listen 80;
    server_name db.3dprint.iobuilds.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name db.3dprint.iobuilds.com;

    # SSL certs (certbot)
    ssl_certificate     /etc/letsencrypt/live/db.3dprint.iobuilds.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/db.3dprint.iobuilds.com/privkey.pem;

    # ---- CRITICAL: large uploads ----
    client_max_body_size 100M;
    client_body_buffer_size 1M;
    proxy_request_buffering off;
    proxy_buffering off;
    proxy_read_timeout  600s;
    proxy_send_timeout  600s;
    send_timeout        600s;

    # ---- CORS at the edge (so even Kong errors carry CORS) ----
    set $cors_origin "";
    if ($http_origin ~* ^https://(www\.)?3dprint\.iobuilds\.com$) {
        set $cors_origin $http_origin;
    }

    # Preflight short-circuit — never let Kong handle OPTIONS
    if ($request_method = OPTIONS) {
        add_header Access-Control-Allow-Origin  $cors_origin       always;
        add_header Access-Control-Allow-Methods "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD" always;
        add_header Access-Control-Allow-Headers "authorization, x-client-info, apikey, content-type, x-upsert, prefer, range, cache-control, x-supabase-api-version" always;
        add_header Access-Control-Allow-Credentials "true" always;
        add_header Access-Control-Max-Age 3600 always;
        add_header Content-Length 0;
        add_header Content-Type text/plain;
        return 204;
    }

    # Add CORS to every real response (incl. 4xx/5xx from Storage)
    add_header Access-Control-Allow-Origin  $cors_origin always;
    add_header Access-Control-Allow-Credentials "true" always;
    add_header Access-Control-Expose-Headers "content-range, x-total-count" always;

    # WebSockets (realtime)
    proxy_http_version 1.1;
    proxy_set_header Upgrade    $http_upgrade;
    proxy_set_header Connection $http_upgrade;
    proxy_set_header Host       $host;
    proxy_set_header X-Real-IP  $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    location / {
        proxy_pass http://127.0.0.1:8000;   # Kong port (adjust if different)
    }
}
```

Reload:
```bash
sudo nginx -t && sudo systemctl reload nginx
```

---

## 2. Kong (`docker-compose.yml`)

Under the `kong` service `environment:` add:

```yaml
KONG_NGINX_PROXY_CLIENT_MAX_BODY_SIZE: 100m
KONG_NGINX_PROXY_CLIENT_BODY_BUFFER_SIZE: 10m
KONG_NGINX_PROXY_PROXY_READ_TIMEOUT: 600s
KONG_NGINX_PROXY_PROXY_SEND_TIMEOUT: 600s
```

---

## 3. Storage (`docker-compose.yml`)

Under the `storage` service `environment:`:

```yaml
FILE_SIZE_LIMIT: 104857600
UPLOAD_FILE_SIZE_LIMIT: 104857600
UPLOAD_FILE_SIZE_LIMIT_STANDARD: 104857600
```

Also confirm in your Studio → Storage → bucket `models` that **File size limit** is ≥ 100 MB (per-bucket setting overrides global).

---

## 4. Apply

```bash
cd /path/to/supabase
docker compose up -d kong storage
docker compose restart kong storage
```

---

## 5. Verify

```bash
# Should print: access-control-allow-origin: https://3dprint.iobuilds.com
curl -I -X OPTIONS https://db.3dprint.iobuilds.com/storage/v1/object/models/test \
  -H "Origin: https://3dprint.iobuilds.com" \
  -H "Access-Control-Request-Method: POST"
```

If you see `access-control-allow-origin` echoed → CORS is fixed.
Then try a real upload from the site. If it still 413s → the **bucket** size limit is the cap (fix in Studio).

---

## About `ERR_BLOCKED_BY_CLIENT`

That's **your browser's ad-blocker** (uBlock/Brave) blocking the request because the URL matches a tracking-like pattern (`pending_…`). Test in **Incognito with extensions disabled** — it will go through.
