export function hasPermission(granted: readonly string[], needed: string): boolean {
  return granted.includes('SUPER_ADMIN') || granted.includes(needed);
}
