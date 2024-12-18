import { config } from 'dotenv';
import path from 'path';
import moment from 'moment';
import { createLogger, format, transports } from 'winston';
import { Logtail } from '@logtail/node';
import { LogtailTransport } from '@logtail/winston';
const envPath = path.resolve(__dirname, '../../.env');

config({ path: envPath });

// Inisialisasi Logtail dengan API key
const LOGTAIL_API_KEY = process.env.LOGTAIL_API_KEY as string;
const logtail = new Logtail(LOGTAIL_API_KEY);

const { combine, timestamp, printf, colorize } = format;

const loggerFormat = printf(({ level, message, timestamp }) => {
  return `${timestamp} [${level}]: ${message}`;
});

export const Logger = createLogger({
  level: 'debug',
  format: combine(
    colorize(),
    timestamp({ format: () => moment().format('ddd, DD MMM YYYY HH:mm:ss') }),
    loggerFormat
  ),
  transports: [
    new transports.Console(), // Log ke console
    new LogtailTransport(logtail), // Log ke Logtail
  ],
});
