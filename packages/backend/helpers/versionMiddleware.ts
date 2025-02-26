import { Request, Response, NextFunction } from 'express';

type API_VERSIONS = 'v1' | 'v2' | 'latest';

let DEFAULT_API_VERSION: API_VERSIONS = 'v1';

declare global {
    namespace Express {
        interface Request {
            version: API_VERSIONS;
        }
    }
}

let versionMiddleware = () => async (req: Request, _res: Response, next: () => any) => {
    let version = (req.headers['x-api-version'] as API_VERSIONS) || DEFAULT_API_VERSION;
    req.version = version;
    next();
};

type VersionMap = {
    [k in API_VERSIONS]?: any;
};

export let manageRouterVersioning = (versionMap: VersionMap) => {
    return (req: Request, res: Response, next: NextFunction) => {
        let { version } = req;
        let fn = versionMap[version] || versionMap[DEFAULT_API_VERSION]; // call the v1 function as default
        fn.call(this, req, res, next);
    };
};

export default versionMiddleware;
