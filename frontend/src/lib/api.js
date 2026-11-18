import { supabase } from './supabase.js';

const BASE = import.meta.env.VITE_API_URL ?? '/api'; // cùng domain: Vercel chuyển /api/* tới service backend;

export class ApiError extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details; }
}

/** Gọi Express kèm JWT của phiên hiện tại. */
export async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const { data } = await supabase.auth.getSession();
    if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, json.error ?? 'Có lỗi xảy ra', json.details);
  return json;
}
