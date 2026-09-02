import * as winston from 'winston';
import * as fs from 'node:fs';
import * as path from 'node:path';

const logDir = './output/logs';

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const timestamp = new Date().toISOString().replaceAll(/:/g, '-').split('.')[0];
const logFile = path.join(logDir, `execution-${timestamp}.log`);

export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: logFile }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});