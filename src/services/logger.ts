import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'discord-bot' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(
          ({ level, message, timestamp, ...meta }) => {
            let metaStr = '';
            if (Object.keys(meta).length > 0 && meta.service) {
              const { service, ...rest } = meta;
              metaStr = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : '';
            }
            return `${timestamp} [${level}]: ${message}${metaStr}`;
          }
        )
      )
    }),
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      format: winston.format.json()
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      format: winston.format.json()
    })
  ]
});

export default logger;