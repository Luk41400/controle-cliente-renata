export const SESSION_COOKIE = 'renata-sessao';
export const SESSION_PATH = '/api/admin';
export const SESSION_MAX_AGE = 7 * 24 * 60 * 60;
export const isSessionCookie = (name: string) => name === SESSION_COOKIE || /^renata-sessao\.(0|[1-9]\d*)$/.test(name);

export function rawSessionCookies(header: string) {
  const result: {name: string; value: string}[] = [];
  for (const part of header.split(';')) {
    const equal = part.indexOf('=');
    const name = part.slice(0, equal).trim();
    if (equal < 0 || !isSessionCookie(name)) continue;
    try { result.push({name, value: decodeURIComponent(part.slice(equal + 1).trim())}); } catch { /* Invalid cookie is not a session. */ }
  }
  return result;
}

export function selectedSessionCookies(header: string) {
  const cookies = rawSessionCookies(header);
  const chunked = cookies[0]?.name !== SESSION_COOKIE;
  const unique = new Map<string, {name: string; value: string}>();
  // Browsers send the most specific path first. Do not let a legacy root cookie
  // replace it, or combine a chunked session with another path's base cookie.
  for (const cookie of cookies) if ((cookie.name !== SESSION_COOKIE) === chunked && !unique.has(cookie.name)) unique.set(cookie.name, cookie);
  return [...unique.values()];
}
