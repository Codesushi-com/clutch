/**
 * OpenClaw API Client
 * HTTP client for OpenClaw gateway REST API
 */

import { Session, SessionListResponse, SessionListParams } from '@/lib/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_OPENCLAW_API_URL || 'http://localhost:18790';

class OpenClawAPIClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
      },
      ...options,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  /**
   * List all sessions with optional filtering
   */
  async listSessions(params?: SessionListParams): Promise<SessionListResponse> {
    const searchParams = new URLSearchParams();
    
    if (params?.status) searchParams.set('status', params.status);
    if (params?.type) searchParams.set('type', params.type);
    if (params?.model) searchParams.set('model', params.model);
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.offset) searchParams.set('offset', params.offset.toString());

    const query = searchParams.toString();
    const endpoint = `/api/sessions${query ? `?${query}` : ''}`;
    
    return this.request<SessionListResponse>(endpoint);
  }

  /**
   * Get a single session by ID
   */
  async getSession(id: string): Promise<Session> {
    return this.request<Session>(`/api/sessions/${id}`);
  }

  /**
   * Cancel/kill a running session
   */
  async cancelSession(id: string): Promise<void> {
    await this.request(`/api/sessions/${id}/cancel`, {
      method: 'POST',
    });
  }

  /**
   * Get session history/transcript
   */
  async getSessionHistory(id: string): Promise<unknown[]> {
    return this.request<unknown[]>(`/api/sessions/${id}/history`);
  }
}

// Singleton instance
export const apiClient = new OpenClawAPIClient();

// Export class for custom instances
export { OpenClawAPIClient };
