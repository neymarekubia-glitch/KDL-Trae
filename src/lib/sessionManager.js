import { supabase } from './supabaseClient';

/**
 * GERENCIADOR DE SESSÃO AUTOMÁTICO - SOLUÇÃO DEFINITIVA
 * 
 * Este módulo resolve completamente o problema de travamento por token expirado:
 * - Renova sessão automaticamente antes da expiração
 * - Detecta e recupera de falhas de autenticação
 * - Previne loading infinito
 * - Redireciona para login apenas quando necessário
 */

class SessionManager {
  constructor() {
    this.isInitialized = false;
    this.currentSession = null;
    this.refreshPromise = null;
    this.authStateListeners = [];
    this.sessionCheckInterval = null;
    
    // Estados de autenticação
    this.authStates = {
      LOADING: 'loading',
      AUTHENTICATED: 'authenticated', 
      UNAUTHENTICATED: 'unauthenticated',
      ERROR: 'error'
    };
    
    this.currentAuthState = this.authStates.LOADING;
  }

  /**
   * Inicializa o gerenciador de sessão
   * DEVE ser chamado no início da aplicação
   */
  async initialize() {
    if (this.isInitialized || !supabase) return;
    
    console.log('[SessionManager] Inicializando gerenciador de sessão...');
    
    try {
      // 1. Recupera sessão atual
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) {
        console.warn('[SessionManager] Erro ao recuperar sessão:', error.message);
        this.currentAuthState = this.authStates.UNAUTHENTICATED;
      } else if (session) {
        console.log('[SessionManager] Sessão ativa encontrada');
        this.currentSession = session;
        this.currentAuthState = this.authStates.AUTHENTICATED;
        this.scheduleTokenRefresh(session);
      } else {
        console.log('[SessionManager] Nenhuma sessão ativa');
        this.currentAuthState = this.authStates.UNAUTHENTICATED;
      }

      // 2. Configura listener de mudanças de autenticação
      supabase.auth.onAuthStateChange((event, session) => {
        console.log('[SessionManager] Auth state change:', event);
        
        switch (event) {
          case 'SIGNED_IN':
            this.currentSession = session;
            this.currentAuthState = this.authStates.AUTHENTICATED;
            this.scheduleTokenRefresh(session);
            this.notifyAuthStateChange('authenticated', session);
            break;
            
          case 'SIGNED_OUT':
            this.currentSession = null;
            this.currentAuthState = this.authStates.UNAUTHENTICATED;
            this.clearTokenRefresh();
            this.notifyAuthStateChange('unauthenticated', null);
            break;
            
          case 'TOKEN_REFRESHED':
            console.log('[SessionManager] Token renovado automaticamente');
            this.currentSession = session;
            this.currentAuthState = this.authStates.AUTHENTICATED;
            this.scheduleTokenRefresh(session);
            this.notifyAuthStateChange('token_refreshed', session);
            break;
            
          case 'USER_UPDATED':
            this.currentSession = session;
            this.notifyAuthStateChange('user_updated', session);
            break;
            
          default:
            console.log('[SessionManager] Evento de auth desconhecido:', event);
        }
      });

      // 3. Configura verificação periódica de sessão (backup)
      this.startPeriodicSessionCheck();
      
      this.isInitialized = true;
      console.log('[SessionManager] Inicialização concluída');
      
    } catch (error) {
      console.error('[SessionManager] Erro na inicialização:', error);
      this.currentAuthState = this.authStates.ERROR;
    }
  }

  /**
   * Agenda renovação automática do token
   */
  scheduleTokenRefresh(session) {
    if (!session?.expires_at) return;
    
    this.clearTokenRefresh();
    
    const expiresAt = session.expires_at * 1000; // Converte para ms
    const now = Date.now();
    const timeUntilExpiry = expiresAt - now;
    
    // Renova 5 minutos antes de expirar (ou imediatamente se já expirou)
    const refreshIn = Math.max(0, timeUntilExpiry - (5 * 60 * 1000));
    
    console.log(`[SessionManager] Token expira em ${Math.round(timeUntilExpiry / 1000 / 60)} min, renovando em ${Math.round(refreshIn / 1000 / 60)} min`);
    
    this.refreshTimeout = setTimeout(() => {
      this.refreshSessionSafely();
    }, refreshIn);
  }

  /**
   * Renova sessão de forma segura
   */
  async refreshSessionSafely() {
    if (this.refreshPromise) {
      console.log('[SessionManager] Refresh já em andamento, aguardando...');
      return this.refreshPromise;
    }

    console.log('[SessionManager] Iniciando renovação de sessão...');
    
    this.refreshPromise = this.performSessionRefresh();
    
    try {
      const result = await this.refreshPromise;
      return result;
    } finally {
      this.refreshPromise = null;
    }
  }

  /**
   * Executa a renovação da sessão
   */
  async performSessionRefresh() {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      
      if (error) {
        console.error('[SessionManager] Erro ao renovar sessão:', error.message);
        
        // Se o refresh falhou, tenta recuperar sessão atual
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError || !sessionData.session) {
          console.log('[SessionManager] Sessão inválida, redirecionando para login...');
          this.handleAuthenticationFailure();
          return { success: false, error: error.message };
        }
        
        // Se ainda tem sessão válida, agenda próximo refresh
        this.scheduleTokenRefresh(sessionData.session);
        return { success: true, session: sessionData.session };
      }
      
      if (data.session) {
        console.log('[SessionManager] Sessão renovada com sucesso');
        this.currentSession = data.session;
        this.scheduleTokenRefresh(data.session);
        return { success: true, session: data.session };
      }
      
      console.warn('[SessionManager] Refresh retornou sem sessão');
      this.handleAuthenticationFailure();
      return { success: false, error: 'No session returned' };
      
    } catch (error) {
      console.error('[SessionManager] Erro inesperado no refresh:', error);
      this.handleAuthenticationFailure();
      return { success: false, error: error.message };
    }
  }

  /**
   * Verifica periodicamente se a sessão ainda é válida
   */
  startPeriodicSessionCheck() {
    // Verifica a cada 2 minutos
    this.sessionCheckInterval = setInterval(async () => {
      if (this.currentAuthState !== this.authStates.AUTHENTICATED) return;
      
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error || !session) {
          console.warn('[SessionManager] Sessão perdida detectada na verificação periódica');
          this.handleAuthenticationFailure();
        }
      } catch (error) {
        console.warn('[SessionManager] Erro na verificação periódica:', error.message);
      }
    }, 2 * 60 * 1000); // 2 minutos
  }

  /**
   * Limpa timers de renovação
   */
  clearTokenRefresh() {
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
      this.refreshTimeout = null;
    }
  }

  /**
   * Trata falhas de autenticação
   */
  handleAuthenticationFailure() {
    console.log('[SessionManager] Tratando falha de autenticação...');
    
    this.currentSession = null;
    this.currentAuthState = this.authStates.UNAUTHENTICATED;
    this.clearTokenRefresh();
    
    // Notifica listeners
    this.notifyAuthStateChange('authentication_failed', null);
    
    // Redireciona para login se não estiver já lá
    if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
      console.log('[SessionManager] Redirecionando para login...');
      setTimeout(() => {
        window.location.assign('/login');
      }, 1000);
    }
  }

  /**
   * Adiciona listener para mudanças de estado de auth
   */
  onAuthStateChange(callback) {
    this.authStateListeners.push(callback);
    
    // Chama imediatamente com estado atual se já inicializado
    if (this.isInitialized) {
      callback(this.currentAuthState, this.currentSession);
    }
    
    // Retorna função para remover listener
    return () => {
      const index = this.authStateListeners.indexOf(callback);
      if (index > -1) {
        this.authStateListeners.splice(index, 1);
      }
    };
  }

  /**
   * Notifica todos os listeners sobre mudanças de estado
   */
  notifyAuthStateChange(state, session) {
    this.authStateListeners.forEach(callback => {
      try {
        callback(state, session);
      } catch (error) {
        console.error('[SessionManager] Erro em listener:', error);
      }
    });
  }

  /**
   * Retorna o estado atual da autenticação
   */
  getAuthState() {
    return {
      state: this.currentAuthState,
      session: this.currentSession,
      isLoading: this.currentAuthState === this.authStates.LOADING,
      isAuthenticated: this.currentAuthState === this.authStates.AUTHENTICATED,
      isUnauthenticated: this.currentAuthState === this.authStates.UNAUTHENTICATED
    };
  }

  /**
   * Força uma verificação de sessão
   */
  async checkSession() {
    if (!supabase) return null;
    
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) {
        console.warn('[SessionManager] Erro ao verificar sessão:', error.message);
        return null;
      }
      
      return session;
    } catch (error) {
      console.error('[SessionManager] Erro inesperado ao verificar sessão:', error);
      return null;
    }
  }

  /**
   * Cleanup ao destruir
   */
  destroy() {
    this.clearTokenRefresh();
    
    if (this.sessionCheckInterval) {
      clearInterval(this.sessionCheckInterval);
      this.sessionCheckInterval = null;
    }
    
    this.authStateListeners = [];
    this.isInitialized = false;
  }
}

// Instância singleton
export const sessionManager = new SessionManager();

/**
 * WRAPPER SEGURO PARA CHAMADAS AO SUPABASE
 * Detecta falhas por sessão expirada e tenta renovar automaticamente
 */
export async function safeQuery(queryFn, maxRetries = 1) {
  if (!supabase) {
    throw new Error('Supabase não está configurado');
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await queryFn();
      
      // Se a query foi bem-sucedida, retorna o resultado
      if (result && !result.error) {
        return result;
      }
      
      // Se houve erro relacionado à autenticação
      if (result?.error?.message?.includes('JWT') || 
          result?.error?.message?.includes('expired') ||
          result?.error?.message?.includes('invalid') ||
          result?.error?.status === 401) {
        
        console.warn(`[safeQuery] Erro de autenticação detectado (tentativa ${attempt + 1}):`, result.error.message);
        
        // Se não é a última tentativa, tenta renovar a sessão
        if (attempt < maxRetries) {
          console.log('[safeQuery] Tentando renovar sessão...');
          
          const refreshResult = await sessionManager.refreshSessionSafely();
          
          if (refreshResult.success) {
            console.log('[safeQuery] Sessão renovada, tentando query novamente...');
            continue; // Tenta a query novamente
          } else {
            console.error('[safeQuery] Falha ao renovar sessão:', refreshResult.error);
            break; // Para de tentar
          }
        }
      }
      
      // Retorna o resultado (mesmo com erro) se não é problema de auth
      return result;
      
    } catch (error) {
      console.error(`[safeQuery] Erro inesperado (tentativa ${attempt + 1}):`, error);
      
      // Se é a última tentativa ou não é erro de rede, relança o erro
      if (attempt === maxRetries || !error.message.includes('fetch')) {
        throw error;
      }
      
      // Aguarda um pouco antes de tentar novamente
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  throw new Error('Máximo de tentativas excedido');
}

export default sessionManager;