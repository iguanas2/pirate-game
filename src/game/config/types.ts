export const GAME_SESSION_LIMITS = {
  minSeconds: 60,
  maxSeconds: 180,
} as const;

export const ENEMY_SPAWN_LIMITS = {
  minMs: 1000,
  maxMs: 20000,
} as const;

export type MatchDifficulty = 'casual' | 'standard' | 'hard';

export interface GameConfigSnapshot {
  sessionSeconds: number;
  spawnIntervalMs: number;
  playerMaxHp: number;
  playerSpeed: number;
  playerAngularSpeed: number;
  projectileSpeed: number;
  projectileLifetimeMs: number;
  projectileDamage: number;
  chaserSpeed: number;
  chaserDamage: number;
  shooterSpeed: number;
  shooterRange: number;
  shooterDamage: number;
  shooterCooldownMs: number;
  projectileCooldownMs: number;
  lateralShotSpread: number;
  arenaWidth: number;
  arenaHeight: number;
  version: string;
  updatedAt: string;
}

export interface PlayerCombatConfig {
  maxHp: number;
  moveSpeed: number;
  angularSpeed: number;
  frontShotCooldownMs: number;
  sideShotCooldownMs: number;
  projectileDamage: number;
  projectileSpeed: number;
  projectileLifetimeMs: number;
  lateralSpreadDeg: number;
}

export interface EnemySpawnConfig {
  intervalMs: number;
  minDistanceToPlayer: number;
  chaserMaxCount: number;
  shooterMaxCount: number;
  safeSpawnPadding: number;
}

export interface ProjectileConfig {
  speed: number;
  damage: number;
  lifetimeMs: number;
  radius: number;
  color: string;
}

export interface EnemyCombatConfig {
  chaserSpeed: number;
  chaserDamage: number;
  shooterSpeed: number;
  shooterRange: number;
  shooterDamage: number;
  shooterCooldownMs: number;
}

export interface ArenaConfig {
  width: number;
  height: number;
  islandPadding: number;
  safeMargin: number;
}

export interface GameRulesConfig {
  sessionSeconds: number;
  enemySpawnIntervalMs: number;
  player: PlayerCombatConfig;
  enemies: EnemyCombatConfig;
  projectiles: ProjectileConfig;
  arena: ArenaConfig;
}

export interface SavedOptions {
  sessionSeconds: number;
  spawnIntervalMs: number;
  updatedAt: string;
}

export interface GameSettingsFormState {
  sessionSeconds: number;
  spawnIntervalMs: number;
}

export interface ConfigValidationResult {
  isValid: boolean;
  errors: Partial<Record<keyof GameSettingsFormState, string>>;
}

export const DEFAULT_GAME_SETTINGS: GameSettingsFormState = {
  sessionSeconds: 120,
  spawnIntervalMs: 4000,
};

export const DEFAULT_GAME_CONFIG_SNAPSHOT: GameConfigSnapshot = {
  sessionSeconds: DEFAULT_GAME_SETTINGS.sessionSeconds,
  spawnIntervalMs: DEFAULT_GAME_SETTINGS.spawnIntervalMs,
  playerMaxHp: 5,
  playerSpeed: 180,
  playerAngularSpeed: 2.6,
  projectileSpeed: 420,
  projectileLifetimeMs: 1500,
  projectileDamage: 1,
  chaserSpeed: 90,
  chaserDamage: 1,
  shooterSpeed: 70,
  shooterRange: 260,
  shooterDamage: 1,
  shooterCooldownMs: 1800,
  projectileCooldownMs: 220,
  lateralShotSpread: 18,
  arenaWidth: 2880,
  arenaHeight: 1620,
  version: '1.0.0',
  updatedAt: new Date(0).toISOString(),
};
