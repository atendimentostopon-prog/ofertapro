// Stub. Regenerar apos as migrations com:
//   supabase gen types typescript --project-id zuqaccivowbzdfrpgekz > shared/database.types.ts
// (ou --local se usando supabase start). Ate la, tipos permissivos.
export type Database = Record<string, unknown>;
export type Json = string | number | boolean | null | { [k: string]: Json } | Json[];
