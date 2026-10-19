import pino from 'pino';
import { config } from '../config.js';

// Redact anything that could carry credentials, tokens, keys or message content.
export const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'headers.authorization',
  '*.password',
  '*.newPassword',
  '*.currentPassword',
  '*.refreshToken',
  '*.accessToken',
  '*.idToken',
  '*.ciphertext',
  '*.pushToken',
  '*.token',
];

export const logger = pino({
  level: config.NODE_ENV === 'test' ? 'silent' : config.LOG_LEVEL,
  redact: { paths: redactPaths, censor: '[redacted]' },
});
