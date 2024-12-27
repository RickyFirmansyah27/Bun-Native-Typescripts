import { DBConnection } from './config/dbPoolInfra';
import { rabbitMqConnection } from './config/rabbitmqPoolInfra';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { parse } from 'url';
import routes from './routes';
import createMiddlewareHandler from './middlewares';
import { BaseResponse, HttpLogger, Logger } from './helper';

const port = 8101;

const routeHandlers = (req: IncomingMessage, res: ServerResponse) => {
  const method = req.method!;
  const url = parse(req.url!, true);
  const route = routes.find(
    (route) => route.path === url.pathname && route.method === method
  );

  if (route) {
    return route.handler(req, res);
  } else {
    BaseResponse(res, 'Route not found', 'notFound', null);
  }
};

const handler = createMiddlewareHandler(HttpLogger, routeHandlers);

const server = createServer(handler);
server.listen(port, '0.0.0.0', async () => {
  try {
    await DBConnection();
    await rabbitMqConnection();
    Logger.info(`[Auth-Service] Server is running on port ${port}`);
  } catch (error) {
    if (error instanceof Error) {
      Logger.error(
        `Error starting server: Message: ${error.message} | Stack: ${error.stack}`
      );
    } else {
      Logger.error(`Error starting server: ${String(error)}`);
    }
  }
});
