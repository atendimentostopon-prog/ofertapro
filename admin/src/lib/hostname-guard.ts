export function isAllowedHost(hostname: string, isProd: boolean, allowedHost: string): boolean {
  if (!isProd) return true;
  return hostname === allowedHost;
}
