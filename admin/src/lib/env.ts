function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Env ausente: ${name}`);
  return value;
}

export const ENV = {
  supabaseUrl: required('VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL),
  supabaseAnonKey: required('VITE_SUPABASE_ANON_KEY', import.meta.env.VITE_SUPABASE_ANON_KEY),
  adminApiUrl: required('VITE_ADMIN_API_URL', import.meta.env.VITE_ADMIN_API_URL),
  adminHostname: import.meta.env.VITE_ADMIN_HOSTNAME || 'admin.aflyo.com.br',
  isProd: import.meta.env.PROD,
};
