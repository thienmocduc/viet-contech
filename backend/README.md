# Viet-Contech Backend

Backend stateless cho landing page **vietcontech.com** + dashboard noi bo, viet bang **Hono 4 + TypeScript** chay tren Node 20. Deploy len **Zeni Cloud Compute** (Cloud Run-like, cold start nhanh).

Backend lam cong viec ket noi:

| Lop Zeni Cloud | Vai tro                                   | Endpoint base                              |
| -------------- | ----------------------------------------- | ------------------------------------------ |
| Lop 02 Data Lake | INSERT/SELECT Postgres qua REST API     | `https://l2.viet_contech.zenicloud.io`     |
| Lop 03 AI Engine | Render noi that bang `sd-lora-interior` | `https://l3.viet_contech.zenicloud.io`     |
| Lop 04 Event Bus | Connector Zalo OA, VNPay, SendGrid      | `https://l4.viet_contech.zenicloud.io`     |
| Lop 05 Identity SSO | OIDC OAuth login                     | `https://l5.viet_contech.zenicloud.io`     |

---

## Cau truc thu muc

```
backend/
  package.json
  tsconfig.json
  .env.example
  .gitignore
  src/
    server.ts           # entry, @hono/node-server
    env.ts              # zod validate env
    types.ts            # User, Contact, Booking, AiDesignResponse...
    lib/
      zeni.ts           # helpers fetch goi Lop 02-05
      auth.ts           # ky/verify session JWT, middleware
    routes/
      auth.ts           # /api/auth/{callback,me,logout}
      contact.ts        # /api/contact
      ai.ts             # /api/ai/design
      phongthuy.ts      # /api/phongthuy/log
      dashboard.ts      # /api/dashboard/{customer,sale}
      booking.ts        # /api/booking
      membership.ts     # /api/membership/upgrade
```

---

## Endpoints

| Method | Path                          | Auth   | Mo ta                                                            |
| ------ | ----------------------------- | ------ | ---------------------------------------------------------------- |
| GET    | `/healthz`                    | -      | Health check                                                     |
| POST   | `/api/auth/callback`          | -      | Doi `code` Zeni SSO -> session cookie                            |
| GET    | `/api/auth/me`                | yes    | User info hien tai                                               |
| POST   | `/api/auth/logout`            | -      | Clear cookie                                                     |
| POST   | `/api/contact`                | -      | Form CTA -> Postgres + event Zalo/email                          |
| POST   | `/api/ai/design`              | option | Multipart anh phong + cung menh -> 4 phuong an AI                |
| POST   | `/api/phongthuy/log`          | option | Luu ket qua phong thuy de analytics                              |
| GET    | `/api/dashboard/customer`     | yes    | Designs + bookings + membership                                  |
| GET    | `/api/dashboard/sale`         | sale   | Pipeline + commissions                                           |
| POST   | `/api/booking`                | option | Dat lich tu van -> event Zalo confirm                            |
| POST   | `/api/membership/upgrade`     | yes    | VNPay intent -> tra payUrl + qrUrl                               |

---

## Chay local

```bash
cd backend
cp .env.example .env
# dien gia tri that, JWT_SECRET sinh bang: openssl rand -hex 32

npm install
npm run dev      # tsx watch — hot reload
# Server chay tren http://localhost:8787
# Test: curl http://localhost:8787/healthz
```

Build production:

```bash
npm run build    # tsc -> dist/
npm start        # node dist/server.js
```

Type check khong build:

```bash
npm run typecheck
```

---

## Deploy Zeni Cloud Compute

1. Build image (Zeni Cloud auto-detect Node 20, hoac dung Dockerfile chuan):
   ```bash
   zeni deploy --service viet-contech-backend --port 8787 --min-instances 0 --max-instances 10
   ```
2. Set secret tu `.env` (KHONG commit `.env` len git):
   ```bash
   zeni secret import .env --service viet-contech-backend
   ```
3. Map domain `api.vietcontech.com` -> service.

Service stateless, scale-to-zero: cold start < 500ms nho Hono + Node 20 native fetch.

---

## Logging

- Tat ca handler log JSON 1 dong qua `console.log` (Zeni Cloud parse field `level`, `msg`, `ts`).
- KHONG log secret/PII (email, phone) o log prod — chi log id, role, timestamp.
- Log `auth.login`, `contact.created`, `booking.created`, `ai.design_done`, `membership.intent_created` co the dung lam metric.

---

## TODO sau khi co schema chinh thuc tu Zeni Cloud

- `lib/zeni.ts`: confirm REST shape Lop 02 (PostgREST? GraphQL?), Object Storage upload (PUT direct? presigned?), AI predict response schema.
- `routes/auth.ts`: upsert user vao `viet_contech.users` luc dau tien dang nhap.
- `routes/dashboard.ts`: query thuc te thay vi placeholder `{ count: 0, value: 0 }`.
- `routes/membership.ts`: di chuyen `PRICING` sang bang `pricing_tiers` de ops chinh duoc.
- Webhook `/api/membership/callback` cho VNPay return + verify HMAC `VNPAY_HASH_SECRET`.
