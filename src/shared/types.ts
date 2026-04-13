export interface SyncResponse {
  ok: boolean;
  bytes?: number;
  error?: string;
}

export interface HealthResponse {
  ok: boolean;
  hasConfig: boolean;
  configSize: number;
}
