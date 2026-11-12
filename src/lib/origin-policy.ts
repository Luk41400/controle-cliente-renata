export function normalizeOrigin(value: string, production = false) {
  const url = new URL(value.trim());
  if (!['https:', 'http:'].includes(url.protocol) || (production && url.protocol !== 'https:') ||
      url.hostname.includes('*') || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Invalid origin configuration');
  return url.origin;
}

export function originPolicy(environment: Record<string, string | undefined> = process.env) {
  const production = Boolean(environment.VERCEL);
  const primary = normalizeOrigin(environment.APP_ORIGIN || (production ? '' : 'http://localhost:3000'), production);
  const allowed = new Set([primary, ...(environment.APP_ALLOWED_ORIGINS || '').split(',').filter(v => v.trim()).map(v => normalizeOrigin(v, production))]);
  return { primary, allowed, production };
}

export function originFailure(request: Request, policy: ReturnType<typeof originPolicy>): string | null {
  const origin = request.headers.get('origin');
  if (!origin || origin === 'null') return 'missing_origin';
  let normalized: string;
  try { normalized = normalizeOrigin(origin, policy.production); } catch { return 'invalid_origin'; }
  if (!policy.allowed.has(normalized)) return 'origin_not_allowed';
  if (request.headers.get('sec-fetch-site')?.trim().toLowerCase() === 'cross-site') return 'cross_site';
  // Host does not authorize origins: both must already match an explicit entry.
  // Forwarded host/protocol and Referer are never substitutes for Origin.
  try {
    const host = request.headers.get('host') || new URL(request.url).host;
    const target = normalizeOrigin(new URL(normalized).protocol + '//' + host, policy.production);
    if (target !== normalized) return 'target_mismatch';
  } catch { return 'target_mismatch'; }
  return null;
}
