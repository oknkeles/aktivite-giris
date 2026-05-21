// Audit log helper — her kritik aksiyondan sonra çağrılır.
// İz kaydı kalır; failure case'lerde uygulamayı durdurmaz (catch'le yutuluyor).

import type { Request } from 'express';
import { prisma } from '../db.js';

export type AuditAction = 'create' | 'update' | 'delete' | 'login' | 'login_fail';
export type AuditTarget =
  | 'entry'
  | 'user'
  | 'customer'
  | 'contractor'
  | 'activity'
  | 'rate'
  | 'session';

interface AuditParams {
  userId?: number | null;
  username?: string | null;
  action: AuditAction;
  target: AuditTarget;
  targetId?: number | null;
  summary?: string;
  req?: Request;
}

function clientIp(req?: Request): string | null {
  if (!req) return null;
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string') return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || null;
}

export async function audit(params: AuditParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId ?? null,
        username: params.username ?? null,
        action: params.action,
        target: params.target,
        targetId: params.targetId ?? null,
        summary: params.summary ?? null,
        ip: clientIp(params.req),
      },
    });
  } catch (err) {
    // Audit'in fail olması ana akışı bozmamalı
    console.error('Audit log error:', err);
  }
}
