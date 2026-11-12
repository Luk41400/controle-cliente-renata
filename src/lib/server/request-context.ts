import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';

type CookieWrite = {name: string; value: string; options: CookieOptions};
const storage = new AsyncLocalStorage<{id: string; path: string; cookies: Map<string, CookieWrite>}>();

export function diagnostic(code: string, status: number) {
  const context = storage.getStore();
  if (code === 'AUTH_REQUIRED') return;
  const detail = {event: 'request_failure', code, status, requestId: context?.id, route: context?.path};
  if (status >= 500) console.error(JSON.stringify(detail));
  else console.warn(JSON.stringify(detail));
}

export function stageCookie(cookie: CookieWrite) {
  const context = storage.getStore();
  if (!context) throw new Error('Cookie update outside route context');
  context.cookies.set(cookie.name + '\n' + (cookie.options.path || '/'), cookie);
}

export function discardCookies() { storage.getStore()?.cookies.clear(); }

export function requestContext(request: Request, handler: () => Promise<Response>) {
  return storage.run({id: randomUUID(), path: new URL(request.url).pathname, cookies: new Map()}, async () => {
    const response = await handler();
    const context = storage.getStore()!;
    response.headers.set('X-Request-Id', context.id);
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
    response.headers.set('Vary', 'Cookie, Origin');
    // Serialize separately: Next's mutable cookie jar merges by name and cannot
    // expire the same legacy cookie at / and /api/admin in one response.
    for (const {name, value, options} of context.cookies.values()) {
      const serialized = new NextResponse();
      serialized.cookies.set(name, value, options);
      response.headers.append('Set-Cookie', serialized.headers.get('Set-Cookie')!);
    }
    return response;
  });
}
