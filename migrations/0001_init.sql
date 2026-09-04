-- Migration 0001: initial schema for Telegram-First Multistore Commerce
-- This is a forward-only migration applied by scripts/migrate.ts.
-- gen_random_uuid() is built into PostgreSQL 13+ (Railway uses 14/15/16).

-- ----------------------------------------------------------------------
-- Enumerated types
-- ----------------------------------------------------------------------
CREATE TYPE user_role AS ENUM ('SUPER_ADMIN','STORE_OWNER','STORE_ADMIN','CUSTOMER');
CREATE TYPE product_type AS ENUM ('DIGITAL','PHYSICAL');
CREATE TYPE order_status AS ENUM ('PENDING_PAYMENT','AWAITING_REVIEW','PAID','FULFILLED','CANCELLED','REFUNDED');
CREATE TYPE payment_status AS ENUM ('PENDING','AWAITING_REVIEW','PAID','FAILED','REFUNDED');
CREATE TYPE payment_method AS ENUM ('TON','MANUAL');
CREATE TYPE commission_status AS ENUM ('PENDING','PAID','CANCELLED');
CREATE TYPE upload_purpose AS ENUM ('PRODUCT_IMAGE','PRODUCT_FILE','RECEIPT','OTHER');
CREATE TYPE backup_status AS ENUM ('RUNNING','COMPLETED','FAILED');
CREATE TYPE store_status AS ENUM ('ACTIVE','SUSPENDED','PAUSED');

-- ----------------------------------------------------------------------
-- Store
-- ----------------------------------------------------------------------
CREATE TABLE "Store" (
  id                TEXT NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  slug              TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  description       TEXT,
  currency          TEXT NOT NULL DEFAULT 'USDT',
  currencySymbol    TEXT NOT NULL DEFAULT '₮',
  locale            TEXT NOT NULL DEFAULT 'en',
  "logoUrl"         TEXT,
  theme             JSONB,
  "telegramBotToken" TEXT,
  "telegramUsername" TEXT,
  "botWebhookSecret" TEXT UNIQUE,
  "publicUrl"       TEXT,
  status            store_status NOT NULL DEFAULT 'ACTIVE',
  settings          JSONB,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX "Store_status_idx" ON "Store" (status);
CREATE INDEX "Store_botWebhookSecret_idx" ON "Store" ("botWebhookSecret");

-- ----------------------------------------------------------------------
-- User
-- ----------------------------------------------------------------------
CREATE TABLE "User" (
  id                TEXT NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  "storeId"         TEXT,
  "telegramId"      BIGINT UNIQUE,
  "telegramUsername" TEXT,
  "firstName"       TEXT,
  "lastName"        TEXT,
  name              TEXT,
  role              user_role NOT NULL DEFAULT 'CUSTOMER',
  email             TEXT UNIQUE,
  "passwordHash"    TEXT,
  phone             TEXT,
  locale            TEXT,
  "referralCode"    TEXT UNIQUE,
  "referredById"    TEXT,
  status            TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "User_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"(id) ON DELETE SET NULL,
  CONSTRAINT "User_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "User"(id) ON DELETE SET NULL
);
CREATE INDEX "User_storeId_idx" ON "User" ("storeId");
CREATE INDEX "User_referredById_idx" ON "User" ("referredById");
CREATE INDEX "User_telegramId_idx" ON "User" ("telegramId");

-- ----------------------------------------------------------------------
-- Product
-- ----------------------------------------------------------------------
CREATE TABLE "Product" (
  id          TEXT NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  "storeId"   TEXT NOT NULL,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  description TEXT,
  type        product_type NOT NULL DEFAULT 'DIGITAL',
  price       NUMERIC(18,8) NOT NULL,
  currency    TEXT NOT NULL DEFAULT 'USDT',
  stock       INTEGER,
  category    TEXT,
  images      JSONB,
  files       JSONB,
  attributes  JSONB,
  active      BOOLEAN NOT NULL DEFAULT true,
  featured    BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "Product_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"(id) ON DELETE CASCADE,
  CONSTRAINT "Product_storeId_slug_key" UNIQUE ("storeId", slug)
);
CREATE INDEX "Product_storeId_active_idx" ON "Product" ("storeId", active);

-- ----------------------------------------------------------------------
-- Order
-- ----------------------------------------------------------------------
CREATE TABLE "Order" (
  id                 TEXT NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  "orderNumber"      TEXT NOT NULL,
  "storeId"          TEXT NOT NULL,
  "customerId"       TEXT NOT NULL,
  status             order_status NOT NULL DEFAULT 'PENDING_PAYMENT',
  "paymentStatus"    payment_status NOT NULL DEFAULT 'PENDING',
  "paymentMethod"    payment_method,
  "totalAmount"      NUMERIC(18,8) NOT NULL,
  currency           TEXT NOT NULL DEFAULT 'USDT',
  "discountAmount"   NUMERIC(18,8) NOT NULL DEFAULT 0,
  "deliveryEmail"    TEXT,
  "deliveryTelegramId" BIGINT,
  "itemsSnapshot"    JSONB,
  notes              TEXT,
  "fulfilledAt"      TIMESTAMPTZ,
  "processedById"    TEXT,
  "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "Order_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"(id) ON DELETE CASCADE,
  CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"(id) ON DELETE RESTRICT,
  CONSTRAINT "Order_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "User"(id) ON DELETE SET NULL,
  CONSTRAINT "Order_storeId_orderNumber_key" UNIQUE ("storeId", "orderNumber")
);
CREATE INDEX "Order_storeId_status_idx" ON "Order" ("storeId", status);
CREATE INDEX "Order_storeId_createdAt_idx" ON "Order" ("storeId", "createdAt");

CREATE TABLE "OrderItem" (
  id          TEXT NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  "orderId"   TEXT NOT NULL,
  "productId" TEXT,
  "productName" TEXT NOT NULL,
  quantity    INTEGER NOT NULL DEFAULT 1,
  "unitPrice" NUMERIC(18,8) NOT NULL,
  "totalPrice" NUMERIC(18,8) NOT NULL,
  type        product_type NOT NULL DEFAULT 'DIGITAL',
  CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"(id) ON DELETE CASCADE
);
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem" ("orderId");

-- ----------------------------------------------------------------------
-- Payment
-- ----------------------------------------------------------------------
CREATE TABLE "Payment" (
  id                 TEXT NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  "orderId"          TEXT NOT NULL,
  "storeId"          TEXT NOT NULL,
  method             payment_method NOT NULL,
  amount             NUMERIC(18,8) NOT NULL,
  currency           TEXT NOT NULL DEFAULT 'USDT',
  network            TEXT,
  "paymentAddress"   TEXT,
  memo               TEXT,
  "providerReference" TEXT,
  "receiptUrl"       TEXT,
  status             payment_status NOT NULL DEFAULT 'PENDING',
  "failedReason"     TEXT,
  "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  "verifiedAt"       TIMESTAMPTZ,
  "verifiedById"     TEXT,
  CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"(id) ON DELETE CASCADE,
  CONSTRAINT "Payment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"(id) ON DELETE CASCADE
);
CREATE INDEX "Payment_orderId_idx" ON "Payment" ("orderId");
CREATE INDEX "Payment_storeId_status_idx" ON "Payment" ("storeId", status);
CREATE INDEX "Payment_paymentAddress_status_idx" ON "Payment" ("paymentAddress", status);

-- ----------------------------------------------------------------------
-- Referral / Affiliate / Commission
-- ----------------------------------------------------------------------
CREATE TABLE "Referral" (
  id              TEXT NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  "storeId"       TEXT NOT NULL,
  code            TEXT NOT NULL,
  "referrerId"    TEXT NOT NULL,
  clicks          INTEGER NOT NULL DEFAULT 0,
  conversions     INTEGER NOT NULL DEFAULT 0,
  "commissionRate" NUMERIC(5,4) NOT NULL DEFAULT 0,
  active          BOOLEAN NOT NULL DEFAULT true,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "Referral_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"(id) ON DELETE CASCADE,
  CONSTRAINT "Referral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User"(id) ON DELETE CASCADE,
  CONSTRAINT "Referral_storeId_code_key" UNIQUE ("storeId", code)
);

CREATE TABLE "Commission" (
  id           TEXT NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  "storeId"    TEXT NOT NULL,
  "orderId"    TEXT NOT NULL,
  "affiliateId" TEXT NOT NULL,
  amount       NUMERIC(18,8) NOT NULL,
  currency     TEXT NOT NULL DEFAULT 'USDT',
  status       commission_status NOT NULL DEFAULT 'PENDING',
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "Commission_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"(id) ON DELETE CASCADE,
  CONSTRAINT "Commission_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"(id) ON DELETE CASCADE,
  CONSTRAINT "Commission_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "User"(id) ON DELETE CASCADE,
  CONSTRAINT "Commission_orderId_affiliateId_key" UNIQUE ("orderId", "affiliateId")
);
CREATE INDEX "Commission_storeId_status_idx" ON "Commission" ("storeId", status);

-- ----------------------------------------------------------------------
-- Setting, MediaFile, AnalyticsEvent, AuditLog
-- ----------------------------------------------------------------------
CREATE TABLE "Setting" (
  id        TEXT NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  "storeId" TEXT NOT NULL,
  key       TEXT NOT NULL,
  value     JSONB NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "Setting_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"(id) ON DELETE CASCADE,
  CONSTRAINT "Setting_storeId_key_key" UNIQUE ("storeId", key)
);

CREATE TABLE "MediaFile" (
  id           TEXT NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  "storeId"    TEXT NOT NULL,
  key          TEXT NOT NULL,
  url          TEXT NOT NULL,
  "mimeType"   TEXT,
  size         INTEGER,
  purpose      upload_purpose NOT NULL DEFAULT 'OTHER',
  bucket       TEXT,
  region       TEXT,
  "uploadedById" TEXT,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "MediaFile_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"(id) ON DELETE CASCADE
);
CREATE INDEX "MediaFile_storeId_purpose_idx" ON "MediaFile" ("storeId", purpose);
CREATE INDEX "MediaFile_storeId_key_idx" ON "MediaFile" ("storeId", key);

CREATE TABLE "AnalyticsEvent" (
  id        TEXT NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  "storeId" TEXT NOT NULL,
  type      TEXT NOT NULL,
  "userId"  TEXT,
  metadata  JSONB,
  "sessionId" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "AnalyticsEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"(id) ON DELETE CASCADE
);
CREATE INDEX "AnalyticsEvent_storeId_type_idx" ON "AnalyticsEvent" ("storeId", type);
CREATE INDEX "AnalyticsEvent_storeId_createdAt_idx" ON "AnalyticsEvent" ("storeId", "createdAt");

CREATE TABLE "AuditLog" (
  id        TEXT NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  "storeId" TEXT NOT NULL,
  "actorId" TEXT,
  action    TEXT NOT NULL,
  entity    TEXT,
  "entityId" TEXT,
  metadata  JSONB,
  ip        TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "AuditLog_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"(id) ON DELETE CASCADE
);
CREATE INDEX "AuditLog_storeId_createdAt_idx" ON "AuditLog" ("storeId", "createdAt");

-- ----------------------------------------------------------------------
-- Backup jobs & job runs
-- ----------------------------------------------------------------------
CREATE TABLE "BackupJob" (
  id           TEXT NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  "storeId"    TEXT,
  status       backup_status NOT NULL DEFAULT 'RUNNING',
  type         TEXT NOT NULL DEFAULT 'full',
  "storageKey" TEXT,
  "sizeBytes"  BIGINT,
  error        TEXT,
  "startedAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "completedAt" TIMESTAMPTZ,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "BackupJob_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"(id) ON DELETE SET NULL
);
CREATE INDEX "BackupJob_status_idx" ON "BackupJob" (status);

CREATE TABLE "JobRun" (
  id           TEXT NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  "jobKey"     TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'running',
  "startedAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "finishedAt" TIMESTAMPTZ,
  error        TEXT,
  details      JSONB,
  "heartbeatAt" TIMESTAMPTZ,
  CONSTRAINT "JobRun_jobKey_startedAt_key" UNIQUE ("jobKey", "startedAt")
);
CREATE INDEX "JobRun_jobKey_startedAt_idx" ON "JobRun" ("jobKey", "startedAt");
