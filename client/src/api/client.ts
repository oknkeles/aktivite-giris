const BASE = '/api';

function getToken(): string | null {
  return localStorage.getItem('aktivite_token');
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(BASE + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await res.json() : null;
  if (!res.ok) {
    throw new ApiError(body?.error || res.statusText, res.status);
  }
  return body as T;
}

export const api = {
  get: <T = any>(path: string) => request<T>(path),
  post: <T = any>(path: string, data?: any) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(data ?? {}) }),
  patch: <T = any>(path: string, data?: any) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(data ?? {}) }),
  put: <T = any>(path: string, data?: any) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(data ?? {}) }),
  delete: <T = any>(path: string) => request<T>(path, { method: 'DELETE' }),
};

// ── Domain types ─────────────────────────────────
export interface User {
  id: number;
  username: string;
  fullname: string;
  role: 'admin' | 'user';
  phone?: string | null;
}

export interface Activity {
  id: number;
  name: string;
  unit: string;
  desc?: string | null;
}

export interface Contractor {
  id: number;
  name: string;
  contact?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  discount: number;
  _count?: { customers: number };
}

export interface CustomerRate {
  id: number;
  customerId: number;
  activityId: number;
  rate: number;
}

export interface Customer {
  id: number;
  name: string;
  contractorId: number;
  contact?: string | null;
  phone?: string | null;
  contractor: Contractor;
  rates: CustomerRate[];
}

export interface Entry {
  id: number;
  date: string;
  qty: number;
  ticketId?: string | null;
  note?: string | null;
  customerId: number;
  activityId: number;
  userId: number;
  customer: Customer;
  activity: Activity;
  user: { id: number; username: string; fullname: string };
}

export interface ReportData {
  entries: Array<{
    id: number;
    date: string;
    qty: number;
    unit: string;
    hours: number;
    days: number;
    ticketId: string | null;
    note: string | null;
    customerId: number;
    customerName: string;
    contractorId: number;
    contractorName: string;
    discount: number;
    activityId: number;
    activityName: string;
    dayRate: number;
    gross: number;
    net: number;
  }>;
  totalGross: number;
  totalNet: number;
  totalHours: number;
  count: number;
}
