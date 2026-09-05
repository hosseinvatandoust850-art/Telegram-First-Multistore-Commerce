import { query, queryOne } from '../db/pool.js';
const SETUP_KEY = '_system_setup';
async function getSystemSetting(key) {
    const row = await queryOne('SELECT value FROM "Setting" WHERE key = $1 AND "storeId" IS NULL', [key]);
    return row?.value ? JSON.parse(row.value) : null;
}
async function setSystemSetting(key, value) {
    await query(`INSERT INTO "Setting" (key, value, "storeId")
     VALUES ($1, $2, NULL)
     ON CONFLICT (key, "storeId") 
     DO UPDATE SET value = $2, "updatedAt" = now()`, [key, JSON.stringify(value)]);
}
export async function getSetupState() {
    const stored = await getSystemSetting(SETUP_KEY);
    if (!stored) {
        return {
            step: 'PENDING',
            completedAt: undefined,
            adminUserId: undefined,
            storeId: undefined,
            telegramBotConnected: false,
            paymentsConfigured: false,
            storageVerified: false,
            startedAt: new Date().toISOString(),
            lastUpdatedAt: new Date().toISOString(),
        };
    }
    return stored;
}
export async function updateSetupState(partial) {
    const current = await getSetupState();
    const updated = {
        ...current,
        ...partial,
        lastUpdatedAt: new Date().toISOString(),
    };
    // Auto-advance step based on completed actions
    if (partial.adminUserId && current.step === 'PENDING') {
        updated.step = 'ADMIN_CREATED';
    }
    if (partial.storeId && current.step === 'ADMIN_CREATED') {
        updated.step = 'STORE_CREATED';
    }
    if (partial.telegramBotConnected && current.step === 'STORE_CREATED') {
        updated.step = 'TELEGRAM_CONFIGURED';
    }
    if (partial.paymentsConfigured && current.step === 'TELEGRAM_CONFIGURED') {
        updated.step = 'PAYMENTS_CONFIGURED';
    }
    if (partial.storageVerified && ['TELEGRAM_CONFIGURED', 'PAYMENTS_CONFIGURED'].includes(current.step)) {
        updated.step = 'STORAGE_VERIFIED';
    }
    if (updated.step === 'PAYMENTS_CONFIGURED' || updated.step === 'STORAGE_VERIFIED') {
        if (updated.paymentsConfigured && updated.telegramBotConnected) {
            updated.step = 'COMPLETED';
            updated.completedAt = new Date().toISOString();
        }
    }
    await setSystemSetting(SETUP_KEY, updated);
    return updated;
}
export async function isSetupComplete() {
    const state = await getSetupState();
    return state.step === 'COMPLETED';
}
export async function resetSetup() {
    await query('DELETE FROM "Setting" WHERE key = $1 AND "storeId" IS NULL', [SETUP_KEY]);
}
