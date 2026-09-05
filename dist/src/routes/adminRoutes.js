import { Hono } from 'hono';
import { requireStoreAdmin, getUser } from '../middleware/auth.js';
import { setSetting, createStore, updateStore, getStoreById } from '../services/storeService.js';
import { listStoreUsers } from '../services/userService.js';
import { listProducts, createProduct, updateProduct, deleteProduct, } from '../services/productService.js';
import { listOrders, getOrder, orderItems, updateOrderStatus } from '../services/orderService.js';
import { listAwaitingReview, reviewManualReceipt, getPayment, getPaymentByOrder } from '../services/paymentService.js';
import { registerStoreWebhook } from '../services/botService.js';
import { storeFile } from '../services/storage.js';
import { ForbiddenError, NotFoundError } from '../lib/errors.js';
export const adminRoutes = new Hono();
// Scope store-admin auth to the /admin namespace only so public API routes
// (auth, checkout, telegram webhooks) are never gated by this middleware.
adminRoutes.use('/admin/*', requireStoreAdmin);
function storeIdOf(c) {
    const user = getUser(c);
    const headerStore = c.req.header('x-store-id');
    if (user.role === 'SUPER_ADMIN' && headerStore)
        return headerStore;
    if (!user.storeId)
        throw new ForbiddenError('No store associated with this account');
    return user.storeId;
}
adminRoutes.get('/admin/summary', async (c) => {
    const storeId = storeIdOf(c);
    const [products, orders, awaitingReview, users] = await Promise.all([
        listProducts(storeId),
        listOrders(storeId, { limit: 500 }),
        listAwaitingReview(storeId),
        listStoreUsers(storeId),
    ]);
    return c.json({
        ok: true,
        storeId,
        counts: {
            products: products.length,
            orders: orders.length,
            awaitingReview: awaitingReview.length,
            customers: users.filter((u) => u.role === 'CUSTOMER').length,
        },
        recentOrders: orders.slice(0, 10),
    });
});
// ----- Products -----
adminRoutes.get('/admin/products', async (c) => {
    const storeId = storeIdOf(c);
    const products = await listProducts(storeId);
    return c.json({ ok: true, products });
});
adminRoutes.post('/admin/products', async (c) => {
    const storeId = storeIdOf(c);
    const body = await c.req.json();
    const product = await createProduct(storeId, body);
    return c.json({ ok: true, product }, 201);
});
adminRoutes.patch('/admin/products/:id', async (c) => {
    const storeId = storeIdOf(c);
    const body = await c.req.json();
    const product = await updateProduct(storeId, c.req.param('id'), body);
    return c.json({ ok: true, product });
});
adminRoutes.delete('/admin/products/:id', async (c) => {
    const storeId = storeIdOf(c);
    const ok = await deleteProduct(storeId, c.req.param('id'));
    return c.json({ ok });
});
// ----- Orders -----
adminRoutes.get('/admin/orders', async (c) => {
    const storeId = storeIdOf(c);
    const status = c.req.query('status');
    const orders = await listOrders(storeId, { status });
    return c.json({ ok: true, orders });
});
adminRoutes.get('/admin/orders/:id', async (c) => {
    const storeId = storeIdOf(c);
    const order = await getOrder(storeId, c.req.param('id'));
    if (!order)
        throw new NotFoundError('Order not found');
    const items = await orderItems(order.id);
    const payment = await getPaymentByOrder(order.id);
    return c.json({ ok: true, order, items, payment });
});
adminRoutes.post('/admin/orders/:id/fulfill', async (c) => {
    const storeId = storeIdOf(c);
    const order = await updateOrderStatus(storeId, c.req.param('id'), {
        fulfilled: true,
    });
    return c.json({ ok: true, order });
});
adminRoutes.post('/admin/orders/:id/mark-paid', async (c) => {
    const storeId = storeIdOf(c);
    const order = await updateOrderStatus(storeId, c.req.param('id'), {
        paymentStatus: 'PAID',
    });
    return c.json({ ok: true, order });
});
// ----- Payments / manual review -----
adminRoutes.get('/admin/payments/awaiting-review', async (c) => {
    const storeId = storeIdOf(c);
    const payments = await listAwaitingReview(storeId);
    return c.json({ ok: true, payments });
});
adminRoutes.post('/admin/payments/:id/review', async (c) => {
    const storeId = storeIdOf(c);
    const user = getUser(c);
    const body = await c.req.json();
    const approved = Boolean(body.approved);
    const payment = await getPayment(c.req.param('id'));
    if (!payment || payment.storeId !== storeId)
        throw new NotFoundError('Payment not found');
    const updated = await reviewManualReceipt(payment.id, approved, user.id);
    return c.json({ ok: true, payment: updated });
});
// ----- Store settings -----
adminRoutes.get('/admin/store', async (c) => {
    const storeId = storeIdOf(c);
    const store = await getStoreById(storeId);
    if (!store)
        throw new NotFoundError('Store not found');
    return c.json({
        ok: true,
        store: {
            id: store.id,
            name: store.name,
            slug: store.slug,
            description: store.description,
            currency: store.currency,
            currencySymbol: store.currencySymbol,
            locale: store.locale,
            logoUrl: store.logoUrl,
            telegramUsername: store.telegramUsername,
            publicUrl: store.publicUrl,
            status: store.status,
            settings: store.settings,
        },
    });
});
adminRoutes.patch('/admin/store', async (c) => {
    const storeId = storeIdOf(c);
    const body = await c.req.json();
    const patch = {};
    for (const k of ['name', 'description', 'currency', 'currencySymbol', 'locale', 'logoUrl', 'telegramUsername', 'publicUrl', 'status', 'telegramBotToken']) {
        if (body[k] !== undefined)
            patch[k] = body[k];
    }
    // settings handled distinctly
    if (body.settings !== undefined)
        patch.settings = body.settings;
    const store = await updateStore(storeId, patch);
    return c.json({ ok: true, store });
});
// ----- Telegram webhook registration -----
adminRoutes.post('/admin/webhook/register', async (c) => {
    const storeId = storeIdOf(c);
    const store = await getStoreById(storeId);
    if (!store)
        throw new NotFoundError('Store not found');
    const result = await registerStoreWebhook(store);
    return c.json({ ok: true, webhookUrl: result.url, info: result.info });
});
// ----- Uploads -----
adminRoutes.post('/admin/files/upload', async (c) => {
    const storeId = storeIdOf(c);
    const form = await c.req.parseBody();
    const file = form.file;
    if (!file)
        return c.json({ ok: false, error: 'No file' }, 400);
    const buf = Buffer.from(await file.arrayBuffer());
    const stored = await storeFile('uploads', file.name, buf, file.type);
    await setSetting(storeId, 'lastUpload', stored.key);
    return c.json({ ok: true, key: stored.key, url: stored.url });
});
// ----- Create a store within a team (super admin) -----
adminRoutes.post('/admin/stores', async (c) => {
    const user = getUser(c);
    if (user.role !== 'SUPER_ADMIN')
        throw new ForbiddenError('Super admin only');
    const body = await c.req.json();
    const store = await createStore({
        name: body.name,
        slug: body.slug,
        description: body.description,
        locale: body.locale,
    });
    return c.json({ ok: true, store }, 201);
});
export { storeFile };
