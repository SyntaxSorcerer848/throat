import express from 'express';
import authRouter from './auth';

let crmRouter = express.Router();

crmRouter.get('/ping', async (_, res) => {
    res.send({
        status: 'ok',
        message: 'PONG',
    });
});

crmRouter.use('/', authRouter);

export default crmRouter;
