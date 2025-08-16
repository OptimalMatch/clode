export interface Workflow {
  id?: string;
  name: string;
  git_repo: string;
  branch: string;
  prompts: string[];
  created_at?: string;
  updated_at?: string;
  // Aggregated metrics across all instances
  total_tokens?: number;
  total_cost_usd?: number;
  total_execution_time_ms?: number;
  log_count?: number;
  instance_count?: number;
  token_breakdown?: TokenUsage;
}

export type SubagentCapability = 
  | 'code_review'
  | 'testing'
  | 'documentation'
  | 'refactoring'
  | 'security_audit'
  | 'performance_optimization'
  | 'data_analysis'
  | 'api_design'
  | 'custom';

export interface Subagent {
  id?: string;
  name: string;
  description: string;
  system_prompt: string;
  capabilities: SubagentCapability[];
  trigger_keywords: string[];
  parameters: Record<string, any>;
  max_tokens?: number;
  temperature?: number;
  created_at?: string;
  updated_at?: string;
}

export interface PromptStep {
  id: string;
  content: string;
  execution_mode: 'sequential' | 'parallel';
  dependencies: string[];
  subagent_refs: string[];
  metadata: Record<string, any>;
}

export interface Prompt {
  id?: string;
  name: string;
  description: string;
  steps: PromptStep[];
  tags: string[];
  detected_subagents: string[];
  created_at?: string;
  updated_at?: string;
}

export interface ClaudeInstance {
  id: string;
  workflow_id: string;
  prompt_id?: string;
  git_repo: string;
  status: 'initializing' | 'ready' | 'running' | 'paused' | 'completed' | 'failed';
  container_id?: string;
  output: any[];
  created_at: string;
  completed_at?: string;
  error?: string;
  archived?: boolean;
  archived_at?: string;
  claude_mode?: string;  // "max-plan" or "api-key"
  // Aggregated metrics
  total_tokens?: number;
  total_cost_usd?: number;
  total_execution_time_ms?: number;
  log_count?: number;
  token_breakdown?: TokenUsage;
}

export interface WebSocketMessage {
  type: string;
  content?: string;
  status?: string;
  message?: string;
  error?: string;
  step?: any;
  instance?: ClaudeInstance;
  execution_time_ms?: number;
  tokens_used?: number;
  process_running?: boolean;
}

export interface TerminalHistoryEntry {
  timestamp: string;
  type: 'input' | 'output' | 'error' | 'system';
  content: string;
}

export type LogType = 
  | 'input'
  | 'output'
  | 'error'
  | 'status'
  | 'system'
  | 'subagent'
  | 'tool_use'
  | 'completion';

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  total_tokens: number;
}

export interface InstanceLog {
  id?: string;
  instance_id: string;
  workflow_id: string;
  prompt_id?: string;
  timestamp: string;
  type: LogType;
  content: string;
  metadata: Record<string, any>;
  tokens_used?: number;  // Keep for backward compatibility
  token_usage?: TokenUsage;  // Detailed breakdown
  total_cost_usd?: number;
  execution_time_ms?: number;
  subagent_name?: string;
  step_id?: string;
  claude_mode?: string;  // "max-plan" or "api-key"
}

export interface LogAnalytics {
  instance_id: string;
  total_interactions: number;
  total_tokens: number;
  token_breakdown?: TokenUsage;  // Detailed token breakdown
  total_cost_usd?: number;       // Total cost in USD
  total_execution_time_ms: number;
  error_count: number;
  subagents_used: string[];
  interaction_timeline: Array<{
    timestamp: string;
    type: string;
    tokens: number;
    execution_time: number;
  }>;
  average_response_time_ms: number;
  success_rate: number;
}

export interface GitValidationResponse {
  accessible: boolean;
  message: string;
  default_branch?: string;
}

export interface GitBranchesResponse {
  branches: string[];
  default_branch?: string;
}

export interface SSHKeyResponse {
  public_key: string;
  private_key: string;
  fingerprint: string;
  key_name: string;
  instructions: string[];
}

export interface SSHKeyInfo {
  fingerprint: string;
  key_name: string;
  public_key: string;
  created_at: string;
  last_used?: string;
  source?: string; // 'generated' or 'mounted'
}

export interface SSHKeyListResponse {
  keys: SSHKeyInfo[];
}

export interface SSHConnectionTestResponse {
  success: boolean;
  message: string;
  repository: string;
  key_name?: string;
  timestamp: string;
}