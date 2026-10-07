import { Assets, Texture } from 'pixi.js';

import waterTile from '../../../assets/png/default/tiles/tile_73.png';
import islandTopLeft from '../../../assets/png/default/tiles/tile_6.png';
import islandTop from '../../../assets/png/default/tiles/tile_8.png';
import islandTopRight from '../../../assets/png/default/tiles/tile_9.png';
import islandLeft from '../../../assets/png/default/tiles/tile_22.png';
import islandCenter from '../../../assets/png/default/tiles/tile_23.png';
import islandRight from '../../../assets/png/default/tiles/tile_25.png';
import islandBottomLeft from '../../../assets/png/default/tiles/tile_54.png';
import islandBottom from '../../../assets/png/default/tiles/tile_55.png';
import islandBottomRight from '../../../assets/png/default/tiles/tile_57.png';
import playerShip from '../../../assets/png/default/ships/ship_1.png';
import playerShipDamaged from '../../../assets/png/default/ships/ship_7.png';
import playerShipCritical from '../../../assets/png/default/ships/ship_13.png';
import chaserShip from '../../../assets/png/default/ships/ship_5.png';
import chaserShipDamaged from '../../../assets/png/default/ships/ship_11.png';
import chaserShipCritical from '../../../assets/png/default/ships/ship_17.png';
import shooterShip from '../../../assets/png/default/ships/ship_6.png';
import shooterShipDamaged from '../../../assets/png/default/ships/ship_12.png';
import shooterShipCritical from '../../../assets/png/default/ships/ship_18.png';
import projectileSprite from '../../../assets/png/default/ship_parts/cannon_ball.png';

export interface AssetProgress {
  loaded: number;
  total: number;
  percent: number;
}

export const GAME_TEXTURE_MANIFEST = {
  water: waterTile,
  'island-top-left': islandTopLeft,
  'island-top': islandTop,
  'island-top-right': islandTopRight,
  'island-left': islandLeft,
  'island-center': islandCenter,
  'island-right': islandRight,
  'island-bottom-left': islandBottomLeft,
  'island-bottom': islandBottom,
  'island-bottom-right': islandBottomRight,
  'player-0': playerShip,
  'player-1': playerShipDamaged,
  'player-2': playerShipCritical,
  'chaser-0': chaserShip,
  'chaser-1': chaserShipDamaged,
  'chaser-2': chaserShipCritical,
  'shooter-0': shooterShip,
  'shooter-1': shooterShipDamaged,
  'shooter-2': shooterShipCritical,
  'projectile-0': projectileSprite,
} as const;

const MAX_RETRIES = 3;

export async function loadGameTextures(
  onProgress?: (progress: AssetProgress) => void,
  signal?: AbortSignal,
): Promise<Record<string, Texture>> {
  const entries = Object.entries(GAME_TEXTURE_MANIFEST);
  const textures: Record<string, Texture> = {};

  for (let index = 0; index < entries.length; index += 1) {
    const [key, url] = entries[index];

    if (signal?.aborted) {
      throw new DOMException('Asset loading aborted', 'AbortError');
    }

    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        const texture = await Assets.load(url);
        textures[key] = texture as Texture;
        const loaded = index + 1;

        onProgress?.({
          loaded,
          total: entries.length,
          percent: (loaded / entries.length) * 100,
        });
        break;
      } catch (error) {
        lastError = error;
        if (attempt >= MAX_RETRIES) {
          throw new Error(`Falha ao carregar o asset ${key} após ${MAX_RETRIES} tentativas.`, {
            cause: lastError,
          });
        }
      }
    }
  }

  return textures;
}
