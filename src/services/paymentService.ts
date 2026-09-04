import { query, queryOne, withTransaction } from '../db/pool.js';
import type { PaymentRow, OrderRow } from '../db/types.js';
import { env } from '../config/env.js';
import { NotFoundError, ConflictError } from '../lib/errors.js';
import { invoiceChecked, makeMemo } from './ton.js';
import { getStoreById } from './storeService.js';
import { logger } from '../lib/logger.js';

export async function createPaymentForOrder(
  order: OrderRow,
  method: 'TON' | 'MANUAL',
): Promise<PaymentRow> {
  const existing = await queryOne<PaymentRow>(
    'SELECT * FROM "Payment" WHERE "orderId" = $1 AND method = $2',
    [order.id, method],
  );
  if (existing) return existing;

  const store = await getStoreById(order.storeId);
  const paymentAddress = store?.settings ? (store.settings as any)?.tonPaymentAddress : undefined;
  const memo = makeMemo(order.orderNumber);

  const rows = await query<PaymentRow>(
    `INSERT INTO "Payment"
       ("orderId", "storeId", method, amount, currency, "paymentAddress", memo)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [
      order.id,
      order.storeId,
      method,
      order.totalAmount,
      order.currency,
      (method === 'TON' ? paymentAddress || env.ton.paymentAddress : null) ?? null,
      method === 'TON' ? memo : null,
    ],
  );
  return rows[0];
}

export async function getPaymentByOrder(
  orderId: string,
): Promise<PaymentRow | undefined> {
  return queryOne<PaymentRow>(
    'SELECT * FROM "Payment" WHERE "orderId" = $1 ORDER BY "createdAt" DESC LIMIT 1',
    [orderId],
  );
}

export async function getPayment(id: string): Promise<PaymentRow | undefined> {
  return queryOne<PaymentRow>('SELECT * FROM "Payment" WHERE id = $1', [id]);
}

/** Mark a payment paid and update the associated order. */
export async function markPaid(
  paymentId: string,
  info: {
    providerReference?: string;
    verifiedById?: string;
    network?: string;
  },
): Promise<PaymentRow> {
  const payment = await getPayment(paymentId);
  if (!payment) throw new NotFoundError('Payment not found');
  if (payment.status === 'PAID') return payment;

  const res = await withTransaction(async (client) => {
    const upd = await client.query<PaymentRow>(
      `UPDATE "Payment"
       SET status = 'PAID', "providerReference" = COALESCE($2, "providerReference"),
           "verifiedAt" = now(), "verifiedById" = COALESCE($3, "verifiedById"),
           "failedReason" = NULL, "updatedAt" = now()
       WHERE id = $1 RETURNING *`,
      [paymentId, info.providerReference ?? null, info.verifiedById ?? null],
    );
    await client.query(
      `UPDATE "Order" SET "paymentStatus" = 'PAID', "updatedAt" = now()
       WHERE id = $1 AND "paymentStatus" != 'PAID'`,
      [payment.orderId],
    );
    return upd.rows[0];
  });
  return res!;
}

export async function failPayment(paymentId: string, reason: string): Promise<PaymentRow> {
  const res = await queryOne<PaymentRow>(
    `UPDATE "Payment" SET status = 'FAILED', "failedReason" = $2, "updatedAt" = now()
     WHERE id = $1 RETURNING *`,
    [paymentId, reason],
  );
  return res!;
}

/** Manual payment: customer uploads a receipt, order moves to AWAITING_REVIEW. */
export async function submitManualReceipt(
  paymentId: string,
  receiptUrl: string,
): Promise<PaymentRow> {
  const payment = await getPayment(paymentId);
  if (!payment) throw new NotFoundError('Payment not found');
  const res = await withTransaction(async (client) => {
    const upd = await client.query<PaymentRow>(
      `UPDATE "Payment" SET "receiptUrl" = $2, "updatedAt" = now()
       WHERE id = $1 RETURNING *`,
      [paymentId, receiptUrl],
    );
    await client.query(
      `UPDATE "Order" SET status = 'AWAITING_REVIEW', "updatedAt" = now()
       WHERE id = $1`,
      [payment.orderId],
    );
    return upd.rows[0];
  });
  return res!;
}

/** Admin reviews a manual receipt. */
export async function reviewManualReceipt(
  paymentId: string,
  approved: boolean,
  reviewedById: string,
): Promise<PaymentRow> {
  const payment = await getPayment(paymentId);
  if (!payment) throw new NotFoundError('Payment not found');
  if (payment.method !== 'MANUAL') throw new ConflictError('Not a manual payment');

  if (approved) {
    return markPaid(paymentId, { verifiedById: reviewedById });
  }
  const order = await queryOne<OrderRow>('SELECT * FROM "Order" WHERE id = $1', [
    payment.orderId,
  ]);
  await query('UPDATE "Order" SET status = $1, "updatedAt" = now() WHERE id = $2', [
    order?.status === 'PENDING_PAYMENT' ? 'PENDING_PAYMENT' : 'CANCELLED',
    payment.orderId,
  ]);
  return failPayment(paymentId, 'Manual receipt rejected by admin');
}

/** Poll the chain (or dev mode) for a TON payment and confirm if found. */
export async function attemptTonVerification(paymentId: string): Promise<PaymentRow> {
  const payment = await getPayment(paymentId);
  if (!payment) throw new NotFoundError('Payment not found');
  if (payment.method !== 'TON' || payment.status === 'PAID') return payment;
  if (!payment.paymentAddress || !payment.memo) {
    return payment;
  }

  const result = await invoiceChecked({
    address: payment.paymentAddress,
    memo: payment.memo,
    amount: payment.amount,
  });

  if (result.paid) {
    logger.info({ paymentId, txHash: result.txHash }, 'TON payment verified');
    return markPaid(paymentId, {
      providerReference: result.txHash,
      network: env.ton.network,
    });
  }
  if (result.err) {
    logger.warn({ paymentId, err: result.err }, 'TON verification error');
  }
  return payment;
}

/** List payments awaiting manual review in a store. */
export async function listAwaitingReview(storeId: string): Promise<PaymentRow[]> {
  return query<PaymentRow>(
    'SELECT * FROM "Payment" WHERE "storeId" = $1 AND status = $2 ORDER BY "createdAt" ASC',
    [storeId, 'AWAITING_REVIEW'],
  );
}

export async function listPendingTonPayments(): Promise<PaymentRow[]> {
  return query<PaymentRow>(
    `SELECT * FROM "Payment" WHERE method = 'TON' AND status = 'PENDING' ORDER BY "createdAt" ASC LIMIT 500`,
  );
}
