import axios from 'axios';
import { Workflow, Prompt, ClaudeInstance, Subagent, InstanceLog, LogAnalytics, LogType } from '../types';

export interface OrchestrationDesignVersion {
  version: number;
  name: string;
  description: string;
  blocks: any[];
  connections: any[];
  git_repos: string[];
  saved_at: string;
  saved_by?: string;
}

export interface OrchestrationDesign {
  id?: string;
  name: string;
  description: string;
  blocks: any[];
  connections: any[];
  git_repos: string[];
  created_at?: string;
  updated_at?: string;
  version?: number;
  version_history?: OrchestrationDesignVersion[];
}

// Dynamically determine API URL based on current window location
const getApiUrl = () => {
  const currentHostname = window.location.hostname;
  const protocol = window.location.protocol;
  const apiPort = process.env.REACT_APP_API_PORT || '8005';
  
  // If REACT_APP_API_URL is set, check if it matches current hostname
  if (process.env.REACT_APP_API_URL) {
    try {
      const envUrl = new URL(process.env.REACT_APP_API_URL);
      // If the hostname in the env URL matches current hostname, use env URL
      if (envUrl.hostname === currentHostname) {
        return process.env.REACT_APP_API_URL;
      }
      // Otherwise, use current hostname with the port from env URL or default
      const envPort = envUrl.port || apiPort;
      return `${protocol}//${currentHostname}:${envPort}`;
    } catch (e) {
      // If env URL is malformed, fall back to dynamic construction
      console.warn('Invalid REACT_APP_API_URL, using dynamic construction:', e instanceof Error ? e.message : String(e));
    }
  }
  
  // Construct URL from current window location
  return `${protocol}//${currentHostname}:${apiPort}`;
};

const API_URL = getApiUrl();

// Debug logging to help with API URL issues
console.log('🔍 API Configuration:');
console.log('  REACT_APP_API_URL:', process.env.REACT_APP_API_URL);
console.log('  REACT_APP_API_PORT:', process.env.REACT_APP_API_PORT);
console.log('  window.location.hostname:', window.location.hostname);
if (process.env.REACT_APP_API_URL) {
  try {
    const envUrl = new URL(process.env.REACT_APP_API_URL);
    console.log('  Env URL hostname:', envUrl.hostname);
    console.log('  Hostname match:', envUrl.hostname === window.location.hostname);
  } catch (e) {
    console.log('  Env URL parse error:', e instanceof Error ? e.message : String(e));
  }
}
console.log('  Final API_URL:', API_URL);

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to all requests if available
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 errors globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid, clear auth data
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
      // Optionally redirect to login
      if (window.location.pathname !== '/login' && window.location.pathname !== '/register') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export const workflowApi = {
  create: async (workflow: Workflow) => {
    const response = await api.post('/api/workflows', workflow);
    return response.data;
  },
  
  getAll: async () => {
    const response = await api.get('/api/workflows');
    return response.data.workflows;
  },
  
  getById: async (id: string) => {
    const response = await api.get(`/api/workflows/${id}`);
    return response.data;
  },
  
  delete: async (id: string) => {
    const response = await api.delete(`/api/workflows/${id}`);
    return response.data;
  },
};

export const promptApi = {
  create: async (prompt: Prompt) => {
    const response = await api.post('/api/prompts', prompt);
    return response.data;
  },
  
  getAll: async () => {
    const response = await api.get('/api/prompts');
    return response.data.prompts;
  },
  
  update: async (id: string, prompt: Prompt) => {
    const response = await api.put(`/api/prompts/${id}`, prompt);
    return response.data;
  },
};

export const instanceApi = {
  spawn: async (
    workflowId: string, 
    promptId?: string, 
    gitRepo?: string, 
    startSequence?: number, 
    endSequence?: number
  ) => {
    const response = await api.post('/api/instances/spawn', {
      workflow_id: workflowId,
      prompt_id: promptId,
      git_repo: gitRepo,
      start_sequence: startSequence,
      end_sequence: endSequence,
    });
    return response.data;
  },
  
  getByWorkflow: async (workflowId: string, includeArchived: boolean = false) => {
    const response = await api.get(`/api/instances/${workflowId}`, {
      params: { include_archived: includeArchived }
    });
    return response.data.instances;
  },
  
  interrupt: async (instanceId: string, feedback: string) => {
    const response = await api.post(`/api/instances/${instanceId}/interrupt`, {
      feedback,
    });
    return response.data;
  },
  
  execute: async (instanceId: string, prompt: string) => {
    const response = await api.post(`/api/instances/${instanceId}/execute`, {
      prompt,
    });
    return response.data;
  },
  
  archive: async (instanceId: string) => {
    const response = await api.post(`/api/instances/${instanceId}/archive`);
    return response.data;
  },

  unarchive: async (instanceId: string) => {
    const response = await api.post(`/api/instances/${instanceId}/unarchive`);
    return response.data;
  },

  delete: async (instanceId: string) => {
    const response = await api.delete(`/api/instances/${instanceId}`);
    return response.data;
  },
  
  getTerminalHistory: async (instanceId: string) => {
    const response = await api.get(`/api/instances/${instanceId}/terminal-history`);
    return response.data;
  },
  
  clearTerminalHistory: async (instanceId: string) => {
    const response = await api.delete(`/api/instances/${instanceId}/terminal-history`);
    return response.data;
  },

  getLastTodos: async (instanceId: string) => {
    const response = await api.get(`/api/instances/${instanceId}/last-todos`);
    return response.data;
  },
};

export const subagentApi = {
  create: async (subagent: Subagent) => {
    const response = await api.post('/api/subagents', subagent);
    return response.data;
  },
  
  getAll: async () => {
    const response = await api.get('/api/subagents');
    return response.data.subagents;
  },
  
  getById: async (id: string) => {
    const response = await api.get(`/api/subagents/${id}`);
    return response.data;
  },
  
  update: async (id: string, subagent: Subagent) => {
    const response = await api.put(`/api/subagents/${id}`, subagent);
    return response.data;
  },
  
  delete: async (id: string) => {
    const response = await api.delete(`/api/subagents/${id}`);
    return response.data;
  },
  
  detectInPrompt: async (content: string, steps: any[]) => {
    const response = await api.post('/api/prompts/detect-subagents', {
      content,
      steps,
    });
    return response.data.detected_subagents;
  },
};

export const logsApi = {
  getInstanceLogs: async (instanceId: string, logType?: LogType, limit = 100, offset = 0) => {
    const params: any = { limit, offset };
    if (logType) params.log_type = logType;
    const response = await api.get(`/api/logs/instance/${instanceId}`, { params });
    return response.data.logs;
  },
  
  getWorkflowLogs: async (workflowId: string, limit = 100) => {
    const response = await api.get(`/api/logs/workflow/${workflowId}`, {
      params: { limit },
    });
    return response.data.logs;
  },
  
  searchLogs: async (query: string, workflowId?: string, instanceId?: string) => {
    const params: any = { q: query };
    if (workflowId) params.workflow_id = workflowId;
    if (instanceId) params.instance_id = instanceId;
    const response = await api.get('/api/logs/search', { params });
    return response.data.logs;
  },
  
  getInstanceAnalytics: async (instanceId: string): Promise<LogAnalytics> => {
    const response = await api.get(`/api/analytics/instance/${instanceId}`);
    return response.data;
  },
  
  exportLogs: async (instanceId: string, format: 'json' | 'csv' = 'json') => {
    const response = await api.get(`/api/logs/export/${instanceId}`, {
      params: { format },
      responseType: format === 'csv' ? 'blob' : 'json',
    });
    
    if (format === 'csv') {
      // Download CSV file
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `logs_${instanceId}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    }
    
    return response.data;
  },
};

export const promptFileApi = {
  syncPromptToRepo: async (promptId: string, workflowId: string, sequence: number, parallel: string) => {
    const response = await api.post(`/api/prompts/${promptId}/sync-to-repo`, {
      workflow_id: workflowId,
      sequence,
      parallel,
    });
    return response.data;
  },
  
  syncAllPromptsToRepo: async (workflowId: string, autoSequence: boolean = true) => {
    const response = await api.post(`/api/workflows/${workflowId}/sync-prompts`, {
      auto_sequence: autoSequence,
    });
    return response.data;
  },
  
  getRepoPrompts: async (workflowId: string) => {
    const response = await api.get(`/api/workflows/${workflowId}/repo-prompts`);
    return response.data;
  },
  
  importRepoPrompts: async (workflowId: string) => {
    const response = await api.post(`/api/workflows/${workflowId}/import-repo-prompts`);
    return response.data;
  },

  getReviewFiles: async (workflowId: string, promptName: string) => {
    const response = await api.get(`/api/workflows/${workflowId}/review-files/${encodeURIComponent(promptName)}`);
    return response.data;
  },
};

export const agentDiscoveryApi = {
  discoverAndSyncAgents: async (workflowId: string) => {
    const response = await api.post(`/api/workflows/${workflowId}/discover-agents`);
    return response.data;
  },
  
  previewRepoAgents: async (workflowId: string) => {
    const response = await api.get(`/api/workflows/${workflowId}/repo-agents`);
    return response.data;
  },
  
  getFormatExamples: async () => {
    const response = await api.get('/api/agent-format-examples');
    return response.data;
  },
  
  autoDiscoverAgents: async (workflowId: string) => {
    const response = await api.post(`/api/workflows/${workflowId}/auto-discover-agents`);
    return response.data;
  },
};

export const gitApi = {
  validateRepository: async (gitRepo: string) => {
    const response = await api.post('/api/git/validate', {
      git_repo: gitRepo
    });
    return response.data;
  },
  
  getBranches: async (gitRepo: string) => {
    const response = await api.post('/api/git/branches', {
      git_repo: gitRepo
    });
    return response.data;
  },
};

export const sshApi = {
  generateKey: async (keyName: string, keyType: string = 'ed25519', email?: string) => {
    const response = await api.post('/api/ssh/generate-key', {
      key_name: keyName,
      key_type: keyType,
      email: email
    });
    return response.data;
  },
  
  listKeys: async () => {
    const response = await api.get('/api/ssh/keys');
    return response.data;
  },
  
  testConnection: async (gitRepo: string, keyName?: string) => {
    const response = await api.post('/api/ssh/test-connection', {
      git_repo: gitRepo,
      use_ssh_agent: true,
      key_name: keyName
    });
    return response.data;
  },
  
  deleteKey: async (keyName: string) => {
    const response = await api.delete(`/api/ssh/keys/${keyName}`);
    return response.data;
  },
};

export interface User {
  id: string;
  username: string;
  email: string;
  full_name?: string;
  is_active: boolean;
  is_admin: boolean;
  created_at: string;
  last_login?: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export const authApi = {
  register: async (username: string, email: string, password: string, fullName?: string): Promise<AuthResponse> => {
    const response = await api.post('/api/auth/register', {
      username,
      email,
      password,
      full_name: fullName,
    });
    return response.data;
  },

  login: async (usernameOrEmail: string, password: string): Promise<AuthResponse> => {
    const response = await api.post('/api/auth/login', {
      username_or_email: usernameOrEmail,
      password,
    });
    return response.data;
  },

  getCurrentUser: async (): Promise<User> => {
    const response = await api.get('/api/auth/me');
    return response.data;
  },

  logout: async () => {
    const response = await api.post('/api/auth/logout');
    return response.data;
  },
};

// Agent Orchestration API
export interface OrchestrationAgent {
  name: string;
  system_prompt: string;
  role: 'manager' | 'worker' | 'specialist' | 'moderator' | 'reflector';
}

export interface SequentialPipelineRequest {
  task: string;
  agents: OrchestrationAgent[];
  agent_sequence: string[];
  model?: string;
  git_repo?: string | null;
  isolate_agent_workspaces?: boolean;
}

export interface DebateRequest {
  topic: string;
  agents: OrchestrationAgent[];
  participant_names: string[];
  rounds: number;
  model?: string;
  git_repo?: string | null;
  isolate_agent_workspaces?: boolean;
}

export interface HierarchicalRequest {
  task: string;
  manager: OrchestrationAgent;
  workers: OrchestrationAgent[];
  worker_names: string[];
  model?: string;
  git_repo?: string | null;
  isolate_agent_workspaces?: boolean;
}

export interface ParallelAggregateRequest {
  task: string;
  agents: OrchestrationAgent[];
  agent_names: string[];
  aggregator?: OrchestrationAgent | null;
  aggregator_name?: string | null;
  model?: string;
  git_repo?: string | null;
  isolate_agent_workspaces?: boolean;
}

export interface DynamicRoutingRequest {
  task: string;
  router: OrchestrationAgent;
  specialists: OrchestrationAgent[];
  specialist_names: string[];
  model?: string;
  git_repo?: string | null;
  isolate_agent_workspaces?: boolean;
}

export interface OrchestrationResult {
  pattern: string;
  execution_id: string;
  status: string;
  result: any;
  duration_ms: number;
  created_at: string;
}

export interface StreamEvent {
  type: 'start' | 'status' | 'chunk' | 'complete' | 'error';
  agent?: string;
  data?: string;
  result?: any;
  error?: string;
  timestamp?: string;
  duration_ms?: number;
}

export const orchestrationApi = {
  executeSequential: async (request: SequentialPipelineRequest): Promise<OrchestrationResult> => {
    const response = await api.post('/api/orchestration/sequential', request);
    return response.data;
  },

  executeDebate: async (request: DebateRequest): Promise<OrchestrationResult> => {
    const response = await api.post('/api/orchestration/debate', request);
    return response.data;
  },

  executeDebateStream: async (
    request: DebateRequest,
    onEvent: (event: StreamEvent) => void,
    signal?: AbortSignal
  ): Promise<OrchestrationResult> => {
    return new Promise(async (resolve, reject) => {
      try {
        const response = await fetch(`${API_URL}/api/orchestration/debate/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(request),
          signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          throw new Error('Response body is null');
        }

        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          
          // Keep the last incomplete line in the buffer
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const jsonStr = line.substring(6); // Remove 'data: ' prefix
                const event: StreamEvent = JSON.parse(jsonStr);
                onEvent(event);

                if (event.type === 'complete' && event.result) {
                  resolve({
                    pattern: 'debate',
                    execution_id: 'stream-exec',
                    status: 'completed',
                    result: event.result,
                    duration_ms: event.duration_ms || 0,
                    created_at: new Date().toISOString()
                  });
                  return;
                } else if (event.type === 'error') {
                  reject(new Error(event.error || 'Unknown error'));
                  return;
                }
              } catch (e) {
                console.warn('Failed to parse SSE event:', line.substring(0, 100) + '...', e);
              }
            }
          }
        }
      } catch (error) {
        reject(error);
      }
    });
  },

  executeHierarchicalStream: async (
    request: HierarchicalRequest,
    onEvent: (event: StreamEvent) => void,
    signal?: AbortSignal
  ): Promise<OrchestrationResult> => {
    return new Promise(async (resolve, reject) => {
      try {
        const response = await fetch(`${API_URL}/api/orchestration/hierarchical/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(request),
          signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          throw new Error('Response body is null');
        }

        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          
          // Keep the last incomplete line in the buffer
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const jsonStr = line.substring(6); // Remove 'data: ' prefix
                const event: StreamEvent = JSON.parse(jsonStr);
                onEvent(event);

                if (event.type === 'complete' && event.result) {
                  resolve({
                    pattern: 'hierarchical',
                    execution_id: 'stream-exec',
                    status: 'completed',
                    result: event.result,
                    duration_ms: event.duration_ms || 0,
                    created_at: new Date().toISOString()
                  });
                  return;
                } else if (event.type === 'error') {
                  reject(new Error(event.error || 'Unknown error'));
                  return;
                }
              } catch (e) {
                console.warn('Failed to parse SSE event:', line.substring(0, 100) + '...', e);
              }
            }
          }
        }
      } catch (error) {
        reject(error);
      }
    });
  },

  executeHierarchical: async (request: HierarchicalRequest): Promise<OrchestrationResult> => {
    const response = await api.post('/api/orchestration/hierarchical', request);
    return response.data;
  },

  executeParallel: async (request: ParallelAggregateRequest): Promise<OrchestrationResult> => {
    const response = await api.post('/api/orchestration/parallel', request);
    return response.data;
  },

  executeParallelStream: async (
    request: ParallelAggregateRequest,
    onEvent: (event: StreamEvent) => void,
    signal?: AbortSignal
  ): Promise<OrchestrationResult> => {
    return new Promise(async (resolve, reject) => {
      try {
        const response = await fetch(`${API_URL}/api/orchestration/parallel/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(request),
          signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          throw new Error('Response body is null');
        }

        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          
          // Keep the last incomplete line in the buffer
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const jsonStr = line.substring(6); // Remove 'data: ' prefix
                const event: StreamEvent = JSON.parse(jsonStr);
                onEvent(event);

                if (event.type === 'complete' && event.result) {
                  resolve({
                    pattern: 'parallel',
                    execution_id: 'stream-exec',
                    status: 'completed',
                    result: event.result,
                    duration_ms: event.duration_ms || 0,
                    created_at: new Date().toISOString()
                  });
                  return;
                } else if (event.type === 'error') {
                  reject(new Error(event.error || 'Unknown error'));
                  return;
                }
              } catch (e) {
                console.warn('Failed to parse SSE event:', line.substring(0, 100) + '...', e);
              }
            }
          }
        }
      } catch (error) {
        reject(error);
      }
    });
  },

  executeRouting: async (request: DynamicRoutingRequest): Promise<OrchestrationResult> => {
    const response = await api.post('/api/orchestration/routing', request);
    return response.data;
  },

  executeRoutingStream: async (
    request: DynamicRoutingRequest,
    onEvent: (event: StreamEvent) => void,
    signal?: AbortSignal
  ): Promise<OrchestrationResult> => {
    return new Promise(async (resolve, reject) => {
      try {
        const response = await fetch(`${API_URL}/api/orchestration/routing/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(request),
          signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          throw new Error('Response body is null');
        }

        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const jsonStr = line.substring(6);
                const event: StreamEvent = JSON.parse(jsonStr);
                onEvent(event);

                if (event.type === 'complete' && event.result) {
                  resolve({
                    pattern: 'routing',
                    execution_id: 'stream-exec',
                    status: 'completed',
                    result: event.result,
                    duration_ms: event.duration_ms || 0,
                    created_at: new Date().toISOString()
                  });
                  return;
                } else if (event.type === 'error') {
                  reject(new Error(event.error || 'Unknown error'));
                  return;
                }
              } catch (e) {
                console.warn('Failed to parse SSE event:', line.substring(0, 100) + '...', e);
              }
            }
          }
        }
      } catch (error) {
        reject(error);
      }
    });
  },

  // Streaming version for sequential
  executeSequentialStream: (
    request: SequentialPipelineRequest, 
    onEvent: (event: StreamEvent) => void,
    signal?: AbortSignal
  ): Promise<OrchestrationResult> => {
    return new Promise((resolve, reject) => {
      const token = localStorage.getItem('access_token');
      
      fetch(`${API_URL}/api/orchestration/sequential/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify(request),
        signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const reader = response.body?.getReader();
          const decoder = new TextDecoder();
          
          if (!reader) {
            reject(new Error('No response body'));
            return;
          }

          let buffer = '';
          
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                try {
                  const event: StreamEvent = JSON.parse(data);
                  onEvent(event);
                  
                  if (event.type === 'complete' && event.result) {
                    resolve({
                      pattern: 'sequential',
                      execution_id: '',
                      status: 'completed',
                      result: event.result,
                      duration_ms: 0,
                      created_at: new Date().toISOString(),
                    });
                  } else if (event.type === 'error') {
                    reject(new Error(event.error || 'Execution failed'));
                  }
                } catch (e) {
                  console.error('Failed to parse SSE event:', e);
                }
              }
            }
          }
        })
        .catch((error) => {
          if (error.name !== 'AbortError') {
            reject(error);
          }
        });
    });
  },
};

// Orchestration Design API
export const orchestrationDesignApi = {
  create: async (design: OrchestrationDesign) => {
    const response = await api.post('/api/orchestration-designs', design);
    return response.data;
  },

  getAll: async (): Promise<OrchestrationDesign[]> => {
    const response = await api.get('/api/orchestration-designs');
    return response.data;
  },

  getById: async (id: string): Promise<OrchestrationDesign> => {
    const response = await api.get(`/api/orchestration-designs/${id}`);
    return response.data;
  },

  update: async (id: string, design: OrchestrationDesign) => {
    const response = await api.put(`/api/orchestration-designs/${id}`, design);
    return response.data;
  },

  delete: async (id: string) => {
    const response = await api.delete(`/api/orchestration-designs/${id}`);
    return response.data;
  },

  restore: async (id: string, version: number) => {
    const response = await api.post(`/api/orchestration-designs/${id}/restore/${version}`);
    return response.data;
  },

  seed: async (force: boolean = false) => {
    const response = await api.post(`/api/orchestration-designs/seed?force=${force}`);
    return response.data;
  },

  generateWithAI: async (
    prompt: string,
    currentDesign?: OrchestrationDesign,
    mode: 'create' | 'improve' = 'create',
    onChunk?: (chunk: string) => void,
    onStatus?: (agent: string, status: string) => void,
    abortSignal?: AbortSignal
  ): Promise<OrchestrationDesign> => {
    return new Promise((resolve, reject) => {
      fetch(`${getApiUrl()}/api/orchestration-designs/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          current_design: currentDesign,
          mode,
        }),
        signal: abortSignal,
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const reader = response.body?.getReader();
          if (!reader) {
            throw new Error('No response body');
          }

          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const event = JSON.parse(line.slice(6));
                  console.log('AI Generation Event:', event); // Debug logging
                  
                  if (event.type === 'chunk' && onChunk) {
                    console.log('Chunk received:', event.data); // Debug logging
                    onChunk(event.data);
                  } else if (event.type === 'status' && onStatus) {
                    console.log('Status received:', event.agent, event.data); // Debug logging
                    onStatus(event.agent, event.data);
                  } else if (event.type === 'complete') {
                    console.log('Generation complete'); // Debug logging
                    resolve(event.design);
                  } else if (event.type === 'error') {
                    console.error('Generation error:', event.error); // Debug logging
                    reject(new Error(event.error || 'Generation failed'));
                  }
                } catch (e) {
                  console.error('Failed to parse SSE event:', e);
                }
              }
            }
          }
        })
        .catch((error) => {
          if (error.name !== 'AbortError') {
            reject(error);
          }
        });
    });
  },
};

// Deployment API
export interface Deployment {
  id?: string;
  design_id: string;
  design_name: string;
  endpoint_path: string;
  status: 'active' | 'inactive' | 'error';
  schedule?: {
    enabled: boolean;
    cron_expression?: string;
    interval_seconds?: number;
    timezone: string;
  };
  created_at?: string;
  updated_at?: string;
  last_execution_at?: string;
  execution_count?: number;
}

export interface ExecutionLog {
  id?: string;
  deployment_id: string;
  design_id: string;
  execution_id: string;
  status: 'running' | 'completed' | 'failed';
  trigger_type: 'manual' | 'scheduled' | 'api';
  triggered_by?: string;
  input_data?: any;
  result_data?: any;
  error?: string;
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
}

export const deploymentApi = {
  deploy: (designId: string, endpointPath: string, schedule?: any) =>
    api.post('/api/deployments', {
      design_id: designId,
      endpoint_path: endpointPath,
      schedule,
    }),

  getDeployments: () => api.get('/api/deployments'),

  getDeployment: (id: string) => api.get(`/api/deployments/${id}`),

  updateDeployment: (id: string, updates: { status?: string; schedule?: any }) =>
    api.put(`/api/deployments/${id}`, updates),

  deleteDeployment: (id: string) => api.delete(`/api/deployments/${id}`),

  executeDeployment: (id: string, inputData?: any) =>
    api.post(`/api/deployments/${id}/execute`, { input_data: inputData }),

  getExecutionLogs: (deploymentId: string, limit = 100) =>
    api.get(`/api/deployments/${deploymentId}/logs`, { params: { limit } }),

  getExecutionLog: (deploymentId: string, logId: string) =>
    api.get(`/api/deployments/${deploymentId}/logs/${logId}`),
};

// File Editor API
export const fileEditorApi = {
  initEditor: (workflowId: string) =>
    api.post('/api/file-editor/init', { workflow_id: workflowId }),

  browseDirectory: (workflowId: string, path: string = '', includeHidden: boolean = false) =>
    api.post('/api/file-editor/browse', {
      workflow_id: workflowId,
      path,
      include_hidden: includeHidden,
    }),

  getTree: (workflowId: string, path: string = '', maxDepth: number = 3) =>
    api.post('/api/file-editor/tree', {
      workflow_id: workflowId,
      path,
      max_depth: maxDepth,
    }),

  readFile: (workflowId: string, filePath: string) =>
    api.post('/api/file-editor/read', {
      workflow_id: workflowId,
      file_path: filePath,
    }),

  createChange: (workflowId: string, filePath: string, operation: 'create' | 'update' | 'delete', newContent?: string) =>
    api.post('/api/file-editor/create-change', {
      workflow_id: workflowId,
      file_path: filePath,
      operation,
      new_content: newContent,
    }),

  getChanges: (workflowId: string, status?: string) =>
    api.post('/api/file-editor/changes', {
      workflow_id: workflowId,
      status,
    }),

  approveChange: (workflowId: string, changeId: string) =>
    api.post('/api/file-editor/approve', {
      workflow_id: workflowId,
      change_id: changeId,
    }),

  rejectChange: (workflowId: string, changeId: string) =>
    api.post('/api/file-editor/reject', {
      workflow_id: workflowId,
      change_id: changeId,
    }),

  rollbackChange: (workflowId: string, changeId: string) =>
    api.post('/api/file-editor/rollback', {
      workflow_id: workflowId,
      change_id: changeId,
    }),

  createDirectory: (workflowId: string, dirPath: string) =>
    api.post('/api/file-editor/create-directory', {
      workflow_id: workflowId,
      dir_path: dirPath,
    }),

  moveFile: (workflowId: string, oldPath: string, newPath: string) =>
    api.post('/api/file-editor/move', {
      workflow_id: workflowId,
      old_path: oldPath,
      new_path: newPath,
    }),

  searchFiles: (workflowId: string, query: string, path: string = '', caseSensitive: boolean = false) =>
    api.post('/api/file-editor/search', {
      workflow_id: workflowId,
      query,
      path,
      case_sensitive: caseSensitive,
    }),
};

// Export the base axios instance as default for direct API calls
export default api;