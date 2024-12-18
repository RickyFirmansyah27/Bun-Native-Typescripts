import * as amqp from 'amqplib';
import { Logger } from '../helper';
import { config } from 'dotenv';
import path from 'path';
const envPath = path.resolve(__dirname, '../../.env');

config({ path: envPath });

let connection: amqp.Connection | null = null;

const contextLogger = '[CloudAMQP - connection]';
const RABBITMQ_URL = process.env.RABBITMQ_URL;

interface RabbitmqConfig {
  exchangeName: string;
  heavyLoadThreshold: number;
  prefetch: number;
  ackInterval: number;
  listenerRetryInterval: number;
  connectRetryInterval: number;
}

const rabbitmqConfig: RabbitmqConfig = {
  exchangeName: 'myapp-rabbitmq',
  heavyLoadThreshold: 15,
  prefetch: 2,
  ackInterval: 1000,
  listenerRetryInterval: 10000,
  connectRetryInterval: 100
};

interface Message {
  request: any;
  params?: {
    message: any;
  };
}

type ConnectionCallback = (conn: amqp.Connection | null, err?: Error) => void;

export const rabbitMqConnection = (): Promise<amqp.Connection> => {
  return new Promise((resolve, reject) => {
    connectRabbitmq((conn, err) => {
      if (err) {
        Logger.error('SCHEDULER', 'rabbitMqConnection', 'Error connecting to RabbitMQ', { error: err.message, stack: err.stack });
        reject(err);
        return;
      }

      if (!conn) {
        const error = new Error('No connection established');
        Logger.error('SCHEDULER', 'rabbitMqConnection', 'No RabbitMQ connection', { error: error.message });
        reject(error);
        return;
      }

      Logger.info(`${contextLogger} | RabbitMQ connection successfully`);
      resolve(conn);
    });
  });
};

export const connectRabbitmq = (main: ConnectionCallback): void => {
  if (!RABBITMQ_URL) {
    main(null, new Error('RABBITMQ_URL is not defined'));
    return;
  }

  amqp.connect(RABBITMQ_URL)
    .then(conn => main(conn))
    .catch(err => {
      Logger.info('SCHEDULER', 'connectRabbitmq', 'Error', { err });
      main(null, err);
    });
};

export const createConnection = (): Promise<amqp.Connection> => {
  return new Promise((resolve, reject) => {
    connectRabbitmq((conn, err) => {
      if (err) {
        reject(err);
        return;
      }

      if (!conn) {
        reject(new Error('No connection established'));
        return;
      }
      
      conn.on('close', async () => {
        try {
          connection = null;
          Logger.info('SCHEDULER', 'RabbitMQ Connection', 'close', { message: 'Closing Connection and Recreating connection' });
          if (!connection) await createConnection();
        } catch (err) {
          Logger.info('SCHEDULER', 'RabbitMQ Connection', 'close', { err });
          await createConnection();
        }
      });

      conn.on('error', (err) => {
        Logger.info('SCHEDULER', 'RabbitMQ Connection', 'error', err);
      });

      connection = conn;
      resolve(conn);
    });
  });
};

export const sendToQueue = (
  conn: amqp.Connection, 
  queueName: string, 
  exchangeName: string, 
  message: Message, 
  callback: () => void
): void => {
  conn.createConfirmChannel()
    .then(ch => {
      ch.assertExchange(exchangeName, 'direct');
      const params = {
        message: message
      };
      ch.publish(
        exchangeName,
        queueName,
        Buffer.from(JSON.stringify({ request: message.request, params: params }))
      );
      callback();
    })
    .catch(error => {
      Logger.info('SCHEDULER', 'sendToQueue', 'error', error);
      setTimeout(() => {
        attemptSend(message, queueName, (err) => {
          if (err) {
            Logger.info('SCHEDULER', 'sendToQueue retry failed', 'error', err);
          }
        });
      }, rabbitmqConfig.connectRetryInterval);
    });
};

export const attemptSend = (
  message: Message, 
  queueName: string, 
  callback: (err: Error | null, result?: string) => void
): void => {
  if (!connection) {
    callback(new Error('No active RabbitMQ connection'));
    return;
  }

  sendToQueue(
    connection,
    queueName,
    rabbitmqConfig.exchangeName,
    message,
    () => {
      Logger.info('SCHEDULER', 'send to Queue RabbitMQ with message', JSON.stringify(message));
      callback(null, 'Transaction is being processed');
    }
  );
};

export const listenQueue = (
  qName: string, 
  receiveHandler: (ch: amqp.Channel, msg: amqp.ConsumeMessage) => Promise<void>
): void => {
  if (!connection) {
    Logger.info('SCHEDULER', 'listenQueue', 'Error', 'No active RabbitMQ connection');
    return;
  }

  const exName = rabbitmqConfig.exchangeName;
  connection.createChannel()
    .then(ch => {
      ch.assertExchange(exName, 'direct');
      return ch.assertQueue(qName, { durable: true })
        .then(q => {
          ch.bindQueue(q.queue, exName, qName);
          ch.prefetch(rabbitmqConfig.prefetch);
          ch.consume(q.queue, async (msg) => {
            try {
              if (!msg || !msg.content) {
                Logger.info('SCHEDULER', `RabbitMQ ${qName}`, 'Waiting Queue');
              } else {
                await receiveHandler(ch, msg);
              }
            } catch (error) {
              Logger.info('GENERATE_PROCESSOR ERROR', 'SCHEDULE', error);
              Logger.info('GENERATE_PROCESSOR ERROR', 'SCHEDULER', qName, JSON.stringify(error));
            }
          }, {
            noAck: false
          });

          return ch;
        });
    })
    .catch(err => {
      Logger.info('SCHEDULER', `RabbitMQ ${qName}`, 'Waiting Queue Error: ', err);
      throw err;
    });
};