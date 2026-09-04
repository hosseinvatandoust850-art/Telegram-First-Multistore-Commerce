import { Hono } from 'hono';
import { getStoreBySlug, listStores } from '../services/storeService.js';
import { listProducts, getProduct } from '../services/productService.js';
import {
  createOrder,
  getOrder,
  getOrderAnywhere,
  orderItems,
} from '../services/orderService.js';
import { upsertTelegramUser, createUser } from '../services/userService.js';
import {
  createPaymentForOrder,
  getPaymentByOrder,
  submitManualReceipt,
  attemptTonVerification,
} from '../services/paymentService.js';
import { renderLanding, renderCatalog, renderProduct, renderOrderStatus } from '../views/storefront.js';
import { env } from '../config/env.js';
import { NotFoundError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { storeFile } from '../services/storage.js';

export const storefrontRoutes = new Hono();

storefrontRoutes.get('/', async (c) => {
  const stores = await listStores();
  if (stores.length === 1) return c.redirect(`/store/${stores[0].slug}`);
  return c.html(renderLanding({ stores }));
});

storefrontRoutes.get('/store/:slug', async (c) => {
  const store = await getStoreBySlug(c.req.param('slug'));
  if (!store || store.status !== 'ACTIVE') throw new NotFoundError('Store not found');
  const products = await listProducts(store.id, { activeOnly: true });
  return c.html(renderCatalog({ store, products }));
});

storefrontRoutes.get('/store/:slug/product/:idOrSlug', async (c) => {
  const store = await getStoreBySlug(c.req.param('slug'));
  if (!store || store.status !== 'ACTIVE') throw new NotFoundError('Store not found');
  const product = await getProduct(store.id, c.req.param('idOrSlug'));
  if (!product || !product.active) throw new NotFoundError('Product not found');
  return c.html(renderProduct({ store, product }));
});

// Simple single-product checkout via form POST.
storefrontRoutes.post('/store/:slug/checkout', async (c) => {
  const store = await getStoreBySlug(c.req.param('slug'));
  if (!store || store.status !== 'ACTIVE') throw new NotFoundError('Store not found');
  const form = await c.req.parseBody();
  const productId = String(form.productId || '');
  const quantity = Number(form.quantity || 1);

  // Anonymous guest customer for web checkout.
  const customer = await createUser({ role: 'CUSTOMER', name: 'Guest' });

  const order = await createOrder({
    storeId: store.id,
    customerId: customer.id,
    items: [{ productId, quantity }],
    deliveryTelegramId: form.deliveryTelegramId ? Number(form.deliveryTelegramId) : undefined,
    deliveryEmail: form.deliveryEmail ? String(form.deliveryEmail) : undefined,
    notes: form.notes ? String(form.notes) : undefined,
    paymentMethod: 'TON',
  });

  logger.info({ orderId: order.id, storeId: store.id }, 'order created');
  return c.redirect(`/store/${store.slug}/order/${order.orderNumber}/pay`);
});

storefrontRoutes.get('/store/:slug/order/:orderNumber', async (c) => {
  const store = await getStoreBySlug(c.req.param('slug'));
  if (!store) throw new NotFoundError('Store not found');
  const order = await getOrder(store.id, c.req.param('orderNumber'));
  if (!order) throw new NotFoundError('Order not found');
  return c.html(renderOrderStatus({ store, order }));
});

// Payment page: shows TON invoice or manual payment plus receipt upload.
storefrontRoutes.get('/store/:slug/order/:orderNumber/pay', async (c) => {
  const store = await getStoreBySlug(c.req.param('slug'));
  if (!store) throw new NotFoundError('Store not found');
  const order = await getOrder(store.id, c.req.param('orderNumber'));
  if (!order) throw new NotFoundError('Order not found');
  const payment = await createPaymentForOrder(order, order.paymentMethod || 'TON');
  const items = await orderItems(order.id);

  let body = '<html><body style="font-family:system-ui;max-width:640px;margin:40px auto;padding:0 16px">';
  body += `<h1>Pay ${order.orderNumber}</h1>`;
  body += `<p>Total: <b>${order.totalAmount} ${order.currency}</b></p>`;
  for (const it of items) {
    body += `<p>${escapeHtml(it.productName)} × ${it.quantity} — ${it.totalPrice} ${order.currency}</p>`;
  }
  if (payment.method === 'TON') {
    body += `<h2>TON Payment</h2>`;
    body += `<p>Send <b>${payment.amount} ${payment.currency}</b> to:</p>`;
    body += `<pre style="background:#f1f5f9;padding:12px;overflow-wrap:break-word">${escapeHtml(payment.paymentAddress || 'set on store settings')}</pre>`;
    body += `<p>Memo/comment: <b>${escapeHtml(payment.memo || '')}</b></p>`;
    body += `<p>Status: <b>${payment.status}</b></p>`;
    body += `<p><a href="/api/order/${order.id}/payment/verify">☑ Check payment now</a></p>`;
    body += `<p style="color:#64748b">Network: ${env.ton.network}${env.ton.devMode ? ' (DEV MODE)' : ''}</p>`;
  } else {
    body += `<h2>Manual Payment</h2>`;
    body += `<p>Upload payment proof:</p>`;
    body += `<form method="post" enctype="multipart/form-data" action="/api/order/${order.id}/receipt">`;
    body += `<input type="file" name="receipt" accept="image/*,application/pdf" />`;
    body += `<br/><button type="submit">Upload receipt</button></form>`;
  }
  body += `</body></html>`;
  return c.html(body);
});

// JSON checkout returning order + payment info (programmatic cart).
storefrontRoutes.post('/api/checkout', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const store = await getStoreBySlug(String(body.slug || ''));
  if (!store) throw new NotFoundError('Store not found');

  let customerId: string;
  if (body.telegramId) {
    const user = await upsertTelegramUser({ id: String(body.telegramId), first_name: 'Customer' });
    customerId = user.id;
  } else {
    const user = await createUser({ role: 'CUSTOMER', name: 'Guest' });
    customerId = user.id;
  }

  const order = await createOrder({
    storeId: store.id,
    customerId,
    items: Array.isArray(body.items) ? body.items : [],
    deliveryEmail: body.deliveryEmail,
    deliveryTelegramId: body.deliveryTelegramId,
    notes: body.notes,
    paymentMethod: body.paymentMethod === 'MANUAL' ? 'MANUAL' : 'TON',
    referralCode: body.referralCode,
  });
  const payment = await createPaymentForOrder(order, order.paymentMethod || 'TON');
  return c.json({
    ok: true,
    order: { id: order.id, orderNumber: order.orderNumber, totalAmount: order.totalAmount, currency: order.currency },
    payment: { id: payment.id, method: payment.method, paymentAddress: payment.paymentAddress, memo: payment.memo },
    paymentUrl: `/store/${store.slug}/order/${order.orderNumber}/pay`,
  });
});

// Manual receipt upload (multipart).
storefrontRoutes.post('/api/order/:orderId/receipt', async (c) => {
  const order = await getOrderAnywhere(c.req.param('orderId'));
  if (!order) throw new NotFoundError('Order not found');
  const payment = await getPaymentByOrder(order.id);
  if (!payment || payment.method !== 'MANUAL') throw new NotFoundError('Payment not found');
  const form = await c.req.parseBody();
  const file = form.receipt as File | undefined;
  if (!file) return c.json({ ok: false, error: 'No file uploaded' }, 400);
  const buf = Buffer.from(await file.arrayBuffer());
  const stored = await storeFile('receipts', `order-${order.orderNumber}`, buf, file.type);
  const updated = await submitManualReceipt(payment.id, stored.url);
  return c.json({ ok: true, receiptUrl: stored.url, status: updated.status });
});

// Verify the TON payment for an order now.
storefrontRoutes.get('/api/order/:orderId/payment/verify', async (c) => {
  const order = await getOrderAnywhere(c.req.param('orderId'));
  if (!order) throw new NotFoundError('Order not found');
  const payment = await getPaymentByOrder(order.id);
  if (!payment) throw new NotFoundError('Payment not found');
  const updated = await attemptTonVerification(payment.id);
  return c.json({
    ok: true,
    status: updated.status,
    providerReference: updated.providerReference,
    receiptUrl: updated.receiptUrl,
  });
});

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
