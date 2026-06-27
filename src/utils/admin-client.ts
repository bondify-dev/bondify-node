// ============================================================
//  @bondify/node — BondifyAdminClient
//  Typed client for the Bondify Developer API
// ============================================================

import type {
  DeveloperInfo,
  ProjectInfo,
  SessionInfo,
} from '../types';

export interface AdminClientConfig {
  /** Developer JWT token (from /api/v1/dev/login) */
  token:   string;
  apiUrl?: string;
}

export class BondifyAdminClient {
  private readonly token:  string;
  private readonly apiUrl: string;

  constructor(config: AdminClientConfig) {
    this.token  = config.token;
    this.apiUrl = (config.apiUrl ?? 'https://api.bondify.dev').replace(/\/$/, '');
  }

  // ── Developer ────────────────────────────────────────────────────────────
  async getMe(): Promise<DeveloperInfo> {
    return this.get<{ developer: DeveloperInfo }>('/api/v1/dev/me').then(r => r.developer);
  }

  // ── Projects ─────────────────────────────────────────────────────────────
  async listProjects(): Promise<ProjectInfo[]> {
    return this.get<{ projects: ProjectInfo[] }>('/api/v1/dev/projects').then(r => r.projects);
  }

  async createProject(data: {
    name:         string;
    webhook_url?: string;
    bot_token?:   string;
    public_access?: boolean;
    req_phone?:   boolean;
  }): Promise<{ project_id: string; secret_key: string; name: string }> {
    return this.post('/api/v1/dev/projects', data);
  }

  async updateProject(
    projectId: string,
    data: Partial<Pick<ProjectInfo, 'name' | 'active' | 'webhook_url'> & {
      req_phone: boolean;
      public_access: boolean;
      bot_token: string | null;
    }>
  ): Promise<{ ok: boolean }> {
    return this.patch(`/api/v1/dev/projects/${projectId}`, data);
  }

  async deleteProject(projectId: string): Promise<{ ok: boolean }> {
    return this.delete(`/api/v1/dev/projects/${projectId}`);
  }

  async regenerateSecret(projectId: string): Promise<{ secret_key: string }> {
    return this.post(`/api/v1/dev/projects/${projectId}/regenerate`, {});
  }

  // ── Sessions ─────────────────────────────────────────────────────────────
  async listSessions(): Promise<SessionInfo[]> {
    return this.get<{ sessions: SessionInfo[] }>('/api/v1/dev/sessions').then(r => r.sessions);
  }

  // ── Analytics ────────────────────────────────────────────────────────────
  async getAnalytics(options?: { days?: number; project_id?: string }) {
    const params = new URLSearchParams();
    if (options?.days)       params.set('days',       String(options.days));
    if (options?.project_id) params.set('project_id', options.project_id);
    return this.get(`/api/v1/dev/analytics?${params.toString()}`);
  }

  // ── HTTP helpers ──────────────────────────────────────────────────────────
  private async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  private async patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  private async delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.apiUrl}${path}`, {
      method,
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${this.token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await res.json() as Record<string, unknown>;

    if (!res.ok) {
      throw new Error(
        `[Bondify Admin] ${method} ${path} → ${res.status}: ${data?.error ?? JSON.stringify(data)}`
      );
    }

    return data as T;
  }
}
