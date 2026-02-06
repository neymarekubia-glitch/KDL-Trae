import { createClient } from '@supabase/supabase-js';

// IMPORTANT: use direct access to import.meta.env so Vite can inline values at build time
const { VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY } = import.meta.env;

if (!VITE_SUPABASE_URL || !VITE_SUPABASE_ANON_KEY) {
  // The app can still render, but auth features will be disabled without envs
  // We intentionally avoid throwing to allow static pages to work in preview
  console.warn('[Auth] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY envs. Login will be disabled.');
}

export const supabase = VITE_SUPABASE_URL && VITE_SUPABASE_ANON_KEY
  ? createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'oficina-auth-v2',
        // Configurações otimizadas para sessão estável
        refreshThreshold: 1800, // 30 minutos antes de expirar (mais eficiente)
        storage: {
          getItem: (key) => {
            try {
              return localStorage.getItem(key);
            } catch {
              return null;
            }
          },
          setItem: (key, value) => {
            try {
              localStorage.setItem(key, value);
            } catch {
              // Silently fail if storage is not available
            }
          },
          removeItem: (key) => {
            try {
              localStorage.removeItem(key);
            } catch {
              // Silently fail if storage is not available
            }
          }
        }
      },
      global: {
        headers: {
          'X-Client-Info': 'oficina-web@1.0.0'
        }
      }
    })
  : undefined;
