import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { DATA_DIR, db } from './db';
import type { User } from '../shared/types';

function loadSecret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const f = path.join(DATA_DIR, '.session-secret');
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim();
  const s = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(f, s, { mode: 0o600 });
  return s;
}
export const SESSION_SECRET = loadSecret();

export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}
export function verifyPassword(pw: string, stored: string): boolean {
  const [s, h] = stored.split(':');
  if (!s || !h) return false;
  const hash = crypto.scryptSync(pw, Buffer.from(s, 'hex'), 64);
  const want = Buffer.from(h, 'hex');
  return want.length === hash.length && crypto.timingSafeEqual(hash, want);
}

const COOKIE = 'lp_sid';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export function startSession(reply: FastifyReply, userId: number) {
  reply.setCookie(COOKIE, String(userId), { signed: true, httpOnly: true, sameSite: 'lax', path: '/', maxAge: MAX_AGE, secure: process.env.COOKIE_SECURE === '1' });
}
export function endSession(reply: FastifyReply) {
  reply.clearCookie(COOKIE, { path: '/' });
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: User;
  }
}

export function currentUser(req: FastifyRequest): User | undefined {
  const raw = req.cookies?.[COOKIE];
  if (!raw) return undefined;
  const un = req.unsignCookie(raw);
  if (!un.valid || !un.value) return undefined;
  const row = db.prepare('SELECT id, email, name, role FROM users WHERE id = ?').get(Number(un.value)) as User | undefined;
  return row;
}

/** preHandler: login required, plus a CSRF guard for anything that changes data. */
export async function requireUser(req: FastifyRequest, reply: FastifyReply) {
  const u = currentUser(req);
  if (!u) return reply.code(401).send({ error: 'กรุณาเข้าสู่ระบบ' });
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers['x-requested-with'] !== 'lp') {
    return reply.code(403).send({ error: 'คำขอไม่ถูกต้อง' });
  }
  req.user = u;
}
export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  await requireUser(req, reply);
  if (reply.sent) return;
  if (req.user!.role !== 'admin') return reply.code(403).send({ error: 'เฉพาะผู้ดูแลระบบ' });
}
