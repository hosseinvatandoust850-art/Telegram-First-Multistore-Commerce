# راهنمای ایجاد و استفاده از Railway Template

این راهنما نحوه ایجاد یک Railway Template رسمی را توضیح می‌دهد که به‌صورت خودکار هم برنامه و هم پایگاه‌داده PostgreSQL را استقرار می‌دهد.

---

## 🎯 چرا Railway Template؟

Railway Template یک پیکربندی از پیش تعریف‌شده است که:

- ✅ **همه سرویس‌ها را خودکار ایجاد می‌کند** (برنامه + PostgreSQL)
- ✅ **متغیرها را خودکار تنظیم می‌کند** (DATABASE_URL، APP_SECRET، etc.)
- ✅ **اتصالات سرویس را خودکار پیکربندی می‌کند**
- ✅ **تجربه "یک‌کلیکی" واقعی فراهم می‌کند**

---

## 📁 فایل‌های پیکربندی Template

پروژه شامل فایل‌های زیر در پوشه `.railway/` است:

```
.railway/
├── template.json    ← پیکربندی اصلی Template
└── README.md        ← راهنمای انتشار Template
```

### محتوای template.json

این فایل دو سرویس تعریف می‌کند:

1. **سرویس برنامه (App)**
   - Build از Dockerfile
   - Start Command: اجرای مایگریشن + شروع برنامه
   - Health Check: `/health`
   - Volume: 1GB برای ذخیره‌سازی فایل‌ها
   - متغیرهای خودکار:
     - `DATABASE_URL=${{Postgres.DATABASE_URL}}`
     - `APP_SECRET={{generateSecret 32}}`
     - `APP_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}`

2. **سرویس PostgreSQL**
   - نسخه 16
   - به‌صورت خودکار به برنامه متصل می‌شود

---

## 🚀 مراحل ایجاد Template رسمی

### مرحله ۱: استقرار اولیه روی Railway

1. به [railway.app](https://railway.app) بروید
2. وارد حساب شوید
3. **New Project** → **Deploy from GitHub repo**
4. مخزن `Telegram-First-Multistore-Commerce` را انتخاب کنید

### مرحله ۲: افزودن PostgreSQL

1. در پروژه Railway، روی **+ New** کلیک کنید
2. **Database** → **PostgreSQL** را انتخاب کنید
3. صبر کنید تا دیتابیس ساخته شود

### مرحله ۳: تنظیم متغیرهای برنامه

به سرویس برنامه بروید و متغیرهای زیر را تنظیم کنید:

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
APP_SECRET=<یک_رشته_تصادفی_طولانی>
APP_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
NODE_ENV=production
PORT=8080
ENABLE_INLINE_WORKER=true
```

> **نکته:** مقدار `${{Postgres.DATABASE_URL}}` یک ارجاع جادویی Railway است که به‌طور خودکار به آدرس دیتابیس متصل می‌شود.

### مرحله ۴: افزودن Volume

1. به سرویس برنامه بروید
2. تب **Volumes** → **New Volume**
3. مسیر Mount: `/app/storage`
4. حجم: 1GB

### مرحله ۵: تست استقرار

1. صبر کنید تا Build کامل شود
2. بررسی کنید که برنامه با موفقیت شروع شده است
3. به آدرس عمومی برنامه بروید
4. Setup Wizard را تکمیل کنید

### مرحله ۶: انتشار به عنوان Template

1. به **Settings** → **Templates** بروید
2. روی **Publish as Template** کلیک کنید
3. اطلاعات Template را پر کنید:

```
Name: Telegram Multistore Commerce Platform
Description: A production-ready multistore commerce platform with Telegram bot integration, TON payments, and automated backups.
Tags: ecommerce, telegram, ton, multistore, postgresql
Logo URL: https://raw.githubusercontent.com/hosseinvatandoust850-art/Telegram-First-Multistore-Commerce/main/docs/logo.png
```

4. **Publish** را بزنید

### مرحله ۷: دریافت URL Template

بعد از انتشار، Railway یک URL به شما می‌دهد:

```
https://railway.app/template/<TEMPLATE_ID>
```

این URL را کپی کنید.

---

## ➕ افزودن دکمه Deploy به README

بعد از دریافت URL Template، این خط را به بالای `README.md` اضافه کنید:

```markdown
[![Deploy on Railway](https://railway.com/button.svg)](https://railway.app/template/<TEMPLATE_ID>)
```

جای `<TEMPLATE_ID>` شناسه واقعی را قرار دهید.

---

## 🎯 تجربه کاربر نهایی

بعد از انتشار Template، کاربران می‌توانند:

1. روی دکمه **Deploy on Railway** کلیک کنند
2. Railway به‌صورت خودکار:
   - یک پروژه جدید می‌سازد
   - سرویس برنامه را ایجاد می‌کند
   - سرویس PostgreSQL را ایجاد می‌کند
   - متغیرها را تنظیم می‌کند
   - Volume را اضافه می‌کند
   - اتصالات را پیکربندی می‌کند
3. کاربر فقط باید:
   - نام پروژه را انتخاب کند
   - منطقه (region) را انتخاب کند
4. بعد از Build، برنامه آماده است!

---

## 🔧 به‌روزرسانی Template

اگر می‌خواهید Template را به‌روز کنید:

1. تغییرات را در مخزن GitHub اعمال کنید
2. به Railway بروید
3. **Settings** → **Templates**
4. Template را انتخاب کنید
5. **Update from Repository** را بزنید

---

## ❓ سوالات متداول

### آیا Template به‌صورت خودکار مایگریشن اجرا می‌کند؟

بله، Start Command شامل `node dist/scripts/migrate.js` است که قبل از شروع برنامه اجرا می‌شود.

### آیا داده‌ها با هر بار استقرار حفظ می‌شوند؟

بله، PostgreSQL یک سرویس پایدار است و Volume نیز persistent است.

### آیا می‌توانم Template را خصوصی نگه دارم؟

بله، هنگام انتشار می‌توانید گزینه Private را انتخاب کنید.

### آیا هزینه‌ای دارد؟

خیر، ایجاد و استفاده از Template رایگان است. فقط هزینه سرویس‌های Railway طبق تعرفه معمول محاسبه می‌شود.

---

## 📞 حمایت

اگر به مشکلی برخوردید:

1. لاگ‌های Railway را بررسی کنید
2. بخش [عیب‌یابی](TROUBLESHOOTING.md) را مطالعه کنید
3. در Issues گیت‌هاب سوال بپرسید
