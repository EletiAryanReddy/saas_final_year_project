export class ApiError extends Error {
  status: number; code?: string;
  constructor(status: number, message: string, code?: string) { super(message); this.status = status; this.code = code; }
}

let token: string | null = null;
let workspaceId: string | null = null;
let refreshing: Promise<any> | null = null;
let onAuthLost: (() => void) | null = null;

export const getToken = () => token;
export const setToken = (t: string | null) => { token = t; };
export const setWorkspaceId = (id: string | null) => { workspaceId = id; };
export const setAuthLostHandler = (fn: () => void) => { onAuthLost = fn; };

/** Exchanges the httpOnly refresh cookie for a new access token. Single-flight so parallel 401s share one call. */
export function refreshSession(): Promise<{ accessToken: string; user: any } | null> {
  if (!refreshing) {
    refreshing = fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
      .then(async (r) => { if (!r.ok) return null; const j = await r.json(); token = j.accessToken; return j; })
      .catch(() => null)
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

export const qstr = (o: Record<string, any> = {}) => {
  const p = new URLSearchParams();
  Object.entries(o).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') p.set(k, String(v)); });
  const s = p.toString();
  return s ? `?${s}` : '';
};

async function request<T>(method: string, path: string, body?: any, opts: { form?: boolean; blob?: boolean; retry?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (workspaceId) headers['x-workspace-id'] = workspaceId;
  if (body !== undefined && !opts.form) headers['Content-Type'] = 'application/json';
  // uploads can bypass the Next.js proxy (some hosts cap proxied body size); auth is via Bearer so CORS is fine
  const base = opts.form && process.env.NEXT_PUBLIC_API_URL ? `${process.env.NEXT_PUBLIC_API_URL}/api` : '/api';
  const res = await fetch(base + path, { method, headers, credentials: 'include', body: body === undefined ? undefined : opts.form ? body : JSON.stringify(body) });

  if (res.status === 401 && opts.retry !== false && !path.startsWith('/auth/login') && !path.startsWith('/auth/refresh')) {
    const s = await refreshSession();
    if (s) return request<T>(method, path, body, { ...opts, retry: false });
    onAuthLost?.();
  }
  if (!res.ok) {
    let j: any = null;
    try { j = await res.json(); } catch { /* not json */ }
    throw new ApiError(res.status, j?.message || res.statusText || 'Request failed', j?.code);
  }
  if (opts.blob) return (await res.blob()) as any;
  return (res.status === 204 ? null : await res.json()) as T;
}

export const api = {
  get: <T = any>(p: string) => request<T>('GET', p),
  post: <T = any>(p: string, b?: any) => request<T>('POST', p, b ?? {}),
  patch: <T = any>(p: string, b?: any) => request<T>('PATCH', p, b ?? {}),
  put: <T = any>(p: string, b?: any) => request<T>('PUT', p, b ?? {}),
  del: <T = any>(p: string, b?: any) => request<T>('DELETE', p, b),
  upload: <T = any>(p: string, form: FormData) => request<T>('POST', p, form, { form: true }),
  blob: (p: string) => request<Blob>('GET', p, undefined, { blob: true }),
};

/** Fetch an authenticated file and hand it to the browser (download or open in a tab). */
export async function fetchFile(id: string, name: string, mode: 'download' | 'view') {
  const blob = await api.blob(`/files/${id}/${mode === 'view' ? 'view' : 'download'}`);
  const url = URL.createObjectURL(blob);
  if (mode === 'view') { window.open(url, '_blank'); setTimeout(() => URL.revokeObjectURL(url), 60_000); return; }
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
