import { DEFAULT_GAME_CONFIG_SNAPSHOT, type GameConfigSnapshot } from '../config';
import type { MatchEndReason, MatchStatus, Vec2, WeaponType } from './types';

export interface InputState {
  turn: number;
  thrust: number;
  fireFront: boolean;
  fireLeft: boolean;
  fireRight: boolean;
  paused: boolean;
}

export interface Island {
  id: string;
  x: number;
  y: number;
  radius: number;
  size: 3 | 4;
}

export interface EnemyUnit {
  id: string;
  type: 'chaser' | 'shooter';
  position: Vec2;
  velocity: Vec2;
  heading: number;
  radius: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  cooldownMs: number;
}

export interface ProjectileUnit {
  id: string;
  owner: 'player' | 'enemy';
  weapon: WeaponType;
  position: Vec2;
  velocity: Vec2;
  radius: number;
  damage: number;
  lifetimeMs: number;
  maxLifetimeMs: number;
  alive: boolean;
}

export interface PlayerUnit {
  radius: number;
  position: Vec2;
  velocity: Vec2;
  heading: number;
  hp: number;
  maxHp: number;
}

export interface GameState {
  seed: number;
  status: MatchStatus;
  score: number;
  elapsedMs: number;
  remainingMs: number;
  player: PlayerUnit;
  enemies: EnemyUnit[];
  projectiles: ProjectileUnit[];
  islands: Island[];
  weaponCooldowns: Record<WeaponType, number>;
  fireCooldownMs: number;
  spawnTimerMs: number;
  lastEvent: MatchEndReason | null;
  rng: () => number;
  config: GameConfigSnapshot;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

const normalizeAngle = (angle: number) => {
  const tau = Math.PI * 2;
  let result = angle;
  while (result > Math.PI) result -= tau;
  while (result < -Math.PI) result += tau;
  return result;
};

const makeRng = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const createIslands = (): Island[] => [
  { id: 'island-1', x: 620, y: 430, radius: 54, size: 3 },
  { id: 'island-2', x: 1080, y: 760, radius: 62, size: 4 },
  { id: 'island-3', x: 1560, y: 500, radius: 56, size: 3 },
  { id: 'island-4', x: 1920, y: 980, radius: 66, size: 4 },
  { id: 'island-5', x: 2420, y: 620, radius: 58, size: 3 },
  { id: 'island-6', x: 1220, y: 1220, radius: 68, size: 4 },
  { id: 'island-7', x: 2140, y: 1360, radius: 54, size: 3 },
  { id: 'island-8', x: 2720, y: 1100, radius: 70, size: 4 },
  { id: 'island-9', x: 940, y: 1460, radius: 58, size: 3 },
  { id: 'island-10', x: 1820, y: 300, radius: 62, size: 4 },
  { id: 'island-11', x: 2400, y: 1460, radius: 60, size: 3 },
  { id: 'island-12', x: 410, y: 1080, radius: 52, size: 3 },
];

const circleCollidesWithIsland = (center: Vec2, radius: number, island: Island) =>
  distance(center, { x: island.x, y: island.y }) <= island.radius + radius;

const resolveIslandCollision = (
  position: Vec2,
  velocity: Vec2,
  radius: number,
  islands: Island[],
) => {
  for (const island of islands) {
    const dx = position.x - island.x;
    const dy = position.y - island.y;
    const dist = Math.hypot(dx, dy) || 0.0001;
    const minDist = island.radius + radius;

    if (dist < minDist) {
      const nx = dx / dist;
      const ny = dy / dist;
      const overlap = minDist - dist;
      position.x += nx * overlap;
      position.y += ny * overlap;

      const dot = velocity.x * nx + velocity.y * ny;
      if (dot < 0) {
        velocity.x -= 2 * dot * nx;
        velocity.y -= 2 * dot * ny;
      }
    }
  }
};

const clampToArena = (position: Vec2, radius: number, config: GameConfigSnapshot) => {
  position.x = clamp(position.x, radius, config.arenaWidth - radius);
  position.y = clamp(position.y, radius, config.arenaHeight - radius);
};

const spawnProjectile = (
  state: GameState,
  owner: 'player' | 'enemy',
  weapon: WeaponType,
  position: Vec2,
  heading: number,
  speed: number,
  damage: number,
  lifetimeMs: number,
) => {
  const velocity = {
    x: Math.cos(heading) * speed,
    y: Math.sin(heading) * speed,
  };

  state.projectiles.push({
    id: `${owner}-${weapon}-${state.projectiles.length}-${Math.round(state.elapsedMs)}`,
    owner,
    weapon,
    position: { ...position },
    velocity,
    radius: owner === 'player' ? 5 : 6,
    damage,
    lifetimeMs,
    maxLifetimeMs: lifetimeMs,
    alive: true,
  });
};

const spawnEnemy = (state: GameState, type: 'chaser' | 'shooter') => {
  const player = state.player;
  const config = state.config;
  const minDistance = 180;
  const pad = 30;

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const angle = state.rng() * Math.PI * 2;
    const radius = minDistance + state.rng() * 220;
    const candidate = {
      x: player.position.x + Math.cos(angle) * radius,
      y: player.position.y + Math.sin(angle) * radius,
    };

    if (candidate.x < pad || candidate.x > config.arenaWidth - pad) continue;
    if (candidate.y < pad || candidate.y > config.arenaHeight - pad) continue;

    const blocked = state.islands.some((island) =>
      circleCollidesWithIsland(candidate, 18, island),
    );

    if (blocked) continue;

    const enemy: EnemyUnit = {
      id: `${type}-${state.elapsedMs}-${state.enemies.length}-${Math.round(state.rng() * 1000)}`,
      type,
      position: candidate,
      velocity: { x: 0, y: 0 },
      heading: Math.atan2(player.position.y - candidate.y, player.position.x - candidate.x),
      radius: type === 'chaser' ? 16 : 18,
      hp: type === 'chaser' ? 1 : 2,
      maxHp: type === 'chaser' ? 1 : 2,
      alive: true,
      cooldownMs: type === 'shooter' ? 300 + state.rng() * 800 : 0,
    };

    state.enemies.push(enemy);
    return;
  }
};

export const createInitialGameState = (
  seed = 1337,
  config: Partial<GameConfigSnapshot> = {},
): GameState => {
  const merged = { ...DEFAULT_GAME_CONFIG_SNAPSHOT, ...config };
  const player = {
    radius: 18,
    position: { x: merged.arenaWidth * 0.5, y: merged.arenaHeight * 0.5 },
    velocity: { x: 0, y: 0 },
    heading: 0,
    hp: merged.playerMaxHp,
    maxHp: merged.playerMaxHp,
  };

  return {
    seed,
    status: 'running',
    score: 0,
    elapsedMs: 0,
    remainingMs: merged.sessionSeconds * 1000,
    player,
    enemies: [],
    projectiles: [],
    islands: createIslands(),
    weaponCooldowns: { front: 0, left: 0, right: 0 },
    fireCooldownMs: 0,
    spawnTimerMs: 0,
    lastEvent: null,
    rng: makeRng(seed),
    config: merged,
  };
};

export const step = (state: GameState, input: InputState, dt: number): GameState => {
  if (state.status !== 'running' || input.paused) {
    return state;
  }

  const next: GameState = {
    ...state,
    player: {
      ...state.player,
      position: { ...state.player.position },
      velocity: { ...state.player.velocity },
    },
    enemies: state.enemies.map((enemy) => ({
      ...enemy,
      position: { ...enemy.position },
      velocity: { ...enemy.velocity },
    })),
    projectiles: state.projectiles.map((projectile) => ({
      ...projectile,
      position: { ...projectile.position },
      velocity: { ...projectile.velocity },
    })),
    islands: state.islands.map((island) => ({ ...island })),
    weaponCooldowns: { ...state.weaponCooldowns },
  };

  const config = next.config;
  const frameDt = clamp(dt, 0.008, 0.05);
  const player = next.player;

  if (next.remainingMs <= 0) {
    next.status = 'finished';
    next.lastEvent = 'time_expired';
    return next;
  }

  player.heading = normalizeAngle(
    player.heading + input.turn * config.playerAngularSpeed * frameDt,
  );

  const thrustStrength = clamp(input.thrust, 0, 1);
  if (thrustStrength > 0) {
    const forwardX = Math.cos(player.heading);
    const forwardY = Math.sin(player.heading);
    const moveSpeed = config.playerSpeed * thrustStrength;
    player.velocity.x = forwardX * moveSpeed;
    player.velocity.y = forwardY * moveSpeed;
  } else {
    player.velocity.x *= 0.88;
    player.velocity.y *= 0.88;
  }

  player.position.x += player.velocity.x * frameDt;
  player.position.y += player.velocity.y * frameDt;
  clampToArena(player.position, player.radius, config);
  resolveIslandCollision(player.position, player.velocity, player.radius, next.islands);
  clampToArena(player.position, player.radius, config);

  const attackCooldown = (weapon: WeaponType, value: number) => {
    next.weaponCooldowns[weapon] = Math.max(0, next.weaponCooldowns[weapon] - value * 1000);
  };

  next.fireCooldownMs = Math.max(0, next.fireCooldownMs - frameDt * 1000);
  attackCooldown('front', frameDt);
  attackCooldown('left', frameDt);
  attackCooldown('right', frameDt);

  if (input.fireFront && next.fireCooldownMs <= 0) {
    spawnProjectile(
      next,
      'player',
      'front',
      {
        x: player.position.x + Math.cos(player.heading) * (player.radius + 12),
        y: player.position.y + Math.sin(player.heading) * (player.radius + 12),
      },
      player.heading,
      config.projectileSpeed,
      config.projectileDamage,
      config.projectileLifetimeMs,
    );
    next.fireCooldownMs = config.projectileCooldownMs;
    next.weaponCooldowns.front = config.projectileCooldownMs;
  }

  if (input.fireLeft && next.fireCooldownMs <= 0) {
    const spread = (config.lateralShotSpread * Math.PI) / 180;
    const baseAngle = player.heading - Math.PI / 2;
    for (let i = -1; i <= 1; i += 1) {
      const angle = baseAngle + i * spread * 0.65;
      spawnProjectile(
        next,
        'player',
        'left',
        {
          x: player.position.x + Math.cos(angle) * (player.radius + 12),
          y: player.position.y + Math.sin(angle) * (player.radius + 12),
        },
        angle,
        config.projectileSpeed,
        config.projectileDamage,
        config.projectileLifetimeMs,
      );
    }
    next.fireCooldownMs = config.projectileCooldownMs * 1.7;
    next.weaponCooldowns.left = config.projectileCooldownMs * 1.7;
  }

  if (input.fireRight && next.fireCooldownMs <= 0) {
    const spread = (config.lateralShotSpread * Math.PI) / 180;
    const baseAngle = player.heading + Math.PI / 2;
    for (let i = -1; i <= 1; i += 1) {
      const angle = baseAngle + i * spread * 0.65;
      spawnProjectile(
        next,
        'player',
        'right',
        {
          x: player.position.x + Math.cos(angle) * (player.radius + 12),
          y: player.position.y + Math.sin(angle) * (player.radius + 12),
        },
        angle,
        config.projectileSpeed,
        config.projectileDamage,
        config.projectileLifetimeMs,
      );
    }
    next.fireCooldownMs = config.projectileCooldownMs * 1.7;
    next.weaponCooldowns.right = config.projectileCooldownMs * 1.7;
  }

  next.projectiles = next.projectiles.filter((projectile) => {
    if (!projectile.alive) return false;

    projectile.position.x += projectile.velocity.x * frameDt;
    projectile.position.y += projectile.velocity.y * frameDt;
    projectile.lifetimeMs -= frameDt * 1000;

    if (
      projectile.position.x <= 0 ||
      projectile.position.x >= config.arenaWidth ||
      projectile.position.y <= 0 ||
      projectile.position.y >= config.arenaHeight ||
      projectile.lifetimeMs <= 0
    ) {
      return false;
    }

    const blocked = next.islands.some((island) =>
      circleCollidesWithIsland(projectile.position, projectile.radius, island),
    );

    if (blocked) return false;

    if (projectile.owner === 'player') {
      for (const enemy of next.enemies) {
        if (!enemy.alive) continue;
        if (distance(projectile.position, enemy.position) <= enemy.radius + projectile.radius) {
          enemy.hp -= projectile.damage;
          if (enemy.hp <= 0) {
            enemy.alive = false;
            if (enemy.type === 'chaser') {
              next.score += 0;
            } else {
              next.score += 1;
            }
          }
          return false;
        }
      }
    } else if (distance(projectile.position, player.position) <= player.radius + projectile.radius) {
      player.hp -= projectile.damage;
      if (player.hp <= 0) {
        player.hp = 0;
        next.status = 'finished';
        next.lastEvent = 'player_destroyed';
      }
      return false;
    }

    return true;
  });

  next.enemies = next.enemies.filter((enemy) => {
    if (!enemy.alive) return false;

    enemy.cooldownMs = Math.max(0, enemy.cooldownMs - frameDt * 1000);
    const toPlayer = {
      x: player.position.x - enemy.position.x,
      y: player.position.y - enemy.position.y,
    };
    const length = Math.hypot(toPlayer.x, toPlayer.y) || 0.0001;
    const dirX = toPlayer.x / length;
    const dirY = toPlayer.y / length;

    if (enemy.type === 'chaser') {
      const speed = config.chaserSpeed;
      enemy.velocity.x = dirX * speed;
      enemy.velocity.y = dirY * speed;
      enemy.position.x += enemy.velocity.x * frameDt;
      enemy.position.y += enemy.velocity.y * frameDt;
      enemy.heading = Math.atan2(dirY, dirX);
      resolveIslandCollision(enemy.position, enemy.velocity, enemy.radius, next.islands);
      clampToArena(enemy.position, enemy.radius, config);

      if (distance(enemy.position, player.position) <= enemy.radius + player.radius) {
        player.hp -= config.chaserDamage;
        enemy.alive = false;
        if (player.hp <= 0) {
          player.hp = 0;
          next.status = 'finished';
          next.lastEvent = 'player_destroyed';
        }
        return false;
      }
      return true;
    }

    const dist = distance(enemy.position, player.position);
    const wantDistance = config.shooterRange;
    const approach = dist > wantDistance ? 1 : -1;
    const targetSpeed = config.shooterSpeed * approach;
    enemy.velocity.x = dirX * targetSpeed;
    enemy.velocity.y = dirY * targetSpeed;
    enemy.position.x += enemy.velocity.x * frameDt;
    enemy.position.y += enemy.velocity.y * frameDt;
    enemy.heading = Math.atan2(dirY, dirX);
    resolveIslandCollision(enemy.position, enemy.velocity, enemy.radius, next.islands);
    clampToArena(enemy.position, enemy.radius, config);

    if (dist <= config.shooterRange && enemy.cooldownMs <= 0) {
      const projectileDir = Math.atan2(player.position.y - enemy.position.y, player.position.x - enemy.position.x);
      spawnProjectile(
        next,
        'enemy',
        'front',
        {
          x: enemy.position.x + Math.cos(projectileDir) * (enemy.radius + 12),
          y: enemy.position.y + Math.sin(projectileDir) * (enemy.radius + 12),
        },
        projectileDir,
        config.projectileSpeed * 0.7,
        config.shooterDamage,
        config.projectileLifetimeMs * 0.6,
      );
      enemy.cooldownMs = config.shooterCooldownMs;
    }

    return true;
  });

  if (next.status === 'finished') {
    return next;
  }

  next.spawnTimerMs += frameDt * 1000;
  if (next.spawnTimerMs >= config.spawnIntervalMs) {
    next.spawnTimerMs = 0;
    const nextKind = next.rng() > 0.5 ? 'chaser' : 'shooter';
    spawnEnemy(next, nextKind);
  }

  next.elapsedMs += frameDt * 1000;
  next.remainingMs = Math.max(0, config.sessionSeconds * 1000 - next.elapsedMs);

  if (next.remainingMs <= 0) {
    next.status = 'finished';
    next.lastEvent = 'time_expired';
  }

  if (player.hp <= 0) {
    next.status = 'finished';
    next.lastEvent = 'player_destroyed';
  }

  return next;
};

export const formatTime = (ms: number) => `${Math.max(0, Math.ceil(ms / 1000))}s`;
