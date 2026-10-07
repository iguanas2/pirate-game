export type MatchStatus = 'idle' | 'running' | 'paused' | 'finished';
export type MatchEndReason =
  | 'time_expired'
  | 'player_destroyed'
  | 'abandoned'
  | 'focus_lost'
  | 'manual_exit';

export type EnemyType = 'chaser' | 'shooter';
export type WeaponType = 'front' | 'left' | 'right';
export type DamageSource = 'projectile' | 'collision' | 'environment';

export interface Vec2 {
  x: number;
  y: number;
}

export interface ArenaBounds {
  width: number;
  height: number;
}

export interface ShipHealth {
  current: number;
  max: number;
}

export interface ShipState {
  id: string;
  kind: 'player' | 'enemy';
  type?: EnemyType;
  position: Vec2;
  velocity: Vec2;
  heading: number;
  radius: number;
  hp: ShipHealth;
  alive: boolean;
}

export interface ProjectileState {
  id: string;
  ownerId: string;
  source: 'player' | 'enemy';
  weapon: WeaponType;
  position: Vec2;
  velocity: Vec2;
  radius: number;
  damage: number;
  lifetimeMs: number;
  maxLifetimeMs: number;
  alive: boolean;
  hitOnce: boolean;
}

export interface ExplosionEffect {
  id: string;
  position: Vec2;
  radius: number;
  maxRadius: number;
  ttlMs: number;
  startedAt: number;
  color: string;
}

export interface EnemySpawnCandidate {
  position: Vec2;
  distanceToPlayer: number;
  valid: boolean;
}

export interface MatchSummary {
  matchId: string;
  status: MatchStatus;
  startedAt: number;
  elapsedMs: number;
  remainingMs: number;
  score: number;
  playerHp: number;
  playerMaxHp: number;
  paused: boolean;
  focusActive: boolean;
}

export interface MatchResult {
  matchId: string;
  playerId: string;
  score: number;
  durationMs: number;
  endedAt: string;
  endReason: MatchEndReason;
  outcome: 'victory' | 'defeat' | 'abandoned';
  configVersion: string;
}

export interface WeaponCooldowns {
  front: number;
  left: number;
  right: number;
}

export interface GameRuntimeState {
  status: MatchStatus;
  score: number;
  elapsedMs: number;
  remainingMs: number;
  playerHp: number;
  playerMaxHp: number;
  weaponCooldowns: WeaponCooldowns;
  pausedAt: number | null;
  lastFrameTime: number | null;
}

export interface CollisionEvent {
  id: string;
  sourceId: string;
  targetId: string;
  sourceType: 'player' | 'enemy' | 'projectile';
  targetType: 'player' | 'enemy' | 'island' | 'projectile';
  damage: number;
  causedBy: DamageSource;
  worldPosition: Vec2;
}

export interface MatchProgressSnapshot {
  status: MatchStatus;
  score: number;
  elapsedMs: number;
  remainingMs: number;
  playerHp: number;
  playerMaxHp: number;
  enemies: number;
  projectiles: number;
  paused: boolean;
}
