/** Row shapes returned by queries. Column casing matches the quoted identifiers. */

export interface StoreRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  currency: string;
  currencySymbol: string;
  locale: string;
  logoUrl: string | null;
  theme: unknown;
  telegramBotToken: string | null;
  telegramUsername: string | null;
  botWebhookSecret: string | null;
  publicUrl: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'PAUSED';
  settings: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserRow {
  id: string;
  storeId: string | null;
  telegramId: string | null; // BIGINT returned as string by pg
  telegramUsername: string | null;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  role: 'SUPER_ADMIN' | 'STORE_OWNER' | 'STORE_ADMIN' | 'CUSTOMER';
  email: string | null;
  passwordHash: string | null;
  phone: string | null;
  locale: string | null;
  referralCode: string | null;
  referredById: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductRow {
  id: string;
  storeId: string;
  name: string;
  slug: string;
  description: string | null;
  type: 'DIGITAL' | 'PHYSICAL';
  price: string; // NUMERIC -> string
  currency: string;
  stock: number | null;
  category: string | null;
  images: unknown;
  files: unknown;
  attributes: unknown;
  active: boolean;
  featured: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderRow {
  id: string;
  orderNumber: string;
  storeId: string;
  customerId: string;
  status: 'PENDING_PAYMENT' | 'AWAITING_REVIEW' | 'PAID' | 'FULFILLED' | 'CANCELLED' | 'REFUNDED';
  paymentStatus: 'PENDING' | 'AWAITING_REVIEW' | 'PAID' | 'FAILED' | 'REFUNDED';
  paymentMethod: 'TON' | 'MANUAL' | null;
  totalAmount: string;
  currency: string;
  discountAmount: string;
  deliveryEmail: string | null;
  deliveryTelegramId: string | null;
  itemsSnapshot: unknown;
  notes: string | null;
  fulfilledAt: Date | null;
  processedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderItemRow {
  id: string;
  orderId: string;
  productId: string | null;
  productName: string;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
  type: 'DIGITAL' | 'PHYSICAL';
}

export interface ReferralRow {
  id: string;
  storeId: string;
  code: string;
  referrerId: string;
  clicks: number;
  conversions: number;
  commissionRate: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CommissionRow {
  id: string;
  storeId: string;
  orderId: string;
  affiliateId: string;
  amount: string;
  currency: string;
  status: 'PENDING' | 'PAID' | 'CANCELLED';
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentRow {
  id: string;
  orderId: string;
  storeId: string;
  method: 'TON' | 'MANUAL';
  amount: string;
  currency: string;
  network: string | null;
  paymentAddress: string | null;
  memo: string | null;
  providerReference: string | null;
  receiptUrl: string | null;
  status: 'PENDING' | 'AWAITING_REVIEW' | 'PAID' | 'FAILED' | 'REFUNDED';
  failedReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  verifiedAt: Date | null;
  verifiedById: string | null;
}
