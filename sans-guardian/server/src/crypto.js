// Encryption at rest for sensitive fields (genetic profile). AES-256-GCM.
// Set SG_DATA_KEY (64 hex chars) in production. Without it, a DEMO key is derived: fine for the
// prototype, never for real data.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

// The demo salt strings below are kept unchanged so existing local data stays readable.
const KEY = process.env.SG_DATA_KEY
  ? Buffer.from(process.env.SG_DATA_KEY, 'hex')
  : scryptSync('afya-space-demo-key', 'afya-space-salt', 32);

export const usingDemoKey = !process.env.SG_DATA_KEY;

export function encrypt(obj) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}

export function decrypt(token) {
  if (!token) return null;
  const [iv, tag, data] = token.split('.').map((s) => Buffer.from(s, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8'));
}
