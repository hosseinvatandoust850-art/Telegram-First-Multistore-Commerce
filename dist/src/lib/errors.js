/** Lightweight, typed application errors with an HTTP status and a code. */
export class AppError extends Error {
    status;
    code;
    constructor(message, status = 400, code = 'APP_ERROR') {
        super(message);
        this.name = 'AppError';
        this.status = status;
        this.code = code;
    }
}
export class NotFoundError extends AppError {
    constructor(message = 'Not found') {
        super(message, 404, 'NOT_FOUND');
        this.name = 'NotFoundError';
    }
}
export class UnauthorizedError extends AppError {
    constructor(message = 'Unauthorized') {
        super(message, 401, 'UNAUTHORIZED');
        this.name = 'UnauthorizedError';
    }
}
export class ForbiddenError extends AppError {
    constructor(message = 'Forbidden') {
        super(message, 403, 'FORBIDDEN');
        this.name = 'ForbiddenError';
    }
}
export class ConflictError extends AppError {
    constructor(message = 'Conflict') {
        super(message, 409, 'CONFLICT');
        this.name = 'ConflictError';
    }
}
