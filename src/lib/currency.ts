/**
 * currency.ts — Utilitários de moeda para formatação e parsing em BRL
 */

/**
 * Retorna apenas os dígitos de uma string.
 */
export function onlyDigits(value: string): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\D/g, '');
}

/**
 * Converte uma entrada de string (digitada, colada, formatada) para centavos.
 * Exemplo:
 *   "1" -> 1 (R$ 0,01)
 *   "10" -> 10 (R$ 0,10)
 *   "100" -> 100 (R$ 1,00)
 *   "1000" -> 1000 (R$ 10,00)
 *   "10000" -> 10000 (R$ 100,00)
 *   "100000" -> 100000 (R$ 1.000,00)
 *   "R$ 1.000,00" -> 100000 (R$ 1.000,00)
 *   "1000,00" -> 100000 (R$ 1.000,00)
 *   "1.000,00" -> 100000 (R$ 1.000,00)
 */
export function parseCurrencyInputToCents(value: string): number {
  const digits = onlyDigits(value);
  if (!digits) return 0;
  return parseInt(digits, 10);
}

/**
 * Formata um valor em centavos para a representação em BRL (R$ 1.000,00).
 */
export function formatCentsToBRL(cents: number): string {
  const value = cents / 100;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

/**
 * Formata uma string de entrada do usuário para o formato visual de moeda BRL (R$ X.XXX,XX).
 * Ideal para ser usada em tempo de digitação (onChange).
 */
export function formatCurrencyInput(value: string): string {
  const digits = onlyDigits(value);
  if (!digits) return '';
  const cents = parseInt(digits, 10);
  return formatCentsToBRL(cents);
}

/**
 * Converte centavos do frontend para o valor decimal esperado pelo banco (DECIMAL(10,2)).
 * Exemplo: 100000 centavos -> 1000.00
 */
export function centsToDatabaseValue(cents: number): number {
  return cents / 100;
}

/**
 * Converte o valor retornado do banco (decimal/float/string/unknown) para o formato interno de centavos.
 * Exemplo: 1000.00 -> 100000
 */
export function databaseValueToCents(value: unknown): number {
  if (value === null || value === undefined) return 0;
  
  if (typeof value === 'number') {
    return Math.round(value * 100);
  }
  
  if (typeof value === 'string') {
    const cleanStr = value.trim();
    if (!cleanStr) return 0;
    const num = parseFloat(cleanStr);
    if (isNaN(num)) return 0;
    return Math.round(num * 100);
  }
  
  return 0;
}
