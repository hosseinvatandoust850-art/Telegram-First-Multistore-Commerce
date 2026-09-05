import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
function apiHeaders() {
    if (env.ton.provider === 'toncenter' && env.ton.apiKey) {
        return { 'X-API-Key': env.ton.apiKey };
    }
    if (env.ton.provider === 'tonapi' && env.ton.apiKey) {
        return { Authorization: `Bearer ${env.ton.apiKey}` };
    }
    return {};
}
/** Convert a hex `message` field to UTF-8 to extract a memo. */
export function hexToUtf8(hex) {
    if (!hex || hex === '')
        return '';
    try {
        const bytes = Buffer.from(hex.startsWith('0x') ? hex.slice(2) : hex, 'hex');
        return bytes.toString('utf8');
    }
    catch {
        return '';
    }
}
async function fetchTransactions(address) {
    if (env.ton.provider === 'tonapi') {
        const url = `${env.ton.apiUrl}/blockchain/accounts/${encodeURIComponent(address)}/transactions?limit=20`;
        const res = await fetch(url, { headers: apiHeaders() });
        const json = (await res.json().catch(() => ({})));
        return (json.transactions || []).map((t) => ({
            hash: t.hash,
            utime: t.now,
            in_msg: t.in_msg,
        }));
    }
    // toncenter
    const url = `${env.ton.apiUrl}/getTransactions?address=${encodeURIComponent(address)}&limit=20&archival=true`;
    const res = await fetch(url, { headers: apiHeaders() });
    const json = (await res.json().catch(() => ({})));
    return json.result || [];
}
/**
 * Check whether an inbound payment to `address` carrying `memo` has occurred
 * within `windowMs`. Optionally verifies that the `amount` (as a decimal string)
 * was transferred; amount matching is best-effort for native TON transfers
 * (nanoTON) and should be configured per store for jetton payments.
 */
export async function invoiceChecked({ address, memo, amount, windowMs = 5 * 60 * 1000, }) {
    if (!address) {
        return { paid: false, err: 'no payment address configured for this store' };
    }
    if (env.ton.devMode) {
        logger.warn({ address, memo }, 'TON dev-mode verification: marking as paid');
        return { paid: true, txHash: 'dev-mode', amount, memo };
    }
    const since = Date.now() - windowMs;
    try {
        const txs = await fetchTransactions(address);
        for (const tx of txs) {
            const msgText = hexToUtf8(tx.in_msg?.message || '');
            if (!msgText || !msgText.includes(memo))
                continue;
            const ts = (tx.in_msg?.created_at || tx.utime || 0) * 1000;
            if (ts < since)
                continue;
            const value = tx.in_msg?.value || '0';
            let paidAmount;
            if (amount) {
                // value is nanoTON for native TON transfers.
                const nano = Number(value || '0');
                const expected = Number(amount) * 1e9;
                paidAmount = (nano / 1e9).toString();
                if (nano < expected)
                    continue;
            }
            return {
                paid: true,
                txHash: tx.hash,
                amount: paidAmount,
                memo: msgText,
                confirmedAt: new Date(ts).toISOString(),
            };
        }
        return { paid: false, memo };
    }
    catch (err) {
        logger.error({ err, provider: env.ton.provider }, 'ton payment check failed');
        return { paid: false, err: err.message };
    }
}
/** Validate the configured network/address before creating an invoice. */
export function assertProductionPaymentConfig() {
    if (env.isProduction && env.ton.devMode) {
        logger.warn('PAYMENT_DEV_MODE is enabled in production — payment verification is FAKE. ' +
            'Disable it for real commerce.');
    }
}
/** Generate a memo to embed in the invoice (order number). */
export function makeMemo(orderNumber) {
    return `order-${orderNumber}`;
}
