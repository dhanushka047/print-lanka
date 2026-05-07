# 🔧 Self-Hosted Supabase — CORS + 413 Upload Fix

Your errors:

```
Access to fetch at 'https://db.3dprint.iobuilds.com/storage/v1/object/models/...'
from origin 'https://3dprint.iobuilds.com' has been blocked by CORS policy:
No 'Access-Control-Allow-Origin' header is present on the requested resource.

POST .../storage/v1/object/models/... net::ERR_FAILED 413 (Content Too Large)
```

Two separate issues. Fix both on the VPS — **no app code change needed.**

---

## Fix 1 — CORS on Kong (`volumes/api/kong.yml`)

Open `~/iobuilds3ddb/volumes/api/kong.yml` and find the **plugins** section (or add one if missing). Add a global CORS plugin:

```yaml
plugins:
  - name: cors
    config:
      origins:
        - https://3dprint.iobuilds.com
        - https://www.3dprint.iobuilds.com
        - http://localhost:8080
        - http://localhost:5173
      methods:
        - GET
        - POST
        - PUT
        - PATCH
        - DELETE
        - OPTIONS
        - HEAD
      headers:
        - Accept
        - Authorization
        - Content-Type
        - apikey
        - x-client-info
        - x-supabase-api-version
        - prefer
        - range
        - cache-control
        - x-upsert
        - if-match
        - if-none-match
      exposed_headers:
        - Content-Range
        - Content-Length
        - X-Upsert
      credentials: true
      max_age: 3600
      preflight_continue: false
```

If a `cors` plugin already exists, **just add your domains to `origins`** and the missing headers (`prefer`, `range`, `cache-control`, `x-upsert`) to `headers`.

---

## Fix 2 — 413 (Content Too Large)

Two layers can reject big uploads: **Kong** and **Storage**. Set both.

### A) Kong body size

In `docker-compose.yml`, under the `kong:` service `environment:`:

```yaml
  kong:
    environment:
      KONG_NGINX_PROXY_CLIENT_MAX_BODY_SIZE: 100m
      KONG_NGINX_PROXY_CLIENT_BODY_BUFFER_SIZE: 10m
      KONG_NGINX_PROXY_PROXY_READ_TIMEOUT: 600s
      KONG_NGINX_PROXY_PROXY_SEND_TIMEOUT: 600s
```

### B) Storage upload limit

Under the `storage:` service `environment:`:

```yaml
  storage:
    environment:
      FILE_SIZE_LIMIT: '104857600'   # 100 MB in bytes
      UPLOAD_FILE_SIZE_LIMIT: '104857600'
      UPLOAD_FILE_SIZE_LIMIT_STANDARD: '104857600'
```

### C) (Only if you have a host Nginx in front of Kong)

In `/etc/nginx/sites-available/iobuilds` for the `db.3dprint.iobuilds.com` server block:

```nginx
client_max_body_size 100M;
proxy_request_buffering off;
proxy_read_timeout 600s;
proxy_send_timeout 600s;
```

Then `sudo nginx -t && sudo systemctl reload nginx`.

---

## Apply the fix

```bash
cd ~/iobuilds3ddb
docker compose down
docker compose up -d
```

Verify CORS is alive (run from your laptop):

```bash
curl -i -X OPTIONS https://db.3dprint.iobuilds.com/storage/v1/object/models/test \
  -H "Origin: https://3dprint.iobuilds.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization,apikey,content-type,x-upsert"
```

Expected response headers:

```
HTTP/2 204
access-control-allow-origin: https://3dprint.iobuilds.com
access-control-allow-methods: GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD
access-control-allow-headers: ...content-type, x-upsert, ...
access-control-allow-credentials: true
```

If you get those headers back → reload the frontend, re-upload the STL — both errors will be gone.

---

## Common gotchas

- **`origins: ["*"]` does NOT work with `credentials: true`.** You must list each origin explicitly. That's the #1 reason Kong CORS silently fails.
- After editing `kong.yml`, you **must** restart the kong container (`docker compose restart kong`) — Kong only reads it on startup.
- If you still see 413 after raising Kong limits, the **storage** container is rejecting it. Check `docker logs supabase-storage | tail -50`.
- If you see `ERR_BLOCKED_BY_CLIENT` in DevTools, that's also an **ad-blocker** flagging the URL pattern (the `cloudflareinsights.com` line in your screenshot is just that — harmless).
