import { Request } from 'express';

let skipRateLimitRoutes = (req: Request) => {
    let nonSecurePaths = ['/oauth-callback', '/oauth/refresh'];
    let nonSecurePathsPartialMatch = ['/integration-status', '/trello-request-token'];
    let allowedRoutes = ['/health-check'];
    if (
        nonSecurePaths.includes(req.path) ||
        nonSecurePathsPartialMatch.some((path) => req.path.includes(path)) ||
        allowedRoutes.includes(req.baseUrl + req.path)
    ) {
        return true;
    }
    return false;
};

export { skipRateLimitRoutes };
