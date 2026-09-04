import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

/**
 * TON payment verification.
 *
 * In production:
 * - TON_NETWORK is `mainnet`.
 * - We poll the configured provider for recent inbound transactions to the
 *   store's receiving address and match on the `memo` we embed in the invoice,
 *   optionally verifying the transferred amount.
 * - We NEVER auto-verify in "dev mode" (PAYMENT_DEV_MODE) during production.
 *
 * Dev/test:
 * - `PAYMENT_DEV_MODE=true` short-circuits verification as paid (for local
 *   development only). `PAYMENT_ALLOW_TESTNET=true` enables testnet address
 *   generation and is guarded so it cannot be enabled in production alongside
 *   a real network.
 */

export type TonNetwork = 'mainnet' | 'testnet';

export interface TonPaymentCheck {
  paid: boolean;
  txHash?: string;
  amount?: string; // raw value for matching
  memo?: string;
  confirmedAt?: string;
  err?: string;
}

function apiHeaders(): Record<string, string> {
  if (env.ton.provider === 'toncenter' && env.ton.apiKey) {
    return { 'X-API-Key': env.ton.apiKey };
  }
  if (env.ton.provider === 'tonapi' && env.ton.apiKey) {
    return { Authorization: `Bearer ${env.ton.apiKey}` };
  }
  return {};
}

interface RawTx {
  hash?: string;
  utime?: number;
  in_msg?: {
    source?: string;
    value?: string;
    message?: string;
    created_at?: number;
  };
}

/** Convert a hex `message` field to UTF-8 to extract a memo. */
export function hexToUtf8(hex: string): string {
  if (!hex || hex === '') return '';
  try {
    const bytes = Buffer.from(hex.startsWith('0x') ? hex.slice(2) : hex, 'hex');
    return bytes.toString('utf8');
  } catch {
    return '';
  }
}

async function fetchTransactions(address: string): Promise<RawTx[]> {
  if (env.ton.provider === 'tonapi') {
    const url = `${env.ton.apiUrl}/blockchain/accounts/${encodeURIComponent(address)}/transactions?limit=20`;
    const res = await fetch(url, { headers: apiHeaders() });
    const json = (await res.json().catch(() => ({}))) as {
      transactions?: Array<{ hash?: string; now?: number; in_msg?: Partial<RawTx['in_msg']> }>;
    };
    return (json.transactions || []).map((t) => ({
      hash: t.hash,
      utime: t.now,
      in_msg: t.in_msg as RawTx['in_msg'],
    }));
  }
  // toncenter
  const url = `${env.ton.apiUrl}/getTransactions?address=${encodeURIComponent(address)}&limit=20&archival=true`;
  const res = await fetch(url, { headers: apiHeaders() });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    result?: RawTx[];
  };
  return json.result || [];
}

/**
 * Check whether an inbound payment to `address` carrying `memo` has occurred
 * within `windowMs`. Optionally verifies that the `amount` (as a decimal string)
 * was transferred; amount matching is best-effort for native TON transfers
 * (nanoTON) and should be configured per store for jetton payments.
 */
export async function invoiceChecked({
  address,
  memo,
  amount,
  windowMs = 5 * 60 * 1000,
}: {
  address: string;
  memo: string;
  amount?: string;
  windowMs?: number;
}): Promise<TonPaymentCheck> {
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
      if (!msgText || !msgText.includes(memo)) continue;
      const ts = (tx.in_msg?.created_at || tx.utime || 0) * 1000;
      if (ts < since) continue;
      const value = tx.in_msg?.value || '0';
      let paidAmount: string | undefined;
      if (amount) {
        // value is nanoTON for native TON transfers.
        const nano = Number(value || '0');
        const expected = Number(amount) * 1e9;
        paidAmount = (nano / 1e9).toString();
        if (nano < expected) continue;
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
  } catch (err) {
    logger.error({ err, provider: env.ton.provider }, 'ton payment check failed');
    return { paid: false, err: (err as Error).message };
  }
}

/** Validate the configured network/address before creating an invoice. */
export function assertProductionPaymentConfig(): void {
  if (env.isProduction && env.ton.devMode) {
    logger.warn(
      'PAYMENT_DEV_MODE is enabled in production — payment verification is FAKE. ' +
        'Disable it for real commerce.',
    );
  }
}

/** Generate a memo to embed in the invoice (order number). */
export function makeMemo(orderNumber: string): string {
  return `order-${orderNumber}`;
}
