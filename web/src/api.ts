import { useCallback, useEffect, useState } from 'react';
import type { Bundle, Category } from '../../shared/types';

export async function api<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { 'x-requested-with': 'lp', ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error((data && data.error) || `เกิดข้อผิดพลาด (${res.status})`);
  return data as T;
}

export async function upload<T = unknown>(url: string, file: File): Promise<T> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(url, { method: 'POST', headers: { 'x-requested-with': 'lp' }, body: fd, credentials: 'same-origin' });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error((data && data.error) || `อัปโหลดไม่สำเร็จ (${res.status})`);
  return data as T;
}

export const fileUrl = (name: string | null | undefined) => (name ? `/files/${name}` : '');

export interface ProjectRow {
  id: number;
  name: string;
  client: string;
  project_no: string;
  revision: string;
  doc_date: string;
  updated_at: string;
  points: number;
  items?: number;
  floors: number;
}

/** Loads a project bundle; `reload()` refetches after any change. */
export function useBundle(pid: number) {
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [error, setError] = useState('');
  const reload = useCallback(async () => {
    try {
      setBundle(await api<Bundle>('GET', `/api/projects/${pid}`));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [pid]);
  useEffect(() => {
    setBundle(null);
    void reload();
  }, [reload]);
  return { bundle, setBundle, reload, error };
}

export function useToast() {
  const [msg, setMsg] = useState('');
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(''), 4500);
    return () => clearTimeout(t);
  }, [msg]);
  return { msg, show: setMsg };
}

/** Material categories (built-in + the studio's own); `reload()` refetches. */
export function useCategories() {
  const [items, setItems] = useState<Category[] | null>(null);
  const reload = useCallback(async () => setItems(await api<Category[]>('GET', '/api/categories')), []);
  useEffect(() => void reload(), [reload]);
  return { items, reload };
}
