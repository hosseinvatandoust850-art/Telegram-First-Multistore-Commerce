# نکات امنیتی

این سند نکات امنیتی مهم برای راه‌اندازی و استفاده ایمن از پلتفرم را توضیح می‌دهد.

---

## 🔐 امنیت در یک نگاه

### اصول پایه

1. **هرگز اسرار را commit نکنید**
2. **از HTTPS همیشه استفاده کنید**
3. **رمزهای عبور قوی انتخاب کنید**
4. **به‌روزرسانی‌ها را انجام دهید**
5. **پشتیبان بگیرید**

---

## 🔑 مدیریت اسرار (Secrets)

### متغیرهای حساس

این متغیرها هرگز نباید در گیت‌هاب commit شوند:

| متغیر | حساسیت | توضیح |
|-------|--------|-------|
| `APP_SECRET` | 🔴 بسیار بالا | امضای توکن‌های JWT |
| `DATABASE_URL` | 🔴 بسیار بالا | دسترسی کامل به دیتابیس |
| `TELEGRAM_BOT_TOKEN` | 🟠 بالا | دسترسی به ربات تلگرام |
| `TON_API_KEY` | 🟠 بالا | دسترسی به API پرداخت |
| `S3_ACCESS_KEY_ID` | 🟠 بالا | دسترسی به فضای ذخیره‌سازی |
| `S3_SECRET_ACCESS_KEY` | 🔴 بسیار بالا | دسترسی کامل به S3 |
| `SMTP_PASS` | 🟠 بالا | رمز عبور ایمیل |

### روش‌های ایمن ذخیره‌سازی

#### ✅ در Railway

1. از تب **Variables** استفاده کنید
2. مقادیر را مستقیماً در پنل Railway وارد کنید
3. از Referenceها استفاده کنید:
   ```
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   ```

#### ✅ در توسعه محلی

1. فایل `.env` بسازید
2. آن را در `.gitignore` قرار دهید
3. هرگز commit نکنید

```bash
# .gitignore
.env
.env.local
.env.*.local
```

#### ❌ هرگز این کارها را نکنید

- ❌ Commit کردن `.env` با مقادیر واقعی
- ❌ ارسال اسرار در چت‌ها
- ❌ ذخیره اسرار در کد منبع
- ❌ لاگ کردن مقادیر حساس

---

## 🔒 احراز هویت و جلسات

### توکن‌های JWT

#### تنظیمات ایمن

```
SESSION_TTL_SECONDS=604800  # 7 روز
APP_SECRET=<random-64-chars>
```

#### تولید APP_SECRET ایمن

```bash
# روش ۱: OpenSSL
openssl rand -hex 32

# روش ۲: Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# روش ۳: آنلاین
# به سایت generate-secret.com بروید
```

#### بهترین روش‌ها

- ✅ حداقل ۳۲ بایت (۶۴ کاراکتر هگز)
- ✅ کاملاً تصادفی
- ✅ یکتا برای هر محیط
- ✅ تغییر منظم (هر ۶ ماه)

### مدیریت جلسات

#### انقضا خودکار

- جلسات بعد از `SESSION_TTL_SECONDS` منقضی می‌شوند
- کاربران باید دوباره login کنند

#### Logout ایمن

1. توکن را در کلاینت پاک کنید
2. در سرور blacklist کنید (اگر نیاز است)
3. به کاربر تأیید دهید

---

## 🌐 امنیت شبکه

### HTTPS اجباری

#### چرا HTTPS؟

- ✅ رمزنگاری داده‌ها
- ✅ احراز هویت سرور
- ✅ محافظت در برابر شنود
- ✅ الزام Telegram Webhooks

#### تنظیمات

```
TELEGRAM_WEBHOOK_HTTPS=true
```

#### بررسی SSL

در Railway:
- ✅ SSL به‌صورت خودکار صادر می‌شود
- ✅ تمدید خودکار
- ⚠️ برای دامنه اختصاصی، DNS را درست تنظیم کنید

### محدودیت دسترسی

#### IP Whitelist (برای پنل مدیریت)

اگر امکان دارد:

```
ADMIN_ALLOWED_IPS=192.168.1.1,10.0.0.1
```

#### Rate Limiting

برای جلوگیری از حملات Brute Force:

- حداکثر ۵ تلاش login در دقیقه
- قفل موقت بعد از ۱۰ تلاش ناموفق

---

## 🗄️ امنیت دیتابیس

### اتصال ایمن

#### در Railway

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

Railway به‌صورت خودکار:
- ✅ اتصال داخلی ایمن
- ✅ رمزنگاری در ترانزیت
- ✅ ایزوله از اینترنت عمومی

#### در توسعه محلی

```
DATABASE_URL=postgresql://localhost:5432/db
```

- ✅ فقط localhost
- ✅ رمز عبور قوی
- ✅ دسترسی محدود

### پشتیبان‌گیری ایمن

#### رمزنگاری پشتیبان

```bash
# قبل از آپلود به S3
gpg --cipher-algo AES256 --symmetric backup.sql
```

#### محل ذخیره‌سازی

- ✅ S3 با دسترسی محدود
- ✅ Volume ایزوله
- ❌ هرگز روی همان سرور اصلی

#### دسترسی به پشتیبان

- فقط Super Admin
- لاگ تمام دسترسی‌ها
- حذف پس از استفاده

---

## 📁 امنیت فایل‌ها

### آپلود ایمن

#### محدودیت‌ها

```
MAX_UPLOAD_BYTES=26214400  # 25MB
ALLOWED_FILE_TYPES=image/*,application/pdf
```

#### بررسی فایل‌ها

1. بررسی نوع فایل (MIME type)
2. بررسی اندازه
3. اسکن ویروس (اختیاری)
4. تغییر نام فایل

#### محل ذخیره‌سازی

**S3 (توصیه می‌شود):**
- ✅ دسترسی محدود
- ✅ CORS settings
- ✅ Versioning
- ✅ Lifecycle policies

**Volume محلی:**
- ✅ مجوزهای صحیح
- ✅ ایزوله از کد
- ✅ Backup منظم

### دسترسی به فایل‌ها

#### فایل‌های عمومی

- تصاویر محصولات
- بنرها
- فایل‌های دیجیتال (بعد از پرداخت)

#### فایل‌های خصوصی

- رسید‌های پرداخت
- مدارک مشتریان
- لاگ‌ها

دسترسی فقط با:
- ✅ احراز هویت
- ✅ مجوز مناسب
- ✅ لینک موقت

---

## 🤖 امنیت تلگرام

### Webhook Security

#### Secret Token

```
TELEGRAM_WEBHOOK_SECRET_NAME=telegram-secret
```

تلگرام هر درخواست را با این توکن امضا می‌کند.

#### بررسی در کد

```typescript
// بررسی Secret Token
if (request.headers['x-telegram-bot-api-secret-token'] !== expectedSecret) {
  return c.text('Unauthorized', 403);
}
```

### مدیریت توکن ربات

#### ذخیره‌سازی ایمن

- ✅ در Variables Railway
- ✅ در دیتابیس (رمزنگاری‌شده)
- ❌ هرگز در کد

#### چرخش توکن

اگر توکن لو رفت:

1. در @BotFather: `/revoke`
2. توکن جدید بگیرید
3. در برنامه به‌روز کنید
4. Webhook را دوباره ثبت کنید

### محدودیت دسترسی ربات

#### Super Admin IDs

```
SUPER_ADMIN_TELEGRAM_IDS=123456789,987654321
```

فقط این کاربران می‌توانند:
- ✅ دستورات مدیریتی اجرا کنند
- ✅ به لاگ‌ها دسترسی داشته باشند
- ✅ تنظیمات را تغییر دهند

---

## 💰 امنیت پرداخت

### TON Payments

#### بررسی تراکنش

1. ✅ تأیید امضا
2. ✅ بررسی آدرس کیف پول
3. ✅ تطابق مبلغ
4. ✅ تطابق Memo
5. ✅ تأیید تعداد Confirmations

#### جلوگیری از کلاهبرداری

- ✅ Double-spending check
- ✅ Replay attack prevention
- ✅ Time-window validation

#### کلیدهای API

```
TON_API_KEY=<secure-key>
```

- ✅ فقط خواندن (read-only)
- ✅ Rate limiting
- ✅ Monitoring استفاده

### پرداخت دستی

#### بررسی رسید

1. ✅ تطابق مبلغ
2. ✅ تطابق تاریخ
3. ✅ بررسی اصالت
4. ✅ تأیید توسط دو مدیر (برای مبالغ بالا)

#### محافظت در برابر تقلب

- محدودیت زمان آپلود
- بررسی خودکار تصویر
- لاگ تمام اقدامات
- گزارش مشکوک‌ها

---

## 👥 مدیریت کاربران

### رمزهای عبور

#### الزامات

- حداقل ۸ کاراکتر
- ترکیب حروف بزرگ و کوچک
- حداقل یک عدد
- حداقل یک نماد

#### ذخیره‌سازی

- ✅ Hash با bcrypt/argon2
- ✅ Salt منحصر به فرد
- ❌ هرگز متن ساده

#### بازیابی رمز عبور

1. ایمیل بازیابی
2. توکن موقت (۱ ساعت)
3. یک‌بار مصرف
4. HTTPS اجباری

### نقش‌ها و دسترسی‌ها

#### اصل کمترین دسترسی

هر کاربر فقط به چیزی دسترسی داشته باشد که نیاز دارد.

| نقش | دسترسی‌ها |
|-----|-----------|
| Super Admin | همه چیز |
| Admin | مدیریت فروشگاه |
| Operator | سفارش‌ها |
| Support | فقط مشتریان |

#### بررسی دسترسی

```typescript
// قبل از هر عملیات
if (!user.hasPermission('orders.update')) {
  return c.json({ error: 'Forbidden' }, 403);
}
```

---

## 📊 لاگ‌گیری و مانیتورینگ

### چه چیزی را لاگ کنیم؟

#### ✅ باید لاگ شود

- تلاش‌های login (موفق و ناموفق)
- تغییرات مهم (محصول، سفارش، کاربر)
- خطاهای سیستم
- دسترسی‌های غیرمجاز
- پرداخت‌ها

#### ❌ نباید لاگ شود

- رمزهای عبور
- توکن‌ها
- اطلاعات کارت بانکی
- داده‌های شخصی حساس

### محافظت از لاگ‌ها

- ✅ دسترسی محدود
- ✅ چرخش فایل‌ها
- ✅ حذف قدیمی‌ها
- ✅ رمزنگاری در صورت نیاز

### هشدارهای امنیتی

تنظیم هشدار برای:

- 🔔 چندین تلاش login ناموفق
- 🔔 دسترسی غیرمجاز
- 🔔 تغییرات حساس
- 🔔 خطاهای مکرر

---

## 🔄 به‌روزرسانی و وصله

### نگهداری وابستگی‌ها

#### بررسی منظم

```bash
# هفته‌ای یکبار
npm audit
npm outdated
```

#### به‌روزرسانی

```bash
# وابستگی‌های امنیتی
npm update

# نسخه اصلی
npm install package@latest
```

### نظارت بر آسیب‌پذیری‌ها

#### منابع

- [GitHub Security Advisories](https://github.com/advisories)
- [NPM Audit](https://www.npmjs.com/advisories)
- [CVE Database](https://cve.mitre.org/)

#### پاسخ به آسیب‌پذیری

1. ارزیابی خطر
2. اعمال وصله
3. تست
4. استقرار فوری

---

## 🛡️ محافظت در برابر حملات رایج

### SQL Injection

#### محافظت

- ✅ استفاده از Parameterized Queries
- ✅ ORM/Query Builder
- ✅ Validation ورودی‌ها

```typescript
// ✅ درست
await query('SELECT * FROM users WHERE id = $1', [userId]);

// ❌ غلط
await query(`SELECT * FROM users WHERE id = ${userId}`);
```

### XSS (Cross-Site Scripting)

#### محافظت

- ✅ Escape خروجی‌ها
- ✅ Content Security Policy
- ✅ Sanitize ورودی‌ها

```typescript
// در Hono JSX
return html`${escape(userInput)}`;
```

### CSRF (Cross-Site Request Forgery)

#### محافظت

- ✅ CSRF Tokens
- ✅ SameSite Cookies
- ✅ بررسی Origin

### Brute Force

#### محافظت

- ✅ Rate Limiting
- ✅ Captcha بعد از چند تلاش
- ✅ قفل موقت حساب

### File Upload Attacks

#### محافظت

- ✅ بررسی MIME Type
- ✅ محدودیت اندازه
- ✅ تغییر نام فایل
- ✅ ذخیره خارج از webroot

---

## 📋 چک‌لیست امنیتی

### قبل از استقرار

- [ ] همه اسرار در Variables تنظیم شده‌اند
- [ ] `.env` commit نشده است
- [ ] HTTPS فعال است
- [ ] رمز عبور Admin قوی است
- [ ] پشتیبان‌گیری پیکربندی شده است
- [ ] لاگ‌گیری فعال است

### ماهانه

- [ ] بررسی وابستگی‌ها
- [ ] بررسی لاگ‌های امنیتی
- [ ] تست بازیابی پشتیبان
- [ ] به‌روزرسانی رمزهای عبور
- [ ] بررسی دسترسی کاربران

### سالانه

- [ ] ممیزی امنیتی کامل
- [ ] به‌روزرسانی سیاست‌ها
- [ ] آموزش تیم
- [ ] تست نفوذ (اختیاری)

---

## 🆘 پاسخ به حوادث امنیتی

### اگر شک کردید سیستم نفوذ شده است:

1. **قطع دسترسی**
   - Change all secrets
   - Revoke all sessions
   - Disable compromised accounts

2. **بررسی دامنه نفوذ**
   - Check logs
   - Identify affected data
   - Document findings

3. **رفع مشکل**
   - Patch vulnerability
   - Update dependencies
   - Strengthen controls

4. **اطلاع‌رسانی**
   - Notify affected users
   - Report to authorities (if required)
   - Public disclosure (if needed)

5. **بازیابی**
   - Restore from clean backup
   - Verify integrity
   - Monitor closely

---

## 📚 منابع بیشتر

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CIS Benchmarks](https://www.cisecurity.org/benchmarks)
- [Railway Security](https://docs.railway.app/security)
- [Node.js Security](https://nodejs.org/en/security/)

---

## ✅ نتیجه‌گیری

امنیت یک فرآیند است، نه یک محصول. همیشه:

- 🔄 به‌روز بمانید
- 📊 مانیتور کنید
- 🎓 آموزش ببینید
- 🛡️ لایه‌ای فکر کنید
- 🆘 آماده پاسخ باشید

موفق و ایمن باشید! 🔒
