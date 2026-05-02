# Viet-Contech Backend

API stateless cho landing page **vietcontech.com** + dashboard noi bo. Viet bang **Hono 4 + TypeScript** chay tren **Node 20**, persistence local bang **better-sqlite3** (de tray Postgres ve sau), phia provider goi qua **Zeni Cloud** khi production.

---

## Stack

- **Runtime**: Node 20 (LTS, native fetch, top-level await)
- **Framework**: Hono 4 (router sieu nhe, ~14kb gzipped, edge-ready)
- **Language**: TypeScript 5.6 (strict mode + ESM `nodenext`)
- **DB local**: `better-sqlite3` (synchronous, zero config, dat tai `/data/vct.db`)
- **DB prod**: Postgres qua Zeni Cloud Lop 02 (REST API)
- **Auth**: JWT HS256 ky bang `jose`, set HttpOnly cookie
- **Validation**: `zod` cho moi request body
- **Build**: `tsc` -> `dist/`
- **Deploy**: Docker multi-stage -> Zeni Cloud / Railway / Fly.io / VPS

---

## Cau truc thu muc

```
backend/
├── package.json            # scripts: dev, build, start, typecheck, test
├── tsconfig.json           # strict + nodenext + outDir dist
├── Dockerfile              # multi-stage builder + runner
├── .dockerignore
├── railway.toml            # config Railway (volume + healthcheck)
├── fly.toml                # config Fly.io (region sin, 256mb)
├── .env.example            # template env, copy thanh .env
├── README.md               # file nay
├── src/
│   ├── server.ts           # entry, @hono/node-server
│   ├── env.ts              # zod validate env
│   ├── types.ts            # User, Contact, Booking, AiDesignResponse...
│   ├── lib/
│   │   ├── zeni.ts         # helpers fetch goi Lop 02-05
│   │   └── auth.ts         # ky/verify session JWT, middleware
│   └── routes/
│       ├── auth.ts         # /api/auth/{callback,me,logout}
│       ├── contact.ts      # /api/contact
│       ├── ai.ts           # /api/ai/design
│       ├── phongthuy.ts    # /api/phongthuy/log
│       ├── dashboard.ts    # /api/dashboard/{customer,sale}
│       ├── booking.ts      # /api/booking
│       └── membership.ts   # /api/membership/upgrade
└── db/
    └── migrations/
        └── 001_init.sql    # schema khoi tao SQLite
```

---

## Cai dat va chay local

```bash
cd backend

# 1. Cai dependencies
npm install

# 2. Tao file .env tu template
cp .env.example .env

# 3. Sinh JWT_SECRET du dai (32 bytes hex = 64 ki tu)
#    Linux/Mac:
openssl rand -hex 32
#    Windows PowerShell:
#    [Convert]::ToHexString((New-Object byte[] 32 | ForEach-Object { Get-Random -Maximum 256 }))

# 4. Mo .env, dien JWT_SECRET vua sinh + cac key Zeni Cloud (neu PROVIDER_MODE=zeni)

# 5. Chay dev (hot reload)
npm run dev
# Server len http://localhost:8787

# 6. Test smoke
curl http://localhost:8787/healthz
```

Build production local:

```bash
npm run build       # tsc -> dist/
npm start           # node dist/server.js
```

Type check khong build:

```bash
npm run typecheck
```

---

## Endpoints

| # | Method | Path                       | Auth   | Mo ta                                                |
| - | ------ | -------------------------- | ------ | ---------------------------------------------------- |
| 1 | GET    | `/healthz`                 | -      | Health check (uptime + db status)                    |
| 2 | POST   | `/api/auth/callback`       | -      | Doi `code` Zeni SSO -> session cookie HttpOnly       |
| 3 | GET    | `/api/auth/me`             | yes    | Tra user info hien tai tu session                    |
| 4 | POST   | `/api/auth/logout`         | -      | Clear session cookie                                 |
| 5 | POST   | `/api/contact`             | -      | Form CTA -> luu Postgres + push event Zalo/email     |
| 6 | POST   | `/api/ai/design`           | option | Multipart anh phong + cung menh -> 4 phuong an AI    |
| 7 | POST   | `/api/phongthuy/log`       | option | Luu ket qua phong thuy de analytics                  |
| 8 | GET    | `/api/dashboard/customer`  | yes    | Designs + bookings + membership cua user             |
| 9 | GET    | `/api/dashboard/sale`      | sale   | Pipeline + commissions cho role sale/admin           |
| 10| POST   | `/api/booking`             | option | Dat lich tu van -> push event Zalo confirm           |
| 11| POST   | `/api/membership/upgrade`  | yes    | Tao VNPay intent -> tra payUrl + qrUrl               |

---

## Test smoke

File `test.sh` (neu chua co thi tao) goi tat ca endpoint chinh:

```bash
bash test.sh
# Hoac chay tay tung cai:
curl http://localhost:8787/healthz
curl -X POST http://localhost:8787/api/contact \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","phone":"0900000000","need":"thiet-ke"}'
```

CI workflow `.github/workflows/test-be.yml` se chay `npm run typecheck` + `npm run build` + `npm test` moi khi co PR vao backend/.

---

## Deploy

### Option 1 — Zeni Cloud (chinh thuc, khi unblock)

Backend ban dau viet de chay tren Zeni Cloud Compute (Cloud Run-like, scale-to-zero).

1. Login Zeni Cloud Console -> chon project `viet_contech`
2. Vao **Compute** -> **Create Service**
   - Source: GitHub repo `thienmocduc/Viet-Contech` branch `main`, root `/backend`
   - Runtime: Auto-detect Node 20 (hoac chon "Use Dockerfile")
   - Port: `8787`
   - Min instances: `0` (scale to zero)
   - Max instances: `10`
3. Sang tab **Secrets** -> import tu file `.env` local
4. Sang tab **Networking** -> map domain `api.vietcontech.com`
5. Click **Deploy** -> verify https://api.vietcontech.com/healthz

CLI tuong duong:

```bash
zeni deploy --service viet-contech-backend --port 8787 --min-instances 0 --max-instances 10
zeni secret import .env --service viet-contech-backend
zeni domain map api.vietcontech.com viet-contech-backend
```

### Option 2 — Railway (fallback nhanh nhat)

Free tier: $5 credit/thang, $0 setup, deploy tu Docker.

```bash
# Cai CLI: npm i -g @railway/cli
cd backend
railway login
railway init                                     # tao project
railway up                                       # build + deploy bang Dockerfile
railway variables set JWT_SECRET=$(openssl rand -hex 32)
railway variables set FRONTEND_URL=https://vietcontech.com
railway variables set DB_PATH=/data/vct.db
railway variables set PROVIDER_MODE=zeni         # hoac local
# Set them ZENI_*, ZALO_*, VNPAY_*, SENDGRID_*
railway domain                                   # tao subdomain *.up.railway.app
```

Volume `/data` 1GB tu dong tao theo `railway.toml`. Healthcheck `/healthz` da config.

### Option 3 — Fly.io (alt fallback)

Free tier: 3 shared-cpu-1x machines + 3GB volume. Region `sin` gan VN nhat.

```bash
# Cai CLI: curl -L https://fly.io/install.sh | sh
cd backend
fly auth login
fly launch --config fly.toml --no-deploy        # tao app, KHONG deploy ngay
fly volumes create vct_data --region sin --size 1
fly secrets set JWT_SECRET=$(openssl rand -hex 32) \
                 FRONTEND_URL=https://vietcontech.com \
                 PROVIDER_MODE=zeni
# Set them ZENI_*, ZALO_*, VNPAY_*, SENDGRID_* tuong tu
fly deploy
fly status                                      # verify machine UP
fly logs                                        # xem realtime
```

### Option 4 — Self-host VPS Ubuntu (Docker)

Phu hop cho VPS rieng (Vultr, DigitalOcean, Linode, OVH).

```bash
# Tren VPS:
git clone https://github.com/thienmocduc/Viet-Contech.git
cd Viet-Contech/backend
cp .env.example .env && vim .env               # dien gia tri that

# Build image
docker build -t viet-contech-backend .

# Tao volume persistence cho SQLite
docker volume create vct_data

# Run container
docker run -d \
  --name viet-contech-api \
  --restart unless-stopped \
  -p 8787:8787 \
  --env-file .env \
  -v vct_data:/app/data \
  viet-contech-backend

# Verify
curl http://localhost:8787/healthz
docker logs viet-contech-api
```

Reverse proxy bang Nginx hoac Caddy de co HTTPS:

```nginx
server {
  listen 443 ssl http2;
  server_name api.vietcontech.com;
  ssl_certificate /etc/letsencrypt/live/api.vietcontech.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/api.vietcontech.com/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

---

## Migration sau: SQLite -> Postgres

Khi traffic vuot ~10k req/day hoac can multi-instance, swap SQLite sang Postgres:

1. **Switch driver** trong `src/lib/db.ts`:
   - Thay `better-sqlite3` bang `pg` (node-postgres) hoac `postgres` (porsager)
   - Dat connection string vao `DATABASE_URL`
2. **Convert schema**: `db/migrations/001_init.sql` co the chay thang tren Postgres voi vai chinh sua nho:
   - `INTEGER PRIMARY KEY AUTOINCREMENT` -> `BIGSERIAL PRIMARY KEY`
   - `TEXT` giu nguyen
   - `INTEGER` cho boolean -> `BOOLEAN`
   - `datetime('now')` -> `NOW()`
3. **Dump du lieu** tu SQLite local sang Postgres bang `pgloader` hoac script Node:
   ```bash
   pgloader sqlite:///data/vct.db postgresql://user:pass@host/vct
   ```
4. **Doi env**: `PROVIDER_MODE=postgres`, them `DATABASE_URL`
5. **Bo volume mount** `/data` (khong can SQLite file nua)
6. **Test lai healthcheck** + smoke endpoints

Ke hoach dai han: dung **Zeni Cloud Lop 02 Postgres** -> chi can set `PROVIDER_MODE=zeni` va cac `ZENI_L2_*`, code da ho tro san.

---

## Security checklist (truoc khi go live production)

- [ ] **Rotate `JWT_SECRET`** tu `replace-with-...` sang `openssl rand -hex 32` thuc su
- [ ] **HTTPS bat buoc**: deploy sau reverse proxy (Caddy/Nginx) hoac platform tu cung cap (Railway/Fly auto SSL)
- [ ] **CORS_ORIGINS** chi cho phep `https://vietcontech.com` o production (KHONG de `*` hoac `localhost`)
- [ ] **Rate limit** o tang reverse proxy (vi du Nginx `limit_req_zone`) tren `/api/contact`, `/api/ai/design` (chong spam)
- [ ] **Cookie flags**: `HttpOnly`, `Secure`, `SameSite=Strict` o production
- [ ] **Helmet headers** (CSP, X-Frame-Options, X-Content-Type-Options) — them middleware Hono `secureHeaders`
- [ ] **Validate input bang `zod`** o moi route — KHONG bo qua
- [ ] **Logging KHONG chua PII**: che email/phone bang hash hoac mask `o***@example.com`
- [ ] **Rotate Zeni keys + VNPay hash secret + Zalo token** moi 90 ngay
- [ ] **Backup `/data/vct.db`** dinh ky (cron daily -> S3-compatible storage) khi con dung SQLite
- [ ] **Monitoring**: dat alert healthcheck fail -> Telegram/Discord webhook
- [ ] **Dependabot** bat tren GitHub repo de auto PR security fix

---

## Ghi chu pho bien

- **Cold start Hono + Node 20**: ~300-500ms tren scale-to-zero (Railway/Fly/Zeni)
- **SQLite limit**: chi 1 instance write — neu can scale ngang phai chuyen Postgres
- **Volume mount**: tat ca platform deu support `/data` — code phai doc env `DB_PATH`
- **Healthcheck**: `/healthz` tra `200 { ok: true }` neu DB connect duoc, `503` neu fail

---

## TODO sau khi co schema chinh thuc tu Zeni Cloud

- `lib/zeni.ts`: confirm REST shape Lop 02 (PostgREST? GraphQL?), Object Storage upload, AI predict response schema
- `routes/auth.ts`: upsert user vao `viet_contech.users` luc dau tien dang nhap
- `routes/dashboard.ts`: query thuc te thay vi placeholder
- `routes/membership.ts`: di chuyen `PRICING` sang bang `pricing_tiers`
- Webhook `/api/membership/callback` cho VNPay return + verify HMAC `VNPAY_HASH_SECRET`
- Them `vitest` + smoke test cho moi endpoint
