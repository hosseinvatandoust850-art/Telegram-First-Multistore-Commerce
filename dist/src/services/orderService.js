import { query, queryOne, withTransaction } from '../db/pool.js';
import { genCode } from '../lib/crypto.js';
import { NotFoundError, ConflictError } from '../lib/errors.js';
export async function createOrder(input) {
    const store = await queryOne('SELECT id, currency FROM "Store" WHERE id = $1', [input.storeId]);
    if (!store)
        throw new NotFoundError('Store not found');
    const lines = [];
    let total = 0;
    for (const item of input.items) {
        const product = await queryOne('SELECT * FROM "Product" WHERE "storeId" = $1 AND id = $2 AND active = true', [input.storeId, item.productId]);
        if (!product)
            throw new NotFoundError('Product not found');
        if (product.type === 'PHYSICAL' && product.stock != null) {
            const qty = item.quantity || 1;
            if (product.stock < qty)
                throw new ConflictError('Insufficient stock');
        }
        const qty = Math.max(1, item.quantity || 1);
        const unit = Number(product.price);
        const lineTotal = unit * qty;
        total += lineTotal;
        lines.push({ product, qty });
    }
    if (lines.length === 0)
        throw new ConflictError('Cart is empty');
    const orderNumber = `ORD-${genCode('', 10)}`;
    const itemsSnapshot = lines.map((l) => ({
        productId: l.product.id,
        name: l.product.name,
        type: l.product.type,
        qty: l.qty,
        unitPrice: String(l.product.price),
        totalPrice: (Number(l.product.price) * l.qty).toFixed(8),
        files: l.product.files,
    }));
    const order = await withTransaction(async (client) => {
        const orderRes = await client.query(`INSERT INTO "Order"
         ("orderNumber", "storeId", "customerId", "totalAmount", currency,
          "deliveryEmail", "deliveryTelegramId", notes, "paymentMethod", "itemsSnapshot")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
       RETURNING *`, [
            orderNumber,
            input.storeId,
            input.customerId,
            total.toFixed(8),
            store.currency,
            input.deliveryEmail ?? null,
            input.deliveryTelegramId != null ? String(input.deliveryTelegramId) : null,
            input.notes ?? null,
            input.paymentMethod ?? 'TON',
            JSON.stringify(itemsSnapshot),
        ]);
        const orderRow = orderRes.rows[0];
        for (const l of lines) {
            await client.query(`INSERT INTO "OrderItem" ("orderId", "productId", "productName", quantity, "unitPrice", "totalPrice", type)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`, [
                orderRow.id,
                l.product.id,
                l.product.name,
                l.qty,
                String(l.product.price),
                (Number(l.product.price) * l.qty).toFixed(8),
                l.product.type,
            ]);
            if (l.product.type === 'PHYSICAL' && l.product.stock != null) {
                await client.query(`UPDATE "Product" SET stock = GREATEST(stock - $1, 0), "updatedAt" = now()
           WHERE id = $2`, [l.qty, l.product.id]);
            }
        }
        if (input.referralCode) {
            const referral = await client.query('SELECT id, "referrerId", "commissionRate" FROM "Referral" WHERE "storeId" = $1 AND code = $2 AND active = true', [input.storeId, input.referralCode]);
            if (referral.rows[0]) {
                const r = referral.rows[0];
                const amount = (total * Number(r.commissionRate)).toFixed(8);
                await client.query(`INSERT INTO "Commission" ("storeId", "orderId", "affiliateId", amount, currency, status)
           VALUES ($1,$2,$3,$4,$5,'PENDING')`, [input.storeId, orderRow.id, r.referrerId, amount, store.currency]);
                await client.query(`UPDATE "Referral" SET conversions = conversions + 1 WHERE id = $1`, [r.id]);
            }
        }
        return orderRow;
    });
    return order;
}
export async function listOrders(storeId, opts = {}) {
    const conditions = ['"storeId" = $1'];
    const params = [storeId];
    if (opts.status) {
        params.push(opts.status);
        conditions.push(`status = $${params.length}`);
    }
    params.push(opts.limit ?? 100);
    return query(`SELECT * FROM "Order" WHERE ${conditions.join(' AND ')}
     ORDER BY "createdAt" DESC LIMIT $${params.length}`, params);
}
export async function getOrder(storeId, idOrNumber) {
    return queryOne('SELECT * FROM "Order" WHERE "storeId" = $1 AND (id = $2 OR "orderNumber" = $2)', [storeId, idOrNumber]);
}
/** Lookup an order by id or order number without requiring a store scope. */
export async function getOrderAnywhere(idOrNumber) {
    return queryOne('SELECT * FROM "Order" WHERE id = $1 OR "orderNumber" = $1 LIMIT 1', [idOrNumber]);
}
export async function updateOrderStatus(storeId, orderId, patch) {
    const order = await getOrder(storeId, orderId);
    if (!order)
        throw new NotFoundError('Order not found');
    const set = [];
    const values = [storeId, orderId];
    if (patch.status) {
        set.push(`status = $${values.length + 1}`);
        values.push(patch.status);
    }
    if (patch.paymentStatus) {
        set.push(`"paymentStatus" = $${values.length + 1}`);
        values.push(patch.paymentStatus);
    }
    if (patch.fulfilled) {
        set.push(`"fulfilledAt" = now()`, `status = 'FULFILLED'`);
    }
    if (set.length === 0)
        return order;
    const row = await queryOne(`UPDATE "Order" SET ${set.join(', ')}, "updatedAt" = now()
     WHERE "storeId" = $1 AND id = $2 RETURNING *`, values);
    return row;
}
export async function orderItems(orderId) {
    return query('SELECT * FROM "OrderItem" WHERE "orderId" = $1', [orderId]);
}
export async function customerOrders(customerId) {
    return query('SELECT * FROM "Order" WHERE "customerId" = $1 ORDER BY "createdAt" DESC', [customerId]);
}
