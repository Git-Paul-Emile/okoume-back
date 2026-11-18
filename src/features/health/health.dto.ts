export interface DependencyCheckDto {
  status: 'up' | 'down';
  latencyMs: number;
}

export interface ReadinessDto {
  ready: boolean;
  checks: { database: DependencyCheckDto };
}

export interface LivenessDto {
  status: 'ok';
  uptimeSeconds: number;
}
