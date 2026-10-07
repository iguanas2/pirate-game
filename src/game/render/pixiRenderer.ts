import { Application, Container, Graphics, Sprite, Ticker, Texture } from 'pixi.js';
import type { EnemyUnit, GameState, PlayerUnit } from '../sim';
import { loadGameTextures, type AssetProgress } from './assetLoader';

const VIEWPORT_WIDTH = 960;
const VIEWPORT_HEIGHT = 540;
const WORLD_WIDTH = 2880;
const WORLD_HEIGHT = 1620;
const CAMERA_ZOOM = 1.2;

interface RendererInitOptions {
  container: HTMLDivElement;
  signal?: AbortSignal;
  onProgress?: (progress: AssetProgress) => void;
  onError?: (error: Error) => void;
}

interface EffectEntry {
  id: string;
  circle: Graphics;
  ageMs: number;
  ttlMs: number;
}

export class GamePixiRenderer {
  private app: Application | null = null;
  private root: Container | null = null;
  private backgroundLayer: Container | null = null;
  private shipLayer: Container | null = null;
  private projectileLayer: Container | null = null;
  private islandLayer: Container | null = null;
  private effectLayer: Container | null = null;
  private textures: Partial<Record<string, Texture>> = {};
  private shipNodes = new Map<string, { sprite: Sprite; bar: Container; fill: Graphics; hitFlashMs: number; lastHp: number }>();
  private projectilePool = new Map<string, Sprite>();
  private effects = new Map<string, EffectEntry>();
  private previousAlive = new Map<string, boolean>();
  private previousProjectileIds = new Set<string>();
  private host: HTMLDivElement | null = null;
  private resizeHandler: (() => void) | null = null;
  private initToken = 0;
  private camera = { x: 0, y: 0 };

  async init(options: RendererInitOptions) {
    const { container, signal, onProgress, onError } = options;
    this.host = container;
    const token = ++this.initToken;

    try {
      this.textures = await loadGameTextures(onProgress, signal);
      if (signal?.aborted || token !== this.initToken) return;

      const viewportWidth = Math.max(1, container.clientWidth || VIEWPORT_WIDTH);
      const viewportHeight = Math.max(1, container.clientHeight || VIEWPORT_HEIGHT);

      this.app = new Application();
      await this.app.init({
        width: viewportWidth,
        height: viewportHeight,
        antialias: true,
        backgroundAlpha: 0,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });

      this.app.canvas.style.display = 'block';
      this.app.canvas.style.width = '100%';
      this.app.canvas.style.height = '100%';
      this.app.canvas.style.borderRadius = '18px';

      this.root = new Container();
      this.backgroundLayer = new Container();
      this.islandLayer = new Container();
      this.shipLayer = new Container();
      this.projectileLayer = new Container();
      this.effectLayer = new Container();

      const waterTexture = this.textures.water ?? Texture.WHITE;
      const background = Sprite.from(waterTexture);
      background.width = WORLD_WIDTH;
      background.height = WORLD_HEIGHT;
      this.backgroundLayer.addChild(background);

      this.root.addChild(this.backgroundLayer, this.islandLayer, this.projectileLayer, this.shipLayer, this.effectLayer);
      this.app.stage.addChild(this.root);

      this.app.ticker.add(this.onTick);
      this.bindResize();
      this.updateLayout();
      container.appendChild(this.app.canvas);
    } catch (error) {
      const exception = error instanceof Error ? error : new Error('Falha ao iniciar o render PixiJS');
      if (signal?.aborted) return;
      onError?.(exception);
      throw exception;
    }
  }

  updateFromState(game: GameState) {
    if (!this.app || !this.root || !this.shipLayer || !this.projectileLayer || !this.islandLayer) {
      return;
    }

    const viewportWidth = Math.max(1, this.app.renderer.width || VIEWPORT_WIDTH);
    const viewportHeight = Math.max(1, this.app.renderer.height || VIEWPORT_HEIGHT);
    this.camera.x = game.player.position.x - viewportWidth / (2 * CAMERA_ZOOM);
    this.camera.y = game.player.position.y - viewportHeight / (2 * CAMERA_ZOOM);

    this.renderBackground();
    this.renderIslands(game);
    this.renderShips(game);
    this.renderProjectiles(game);
    this.updateLayout(game);
  }

  destroy() {
    this.initToken += 1;

    if (this.resizeHandler && this.host) {
      window.removeEventListener('resize', this.resizeHandler);
      this.host.removeEventListener('resize', this.resizeHandler);
    }

    if (this.app) {
      this.app.ticker.remove(this.onTick);
      this.app.destroy(true, { children: true, texture: true });
    }

    this.textures = {};
    this.shipNodes.clear();
    this.projectilePool.clear();
    this.effects.clear();
    this.previousAlive.clear();
    this.previousProjectileIds.clear();
    this.root = null;
    this.backgroundLayer = null;
    this.shipLayer = null;
    this.projectileLayer = null;
    this.islandLayer = null;
    this.effectLayer = null;
    this.app = null;

    if (this.host) {
      this.host.innerHTML = '';
    }
  }

  private bindResize = () => {
    if (!this.host) return;
    this.resizeHandler = () => this.updateLayout();
    window.addEventListener('resize', this.resizeHandler);
    this.host.addEventListener('resize', this.resizeHandler);
  };

  private updateLayout = (game?: GameState) => {
    if (!this.app || !this.root || !this.host) return;

    const bounds = this.host.getBoundingClientRect();
    const width = Math.max(1, bounds.width || VIEWPORT_WIDTH);
    const height = Math.max(1, bounds.height || VIEWPORT_HEIGHT);

    const worldWidth = width / CAMERA_ZOOM;
    const worldHeight = height / CAMERA_ZOOM;

    const cameraX = game
      ? Math.min(Math.max(game.player.position.x - worldWidth / 2, 0), WORLD_WIDTH - worldWidth)
      : Math.min(Math.max(this.camera.x, 0), WORLD_WIDTH - worldWidth);
    const cameraY = game
      ? Math.min(Math.max(game.player.position.y - worldHeight / 2, 0), WORLD_HEIGHT - worldHeight)
      : Math.min(Math.max(this.camera.y, 0), WORLD_HEIGHT - worldHeight);

    this.camera.x = cameraX;
    this.camera.y = cameraY;

    this.app.renderer.resize(width, height);
    this.root.scale.set(CAMERA_ZOOM);
    this.root.position.set(-cameraX * CAMERA_ZOOM, -cameraY * CAMERA_ZOOM);
  };

  private onTick = (ticker: Ticker) => {
    const deltaMs = ticker.deltaMS;

    for (const [id, effect] of [...this.effects.entries()]) {
      effect.ageMs += deltaMs;
      const progress = Math.min(effect.ageMs / effect.ttlMs, 1);
      effect.circle.alpha = 1 - progress;
      effect.circle.scale.set(1 + progress * 2.8);

      if (progress >= 1) {
        effect.circle.destroy();
        this.effects.delete(id);
      }
    }

    for (const node of this.shipNodes.values()) {
      if (node.hitFlashMs > 0) {
        node.hitFlashMs = Math.max(0, node.hitFlashMs - deltaMs);
        node.sprite.alpha = node.hitFlashMs > 0 ? 0.55 + (node.hitFlashMs / 180) * 0.45 : 1;
      }
    }
  };

  private renderBackground() {
    if (!this.backgroundLayer || !this.textures.water) return;

    this.backgroundLayer.removeChildren();

    const tileSize = 64;
    const columns = Math.ceil(WORLD_WIDTH / tileSize) + 1;
    const rows = Math.ceil(WORLD_HEIGHT / tileSize) + 1;

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < columns; col += 1) {
        const tile = Sprite.from(this.textures.water);
        tile.width = tileSize;
        tile.height = tileSize;
        tile.x = col * tileSize;
        tile.y = row * tileSize;
        this.backgroundLayer.addChild(tile);
      }
    }
  }

  private renderIslands(game: GameState) {
    if (!this.islandLayer) return;
    this.islandLayer.removeChildren();

    const islandTiles = [
      'island-top-left',
      'island-top',
      'island-top-right',
      'island-left',
      'island-center',
      'island-right',
      'island-bottom-left',
      'island-bottom',
      'island-bottom-right',
    ] as const;

    for (const island of game.islands) {
      const islandContainer = new Container();
      islandContainer.x = island.x;
      islandContainer.y = island.y;
      islandContainer.pivot.set(0, 0);

      const size = island.size;
      const tileSize = (island.radius * 2) / size;
      const tiles: Sprite[] = [];

      for (let row = 0; row < size; row += 1) {
        for (let col = 0; col < size; col += 1) {
          const isFourByFour = size === 4;
          const tileKey = isFourByFour
            ? `island2-${row + 1}x${col + 1}`
            : islandTiles[Math.min(row * size + col, islandTiles.length - 1)];

          const sprite = Sprite.from(this.textures[tileKey] ?? Texture.WHITE);
          sprite.width = tileSize;
          sprite.height = tileSize;
          sprite.x = col * tileSize;
          sprite.y = row * tileSize;
          sprite.anchor.set(0);
          tiles.push(sprite);
        }
      }

      islandContainer.addChild(...tiles);
      islandContainer.position.set(island.x - island.radius, island.y - island.radius);
      this.islandLayer.addChild(islandContainer);
    }
  }

  private renderShips(game: GameState) {
    if (!this.shipLayer) return;

    const shipLayer = this.shipLayer;
    const visibleIds = new Set<string>();

    const renderShip = (key: string, unit: PlayerUnit | EnemyUnit, variant: 'player' | 'enemy') => {
      visibleIds.add(key);
      const position = unit.position;
      let current = this.shipNodes.get(key);

      if (!current) {
        const sprite = Sprite.from(this.getShipTexture(unit, variant));
        sprite.anchor.set(0.5);
        sprite.width = 66 * 0.42;
        sprite.height = 113 * 0.42;
        sprite.rotation = this.toVisualAngle(unit.heading);

        const bar = new Container();
        bar.position.set(position.x, position.y);
        shipLayer.addChild(sprite, bar);

        const border = new Graphics();
        border.beginFill(0x1c1c1c, 0.8);
        border.drawRect(-18, -42, 36, 6);
        border.endFill();
        bar.addChild(border);

        const fill = new Graphics();
        fill.beginFill(0x4ade80);
        fill.drawRect(-18, -42, 36, 6);
        fill.endFill();
        bar.addChild(fill);

        current = { sprite, bar, fill, hitFlashMs: 0, lastHp: unit.hp ?? 1 };
        this.shipNodes.set(key, current);
      }

      const previousHp = current.lastHp;
      if ((unit.hp ?? 1) < previousHp) {
        current.hitFlashMs = 180;
      }

      current.lastHp = unit.hp ?? 1;
      current.sprite.texture = this.getShipTexture(unit, variant);
      current.sprite.x = position.x;
      current.sprite.y = position.y;
      current.sprite.rotation = this.toVisualAngle(unit.heading);
      current.sprite.alpha = current.hitFlashMs > 0 ? 0.55 : 1;

      const ratio = Math.max(0, Math.min(1, (unit.hp ?? 1) / ((unit.maxHp ?? unit.hp ?? 1) || 1)));
      current.fill.clear();
      current.fill.beginFill(ratio > 0.5 ? 0x4ade80 : ratio > 0.2 ? 0xfbbf24 : 0xef4444);
      current.fill.drawRect(-18, -42, 36 * ratio, 6);
      current.fill.endFill();
      current.bar.position.set(position.x, position.y);

      if (this.previousAlive.get(key) === true && (unit as { alive?: boolean }).alive === false) {
        this.spawnEffect(position.x, position.y);
      }
      this.previousAlive.set(key, (unit as { alive?: boolean }).alive ?? true);
    };

    renderShip('player', game.player, 'player');
    for (const enemy of game.enemies) {
      renderShip(`${enemy.id}`, enemy, 'enemy');
    }

    for (const [key, node] of [...this.shipNodes.entries()]) {
      if (!visibleIds.has(key)) {
        node.sprite.destroy();
        node.bar.destroy();
        this.shipNodes.delete(key);
        this.previousAlive.delete(key);
      }
    }
  }

  private renderProjectiles(game: GameState) {
    if (!this.projectileLayer) return;

    const visibleIds = new Set<string>();
    const nextIds = new Set<string>();

    for (const projectile of game.projectiles) {
      visibleIds.add(projectile.id);
      nextIds.add(projectile.id);

      let sprite = this.projectilePool.get(projectile.id);
      if (!sprite) {
        sprite = Sprite.from(this.textures['projectile-0'] ?? Texture.WHITE);
        sprite.anchor.set(0.5);
        sprite.width = 12;
        sprite.height = 12;
        sprite.tint = projectile.owner === 'player' ? 0x8be9fd : 0xfca5a5;
        this.projectileLayer.addChild(sprite);
        this.projectilePool.set(projectile.id, sprite);
        this.spawnMuzzleFlash(projectile.position.x, projectile.position.y, projectile.owner);
      }

      sprite.x = projectile.position.x;
      sprite.y = projectile.position.y;
    }

    for (const [id, sprite] of [...this.projectilePool.entries()]) {
      if (!visibleIds.has(id)) {
        sprite.destroy();
        this.projectilePool.delete(id);
      }
    }

    this.previousProjectileIds = nextIds;
  }

  private spawnEffect(x: number, y: number) {
    if (!this.effectLayer) return;

    const id = `fx-${Math.random().toString(36).slice(2)}`;
    const circle = new Graphics();
    circle.beginFill(0xfbbf24, 0.8);
    circle.drawCircle(0, 0, 8);
    circle.endFill();
    circle.x = x;
    circle.y = y;
    circle.alpha = 1;
    this.effectLayer.addChild(circle);
    this.effects.set(id, { id, circle, ageMs: 0, ttlMs: 180 });
  }

  private spawnMuzzleFlash(x: number, y: number, owner: 'player' | 'enemy') {
    if (!this.effectLayer) return;

    const id = `muzzle-${Math.random().toString(36).slice(2)}`;
    const circle = new Graphics();
    circle.beginFill(owner === 'player' ? 0x7dd3fc : 0xfca5a5, 0.9);
    circle.drawCircle(0, 0, 4);
    circle.endFill();
    circle.x = x;
    circle.y = y;
    this.effectLayer.addChild(circle);
    this.effects.set(id, { id, circle, ageMs: 0, ttlMs: 120 });
  }

  private getShipTexture(unit: PlayerUnit | EnemyUnit, variant: 'player' | 'enemy') {
    if (variant === 'player') {
      const hpRatio = (unit.hp ?? 1) / ((unit.maxHp ?? unit.hp ?? 1) || 1);
      return hpRatio > 0.66
        ? (this.textures['player-0'] ?? Texture.WHITE)
        : hpRatio > 0.33
          ? (this.textures['player-1'] ?? Texture.WHITE)
          : (this.textures['player-2'] ?? Texture.WHITE);
    }

    const enemy = unit as EnemyUnit;
    const keyMap = enemy.type === 'chaser'
      ? ['chaser-0', 'chaser-1', 'chaser-2']
      : ['shooter-0', 'shooter-1', 'shooter-2'];

    const ratio = (unit.hp ?? 1) / ((unit.maxHp ?? unit.hp ?? 1) || 1);
    const chosenKey = ratio > 0.66 ? keyMap[0] : ratio > 0.33 ? keyMap[1] : keyMap[2];
    return this.textures[chosenKey] ?? Texture.WHITE;
  }

  private toVisualAngle = (heading: number) => heading - Math.PI / 2;

  public screenToWorld(point: { x: number; y: number }) {
    if (!this.host || !this.app) {
      return { x: point.x, y: point.y };
    }

    const rect = this.host.getBoundingClientRect();
    const scaleX = VIEWPORT_WIDTH / rect.width;
    const scaleY = VIEWPORT_HEIGHT / rect.height;

    return {
      x: (point.x - rect.left) * scaleX + this.camera.x,
      y: (point.y - rect.top) * scaleY + this.camera.y,
    };
  }

  public worldToScreen(point: { x: number; y: number }) {
    if (!this.host) {
      return { x: point.x, y: point.y };
    }

    const rect = this.host.getBoundingClientRect();
    return {
      x: (point.x - this.camera.x / 1) / VIEWPORT_WIDTH * rect.width,
      y: (point.y - this.camera.y / 1) / VIEWPORT_HEIGHT * rect.height,
    };
  }
}
