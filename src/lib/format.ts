export function money(v: number): string {
  return 'R$ ' + v.toFixed(2).replace('.', ',');
}
