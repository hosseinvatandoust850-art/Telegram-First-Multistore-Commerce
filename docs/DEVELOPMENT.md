# مستندات توسعه‌دهندگان

این راهنما برای توسعه‌دهندگانی است که می‌خواهند پروژه را توسعه دهند یا سفارشی کنند.

---

## 🏗️ معماری پروژه

### نمای کلی

```
┌─────────────────────────────────────────────────────┐
│                    Client Layer                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │   Telegram  │  │    Web UI   │  │  Admin Panel │  │
│  │     Bot     │  │   (Hono)    │  │   (React)   │  │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  │
└─────────┼────────────────┼────────────────┼─────────┘
          │                │                │
┌─────────┴────────────────┴────────────────┴─────────┐
│                   Hono Routes                        │
│  ┌──────────────────────────────────────────────┐   │
│  │            API Endpoints                      │   │
│  │  /api/auth, /api/store, /api/products, ...   │   │
│  └──────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────┘
                         │
┌────────────────────────┴────────────────────────────┐
│                  Services Layer                     │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌─────────────┐  │
│  │ Store  │ │ Product│ │ Order  │ │ Payment     │  │
│  │ Service│ │ Service│ │ Service│ │ Service     │  │
│  └────────┘ └────────┘ └────────┘ └─────────────┘  │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌─────────────┐  │
│  │Telegram│ │  TON   │ │Storage │ │ Backup      │  │
│  │ Service│ │ Service│ │ Service│ │ Service     │  │
│  └────────┘ └────────┘ └────────┘ └─────────────┘  │
└────────────────────────┬────────────────────────────┘
                         │
┌────────────────────────┴────────────────────────────┐
│                   Data Layer                        │
│  ┌──────────────────┐  ┌─────────────────────────┐  │
│  │   PostgreSQL     │  │   S3 / Local Storage    │  │
│  │   (Connection    │  │   (File Uploads,        │  │
│  │    Pool + SQL)   │  │    Backups)             │  │
│  └──────────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### ساختار پوشه‌ها

```
/
├── src/
│   ├── config/          # پیکربندی و اعتبارسنجی محیط
│   ├── db/              # اتصال دیتابیس و helpers
│   ├── lib/             # کتابخانه‌های کمکی
│   ├── routes/          # مسیرهای HTTP (Hono)
│   ├── services/        # منطق کسب‌وکار
│   ├── views/           # قالب‌های JSX
│   └── index.ts         # نقطه ورود اصلی
├── scripts/             # اسکریپت‌ها (migrate, seed)
├── migrations/          # فایل‌های SQL مایگریشن
├── tests/               # تست‌های واحد
├── docs/                # مستندات
└── dist/                # خروجی کامپایل (production)
```

---

## 🛠️ راه‌اندازی محیط توسعه

### پیش‌نیازها

- Node.js >= 20
- PostgreSQL >= 14
- npm یا pnpm
- Git

### نصب و اجرا

```bash
# کلون کردن مخزن
git clone <repo-url>
cd Telegram-First-Multistore-Commerce

# نصب وابستگی‌ها
npm install

# کپی فایل محیط
cp .env.example .env

# ویرایش .env و تنظیم متغیرها
# حداقل: DATABASE_URL, APP_SECRET

# اجرای مایگریشن‌ها
npm run migrate

# شروع سرور توسعه
npm run dev
```

### دستورات مفید

```bash
# Type checking
npm run typecheck

# Linting
npm run lint

# Testing
npm test

# Build for production
npm run build

# Run production server
npm run start

# Run background worker
npm run start:worker

# Seed demo data (DEV only)
npm run db:seed

# Environment check
npm run env:check
```

---

## 📦 پایگاه داده

### مایگریشن‌ها

مایگریشن‌ها فایل‌های SQL خالص در پوشه `migrations/` هستند.

#### ساختار فایل مایگریشن

```sql
-- migrations/001-create-stores.sql
-- Adds stores table for multi-store support

CREATE TABLE IF NOT EXISTS "Store" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  "userId" UUID REFERENCES "User"(id),
  "createdAt" TIMESTAMPTZ DEFAULT now(),
  "updatedAt" TIMESTAMPTZ DEFAULT now()
);

INSERT INTO _migrations (version, description)
VALUES ('001', 'create-stores');
```

#### اجرای مایگریشن

```bash
# Development
npm run migrate

# Production
node dist/scripts/migrate.js
```

#### قوانین مایگریشن

1. ✅ هرگز فایل قدیمی را ویرایش نکنید
2. ✅ فایل جدید با شماره بعدی بسازید
3. ✅ از تراکنش استفاده کنید
4. ✅ forward-only باشد
5. ✅ idempotent باشد

---

## 🔌 API Reference

### احراز هویت

#### POST `/api/auth/login`

```typescript
// Request
{
  email: string;
  password: string;
}

// Response
{
  ok: true;
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
}
```

#### POST `/api/auth/logout`

```typescript
// Headers
Authorization: Bearer <token>

// Response
{
  ok: true;
}
```

### فروشگاه‌ها

#### GET `/api/stores`

```typescript
// Headers
Authorization: Bearer <token>

// Response
{
  ok: true;
  stores: Store[];
}
```

#### POST `/api/stores`

```typescript
// Headers
Authorization: Bearer <token>

// Request
{
  name: string;
  slug?: string;
  locale?: string;
  currency?: string;
}

// Response
{
  ok: true;
  store: Store;
}
```

### محصولات

#### GET `/api/products`

```typescript
// Query params
?storeId=<uuid>&category=<string>&limit=20&offset=0

// Response
{
  ok: true;
  products: Product[];
  total: number;
}
```

#### POST `/api/products`

```typescript
// Headers
Authorization: Bearer <token>

// Request (multipart/form-data)
{
  name: string;
  description: string;
  price: number;
  categoryId: string;
  images: File[];
  // ...
}

// Response
{
  ok: true;
  product: Product;
}
```

### سفارش‌ها

#### GET `/api/orders`

```typescript
// Query params
?status=PENDING&limit=20

// Response
{
  ok: true;
  orders: Order[];
}
```

#### PATCH `/api/orders/:id/status`

```typescript
// Params
id: string

// Request
{
  status: OrderStatus;
  note?: string;
}

// Response
{
  ok: true;
  order: Order;
}
```

### تلگرام

#### POST `/api/telegram/webhook/:storeSecret`

```typescript
// Params
storeSecret: string

// Body
Update from Telegram

// Response
200 OK
```

#### POST `/api/admin/webhook/register`

```typescript
// Headers
Authorization: Bearer <token>

// Response
{
  ok: true;
  webhookUrl: string;
  registered: boolean;
}
```

---

## 🧪 تست‌نویسی

### اجرای تست‌ها

```bash
# همه تست‌ها
npm test

# با watch mode
npm test -- --watch

# Coverage
npm test -- --coverage

# تست خاص
npm test -- crypto.test.ts
```

### مثال تست

```typescript
// tests/crypto.test.ts
import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../src/lib/crypto';

describe('crypto', () => {
  it('should hash and verify password', async () => {
    const password = 'test123';
    const hash = await hashPassword(password);
    
    expect(hash).not.toBe(password);
    expect(await verifyPassword(password, hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });
});
```

---

## 🔧 سفارشی‌سازی

### افزودن سرویس جدید

```typescript
// src/services/myService.ts
import { query } from '../db/pool.js';

export interface MyEntity {
  id: string;
  name: string;
  createdAt: Date;
}

export async function createMyEntity(data: Partial<MyEntity>): Promise<MyEntity> {
  const result = await query(
    'INSERT INTO "MyEntity" (name) VALUES ($1) RETURNING *',
    [data.name]
  );
  return result.rows[0] as MyEntity;
}
```

### افزودن مسیر جدید

```typescript
// src/routes/myRoutes.ts
import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';

export const myRoutes = new Hono();

myRoutes.get('/hello', (c) => {
  return c.json({ message: 'Hello World' });
});

myRoutes.post('/protected', authMiddleware, async (c) => {
  const body = await c.req.json();
  // process request
  return c.json({ ok: true });
});
```

### ثبت مسیر در اپلیکیشن

```typescript
// src/index.ts
import { myRoutes } from './routes/myRoutes.js';

app.route('/api/my', myRoutes);
```

---

## 📊 لاگ‌گیری

### استفاده از Logger

```typescript
import { logger } from '../lib/logger.js';

logger.info('Starting application', { port: 8080 });
logger.warn('Low disk space', { available: '1GB' });
logger.error('Database connection failed', { error });
logger.debug('Request received', { path: '/api/test' });
```

### سطوح لاگ

- `debug`: اطلاعات دقیق دیباگ
- `info`: رویدادهای عادی
- `warn`: هشدارها
- `error`: خطاها

---

## 🔐 امنیت در توسعه

### Validation ورودی‌ها

```typescript
import { z } from 'zod';

const createProductSchema = z.object({
  name: z.string().min(1).max(120),
  price: z.number().positive(),
  description: z.string().optional(),
});

app.post('/api/products', async (c) => {
  const body = await c.req.json();
  const parsed = createProductSchema.safeParse(body);
  
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }
  
  // process valid data
});
```

### محافظت در برابر SQL Injection

```typescript
// ✅ درست - Parameterized query
await query('SELECT * FROM users WHERE id = $1', [userId]);

// ❌ غلط - String interpolation
await query(`SELECT * FROM users WHERE id = ${userId}`);
```

### مدیریت خطا

```typescript
try {
  await someOperation();
} catch (error) {
  logger.error('Operation failed', { error });
  return c.json({ 
    ok: false, 
    error: 'Something went wrong' 
  }, 500);
}
```

---

## 🚀 استقرار

### Docker

```bash
# Build image
docker build -t my-app .

# Run container
docker run -p 8080:8080 \
  -e DATABASE_URL=... \
  -e APP_SECRET=... \
  my-app
```

### Railway

1. اتصال به GitHub
2. افزودن PostgreSQL
3. تنظیم Variables
4. Deploy خودکار

### متغیرهای ضروری تولید

```bash
NODE_ENV=production
DATABASE_URL=postgresql://...
APP_SECRET=<random-64-chars>
APP_URL=https://your-domain.com
ENABLE_INLINE_WORKER=true
```

---

## 📈 مانیتورینگ و عملکرد

### Health Check

```typescript
// GET /health
{
  ok: true;
  checks: {
    database: { healthy: true, latencyMs: 5 },
    storage: { healthy: true, type: 's3' },
    worker: { healthy: true, lastRun: '...' }
  };
}
```

### Metrics

برای اضافه کردن metrics:

```typescript
import { promClient } from 'prom-client';

const requestCounter = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'path', 'status'],
});

app.use('*', async (c, next) => {
  await next();
  requestCounter.inc({
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
  });
});
```

---

## 📚 منابع بیشتر

### مستندات رسمی

- [Hono](https://hono.dev/)
- [PostgreSQL](https://www.postgresql.org/docs/)
- [Node.js](https://nodejs.org/docs/)
- [TypeScript](https://www.typescriptlang.org/docs/)

### کتابخانه‌های استفاده‌شده

- `hono` - Web framework
- `pg` - PostgreSQL client
- `zod` - Validation
- `bcrypt` - Password hashing
- `jsonwebtoken` - JWT
- `node-cron` - Scheduling
- `@aws-sdk/client-s3` - S3 storage

---

## 🤝 مشارکت

### ارسال Pull Request

1. Fork پروژه
2. Branch جدید بسازید (`git checkout -b feature/my-feature`)
3. تغییرات را commit کنید (`git commit -am 'Add feature'`)
4. Push کنید (`git push origin feature/my-feature`)
5. Pull Request باز کنید

### استانداردهای کد

- ✅ TypeScript strict mode
- ✅ ESLint rules
- ✅ Test coverage > 80%
- ✅ Document public APIs
- ✅ Use meaningful names

---

## ❓ سوالات متداول

### چگونه می‌توانم یک ویژگی جدید اضافه کنم؟

1. Issue مرتبط را بررسی کنید
2. طراحی را مشخص کنید
3. Branch جدید بسازید
4. کد بزنید و تست کنید
5. PR ارسال کنید

### چگونه باگ گزارش دهم؟

1. Issue جدید باز کنید
2. توضیح کامل بنویسید
3. مراحل تکرار را ذکر کنید
4. لاگ‌ها را ضمیمه کنید

### چگونه می‌توانم کمک کنم؟

- 🐛 گزارش باگ
- 💡 پیشنهاد ویژگی
- 📚 بهبود مستندات
- 🔧 ارسال PR

---

موفق باشید! 🚀
