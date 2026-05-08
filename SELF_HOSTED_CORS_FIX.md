# Self-Hosted CORS Fix — duplicate `Access-Control-Allow-Origin` header

## The error

```
The 'Access-Control-Allow-Origin' header contains multiple values
'*, https://3dprint.iobuilds.com', but only one is allowed.
```

## Why it happens

Two layers are **both** adding CORS headers:

1. **Kong / GoTrue (Supabase)** already adds `Access-Control-Allow-Origin: *`
2. **Host Nginx** adds `Access-Control-Allow-Origin: https://3dprint.iobuilds.com`

The browser sees both joined as one header (`*, https://3dprint.iobuilds.com`) and rejects it.

You must pick **ONE** layer to handle CORS. The cleanest is to let Nginx own it and strip whatever Kong sends.

---

## Fix — `/etc/nginx/sites-available/db.3dprint.iobuilds.com`

Replace the **entire** HTTPS `server { ... }` block with this:

```nginx
server {
    listen 80;
    server_name db.3dprint.iobuilds.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name db.3dprint.iobuilds.com;

    ssl_certificate     /etc/letsencrypt/live/db.3dprint.iobuilds.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/db.3dprint.iobuilds.com/privkey.pem;

    # ---- Large uploads ----
    client_max_body_size     100M;
    client_body_buffer_size  1M;
    proxy_request_buffering  off;
    proxy_buffering          off;
    proxy_read_timeout       600s;
    proxy_send_timeout       600s;
    send_timeout             600s;

    # WebSockets
    proxy_http_version 1.1;
    proxy_set_header Upgrade           $http_upgrade;
    proxy_set_header Connection        $http_upgrade;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # ---- CORS allow-list ----
    set $cors_origin "";
    if ($http_origin ~* ^https?://(www\.)?3dprint\.iobuilds\.com$) {
        set $cors_origin $http_origin;
    }
    if ($http_origin ~* ^https?://localhost(:[0-9]+)?$) {
        set $cors_origin $http_origin;
    }

    # ---- Preflight short-circuit (never reach Kong) ----
    if ($request_method = OPTIONS) {
        add_header Access-Control-Allow-Origin      $cors_origin always;
        add_header Access-Control-Allow-Methods     "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD" always;
        add_header Access-Control-Allow-Headers     "authorization, x-client-info, apikey, content-type, x-upsert, prefer, range, cache-control, x-supabase-api-version" always;
        add_header Access-Control-Allow-Credentials "true" always;
        add_header Access-Control-Max-Age           3600 always;
        add_header Content-Length 0;
        add_header Content-Type   text/plain;
        return 204;
    }

    location / {
        proxy_pass http://127.0.0.1:8000;   # Kong

        # 🔑 STRIP Kong/GoTrue's CORS headers BEFORE we add our own.
        # Without this you get duplicates: "*, https://3dprint.iobuilds.com"
        proxy_hide_header Access-Control-Allow-Origin;
        proxy_hide_header Access-Control-Allow-Credentials;
        proxy_hide_header Access-Control-Allow-Methods;
        proxy_hide_header Access-Control-Allow-Headers;
        proxy_hide_header Access-Control-Expose-Headers;
        proxy_hide_header Access-Control-Max-Age;

        # Now add OUR CORS headers (single source of truth)
        add_header Access-Control-Allow-Origin      $cors_origin always;
        add_header Access-Control-Allow-Credentials "true" always;
        add_header Access-Control-Expose-Headers    "content-range, content-length, x-upsert" always;
    }
}
```

The two critical pieces:

1. **`proxy_hide_header Access-Control-Allow-Origin;`** — drops the `*` coming back from GoTrue/Kong.
2. **`add_header ... always;`** — adds the single correct origin.

## Apply

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## Verify

```bash
curl -I -X OPTIONS https://db.3dprint.iobuilds.com/auth/v1/token?grant_type=password \
  -H "Origin: https://3dprint.iobuilds.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization,content-type,apikey"
```

You should see **exactly one** line:

```
access-control-allow-origin: https://3dprint.iobuilds.com
```

Not `*, https://...`. Then login will work.

---

## Option B (alternative) — let Kong do CORS, remove Nginx CORS

If you'd rather have Kong handle CORS, then in `/etc/nginx/sites-available/db.3dprint.iobuilds.com` **delete every `add_header Access-Control-*` line** from the Nginx config and configure the Kong `cors` plugin in `kong.yml` with:

```yaml
plugins:
  - name: cors
    config:
      origins:
        - https://3dprint.iobuilds.com
      credentials: true
      methods: [GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD]
      headers: [authorization, x-client-info, apikey, content-type, x-upsert, prefer, range, cache-control, x-supabase-api-version]
      max_age: 3600
```

Then `docker compose restart kong`.

**Don't do both.** Pick A or B.
