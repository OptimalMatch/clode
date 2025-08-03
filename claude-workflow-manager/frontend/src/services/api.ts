import axios from 'axios';
import { Workflow, Prompt, ClaudeInstance, Subagent, InstanceLog, LogAnalytics, LogType } from '../types';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

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
  spawn: async (workflowId: string, promptId?: string, gitRepo?: string) => {
    const response = await api.post('/api/instances/spawn', {
      workflow_id: workflowId,
      prompt_id: promptId,
      git_repo: gitRepo,
    });
    return response.data;
  },
  
  getByWorkflow: async (workflowId: string) => {
    const response = await api.get(`/api/instances/${workflowId}`);
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
  
  delete: async (instanceId: string) => {
    const response = await api.delete(`/api/instances/${instanceId}`);
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