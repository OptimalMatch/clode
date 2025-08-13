import axios from 'axios';
import { Workflow, Prompt, ClaudeInstance, Subagent, InstanceLog, LogAnalytics, LogType } from '../types';

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