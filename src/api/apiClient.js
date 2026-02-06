// Generic API client for provider-agnostic REST backends

// Use direct import.meta.env access so Vite replaces at build time
import { supabase } from '@/lib/supabaseClient';
import { safeQuery } from '@/lib/sessionManager';

// Base URL and mapping
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');
let RESOURCE_MAP = {};
try {
  RESOURCE_MAP = JSON.parse(import.meta.env.VITE_API_RESOURCE_MAP || '{}');
} catch (_) {
  RESOURCE_MAP = {};
}

// Optional custom auth header/value and static token
const AUTH_HEADER = import.meta.env.VITE_API_AUTH_HEADER;
const AUTH_VALUE = import.meta.env.VITE_API_AUTH_VALUE;
const TOKEN = import.meta.env.VITE_API_TOKEN;

// Client-side request timeout (ms) - timeout otimizado
const REQUEST_TIMEOUT_MS = Number(import.meta.env.VITE_API_REQUEST_TIMEOUT_MS || 30000);

function withTimeout(fetchPromise, timeoutMs) {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), timeoutMs);
  return fetchPromise(controller.signal)
    .finally(() => clearTimeout(timerId));
}

// Retry simples para erros de rede
async function retryWithBackoff(fn, maxRetries = 2, baseDelay = 1000) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isLastAttempt = attempt === maxRetries - 1;
      const isRetryableError = error?.name === 'AbortError' || 
                               error?.message === 'request_timeout';
      
      if (isLastAttempt || !isRetryableError) {
        throw error;
      }
      
      const delay = baseDelay * (attempt + 1);
      console.warn(`[API] Tentativa ${attempt + 1} falhou, retry em ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

async function doFetch(url, options, timeoutMs) {
  const exec = (signal) => fetch(url, { ...options, signal });
  
  return retryWithBackoff(async () => {
    try {
      return await withTimeout(exec, timeoutMs || REQUEST_TIMEOUT_MS);
    } catch (e) {
      if (e?.name === 'AbortError') {
        throw new Error('request_timeout');
      }
      throw e;
    }
  });
}

async function request(method, path, { query, body, headers: extraHeaders, timeoutMs } = {}) {
  const base = API_BASE_URL || '';
  const url = new URL(`${base}${path}` || path, window.location.origin);
  if (query && typeof query === 'object') {
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      url.searchParams.set(key, String(value));
    });
  }

  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' };
  if (AUTH_HEADER && AUTH_VALUE) headers[AUTH_HEADER] = AUTH_VALUE;
  if (extraHeaders && typeof extraHeaders === 'object') {
    Object.assign(headers, extraHeaders);
  }
  // Only add Authorization automatically if caller did not provide one
  if (!headers['Authorization']) {
    if (TOKEN) {
      headers['Authorization'] = `Bearer ${TOKEN}`;
    } else if (supabase) {
      // Obtenção simples de token - sessionManager cuida da renovação
      try {
        const { data } = await supabase.auth.getSession();
        const accessToken = data?.session?.access_token;
        
        if (accessToken) {
          headers['Authorization'] = `Bearer ${accessToken}`;
        }
      } catch (e) {
        console.warn('[API] Erro ao obter token:', e.message);
      }
    }
  }

  let response = await doFetch(url.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  }, timeoutMs);

  if (!response.ok) {
    const status = response.status;
    const text = await response.text().catch(() => '');
    
    // Não tenta recuperação aqui - deixa o safeQuery cuidar disso
    throw new Error(`API ${method} ${url.pathname} failed: ${status} ${response.statusText} ${text}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  // Try to parse JSON even if header is missing; otherwise error
  try {
    return await response.json();
  } catch (_) {
    throw new Error('invalid_content_type');
  }
}

function buildQuery(criteria, sort) {
  const query = { ...(criteria || {}) };
  if (sort) query.sort = sort;
  return query;
}

export function createEntityApi(resourceName) {
  const mappedName = RESOURCE_MAP[resourceName] || resourceName;
  const resourcePath = `/${mappedName}`;

  return {
    async list(sort, options) {
      const query = buildQuery(undefined, sort);
      return safeQuery(() => request('GET', resourcePath, { query, ...(options || {}) }));
    },

    async filter(criteria, sort, options) {
      const query = buildQuery(criteria, sort);
      return safeQuery(() => request('GET', resourcePath, { query, ...(options || {}) }));
    },

    async create(payload, options) {
      return safeQuery(() => request('POST', resourcePath, { body: payload, ...(options || {}) }));
    },

    async update(id, payload, options) {
      if (!id) throw new Error(`update requires a valid id for ${resourceName}`);
      return safeQuery(() => request('PUT', `${resourcePath}/${id}`, { body: payload, ...(options || {}) }));
    },

    async delete(id, options) {
      if (!id) throw new Error(`delete requires a valid id for ${resourceName}`);
      return safeQuery(() => request('DELETE', `${resourcePath}/${id}`, { ...(options || {}) }));
    },
  };
}

export const apiClient = {
  request,
  createEntityApi,
};
