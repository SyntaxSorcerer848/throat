import {
    BadRequestError,
    InternalServerError,
    NotFoundError,
    UnAuthorizedError,
} from '../generated/typescript/api/resources/common';

export let isStandardError = (error: any) => {
    return (
        error instanceof NotFoundError ||
        error instanceof BadRequestError ||
        error instanceof UnAuthorizedError ||
        error instanceof InternalServerError
    );
};
