# BalanceVault

Hackathon demo (synthetic data only). React + Node/Express + PostgreSQL (Prisma) + Redis.

## Run locally
```bash
docker compose up -d                       # Postgres + Redis
cp apps/backend/.env.example apps/backend/.env         # edit JWT_SECRET
cp apps/frontend/.env.example apps/frontend/.env
npm install
npm run db:generate
npm run db:migrate                         # name it "init" when prompted
npm run admin:bootstrap                    # creates first admin from ADMIN_EMAIL/ADMIN_PASSWORD
npm run dev                                # API :4000, web :5173
```
Check: http://localhost:4000/health and /ready

## Deploy
1. **Database** – Neon: create project; put the pooled URL in `DATABASE_URL`, the direct URL in `DIRECT_URL`.
2. **Redis** – Upstash/Render Redis -> `REDIS_URL` (optional; falls back to in-memory limits).
3. **Backend** – Render/Railway web service, root dir `apps/backend`
   - Build: `npm install && npx prisma migrate deploy`
   - Start: `npm start`
   - Env: `DATABASE_URL, DIRECT_URL, REDIS_URL, JWT_SECRET, CORS_ORIGIN=<frontend URL>`
   - Health check path: `/ready`
4. **Admin** – run once with prod env: `npm run admin:bootstrap -w backend`
5. **Frontend** – Vercel/Netlify, root dir `apps/frontend`, build `npm run build`, output `dist`, env `VITE_API_URL=<backend URL>`.
