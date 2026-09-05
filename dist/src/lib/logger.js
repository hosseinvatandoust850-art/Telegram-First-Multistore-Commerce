import pino from 'pino';
/**
 * Structured JSON logger. In production this emits structured logs so Railway
 * can index them. Never log secrets: message strings must not contain tokens,
 * or TON addresses used for credentials, or request bodies containing secrets.
 */
export const logger = pino({
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
    base: {
        service: 'telegram-commerce',
        env: process.env.NODE_ENV || 'development',
    },
    redact: {
        paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            '*.password',
            '*.token',
            '*.secret',
            '*.apiKey',
        ],
        censor: '[redacted]',
    },
});
