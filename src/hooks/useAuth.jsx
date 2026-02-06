import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { sessionManager } from '@/lib/sessionManager';

const AuthContext = createContext({
  isReady: false,
  session: undefined,
  user: undefined,
  profile: undefined,
  role: undefined,
  tenantId: undefined,
  tenantName: undefined,
  signIn: async () => { throw new Error('Auth not initialized'); },
  signOut: async () => { throw new Error('Auth not initialized'); },
});

export function AuthProvider({ children }) {
  const [isReady, setIsReady] = useState(false);
  const [session, setSession] = useState();
  const [profile, setProfile] = useState();
  const [connectionStatus, setConnectionStatus] = useState('online');

  useEffect(() => {
    if (!supabase) {
      setIsReady(true);
      return;
    }

    let mounted = true;

    const init = async () => {
      try {
        console.log('[Auth] Inicializando sistema de autenticação...');
        
        // Inicializa o gerenciador de sessão
        await sessionManager.initialize();
        
        // Obtém estado inicial
        const authState = sessionManager.getAuthState();
        
        if (!mounted) return;
        
        if (authState.session) {
          setSession(authState.session);
          if (authState.session.user?.id) {
            await loadProfile(authState.session.user.id);
          }
        }
        
        console.log('[Auth] Inicialização concluída, estado:', authState.state);
        
      } catch (error) {
        console.error('[Auth] Erro na inicialização:', error);
      } finally {
        if (mounted) {
          setIsReady(true);
        }
      }
    };

    // Configura listener para mudanças de estado de autenticação
    const unsubscribeAuthState = sessionManager.onAuthStateChange((state, newSession) => {
      if (!mounted) return;
      
      console.log('[Auth] Estado de autenticação mudou:', state);
      
      switch (state) {
        case 'authenticated':
          setSession(newSession);
          if (newSession?.user?.id) {
            loadProfile(newSession.user.id);
          }
          setIsReady(true);
          break;
          
        case 'token_refreshed':
          console.log('[Auth] Token renovado automaticamente');
          setSession(newSession);
          // Não recarrega profile no refresh, apenas atualiza sessão
          setIsReady(true);
          break;
          
        case 'user_updated':
          setSession(newSession);
          if (newSession?.user?.id) {
            loadProfile(newSession.user.id);
          }
          break;
          
        case 'unauthenticated':
        case 'authentication_failed':
          setSession(undefined);
          setProfile(undefined);
          setIsReady(true);
          break;
          
        default:
          // Para outros estados, mantém estado atual
          break;
      }
    });

    // Listeners de conectividade
    const handleOnline = () => {
      console.log('[Auth] Conectividade restaurada');
      setConnectionStatus('online');
      // Força verificação de sessão quando volta online
      sessionManager.checkSession();
    };

    const handleOffline = () => {
      console.log('[Auth] Conectividade perdida');
      setConnectionStatus('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Safety timeout para garantir que isReady seja definido
    const readyTimeout = setTimeout(() => {
      if (mounted) {
        console.log('[Auth] Timeout de segurança atingido, definindo como pronto');
        setIsReady(true);
      }
    }, 5000);

    init();

    return () => {
      mounted = false;
      clearTimeout(readyTimeout);
      unsubscribeAuthState();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const loadProfile = async (userId) => {
    try {
      console.log('[Auth] Carregando perfil do usuário:', userId);
      
      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, full_name, role, tenant_id, tenant:tenants(name)')
        .eq('user_id', userId)
        .maybeSingle();
        
      if (error) {
        console.warn('[Auth] Erro ao carregar perfil:', error.message);
        setProfile(undefined);
        return;
      }
      
      console.log('[Auth] Perfil carregado:', data?.role || 'sem role');
      setProfile(data || undefined);
      
    } catch (error) {
      console.warn('[Auth] Erro inesperado ao carregar perfil:', error.message);
      setProfile(undefined);
    }
  };

  const signIn = async ({ email, password }) => {
    if (!supabase) throw new Error('Auth not configured');
    
    console.log('[Auth] Iniciando login...');
    
    const { data, error } = await supabase.auth.signInWithPassword({ 
      email, 
      password 
    });
    
    if (error) {
      console.error('[Auth] Erro no login:', error.message);
      throw error;
    }
    
    console.log('[Auth] Login bem-sucedido');
    
    // Após login bem-sucedido, tenta bootstrap de admin
    try {
      const token = data?.session?.access_token;
      const userId = data?.session?.user?.id;
      
      if (token) {
        console.log('[Auth] Tentando bootstrap de admin...');
        
        const res = await fetch('/api/admin/bootstrap', {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
        }).catch(() => undefined);
        
        if (res && res.ok) {
          const result = await res.json().catch(() => undefined);
          console.log('[Auth] Bootstrap result:', result);
          
          if (result?.promoted && userId) {
            // Recarrega perfil se foi promovido a admin
            await loadProfile(userId);
          }
        }
      }
    } catch (bootstrapError) {
      console.warn('[Auth] Erro no bootstrap (não crítico):', bootstrapError.message);
    }
    
    return data;
  };

  const signOut = async () => {
    if (!supabase) return;
    
    console.log('[Auth] Fazendo logout...');
    
    try {
      await supabase.auth.signOut();
      console.log('[Auth] Logout concluído');
    } catch (error) {
      console.error('[Auth] Erro no logout:', error.message);
      // Mesmo com erro, limpa estado local
      setSession(undefined);
      setProfile(undefined);
    }
  };

  const value = useMemo(() => ({
    isReady,
    session,
    user: session?.user,
    profile,
    role: profile?.role ?? 'operator',
    tenantId: profile?.tenant_id ?? undefined,
    tenantName: profile?.tenant?.name ?? undefined,
    token: session?.access_token,
    connectionStatus,
    signIn,
    signOut,
  }), [isReady, session, profile, connectionStatus]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}