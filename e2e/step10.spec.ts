import { expect, test } from '@playwright/test';

test.describe('Step 10 - game instrumentation and risk coverage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?test=1');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
      window.dispatchEvent(new Event('storage'));
    });
  });

  test('instrumentation exposes state and allows deterministic control', async ({ page }) => {
    const present = await page.evaluate(async () => {
      const game = window.__game;
      if (!game) return false;
      game.setSeed(42);
      return typeof game.readState === 'function' && typeof game.pressKey === 'function';
    });

    expect(present).toBe(true);
  });

  test('combat risk: start match and ensure player state is live', async ({ page }) => {
    const state = await page.evaluate(async () => {
      const game = window.__game;
      if (!game) return null;
      game.setSeed(7);
      game.startMatch();
      const snapshot = game.readState();
      return {
        status: snapshot.status,
        score: snapshot.score,
        enemies: snapshot.enemies.length,
        projectiles: snapshot.projectiles.length,
      };
    });

    expect(state).not.toBeNull();
    expect(state?.status).toBe('running');
  });

  test('lifecycle risk: pause and resume should not crash the match', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const game = window.__game;
      if (!game) return null;
      game.setSeed(11);
      game.startMatch();
      game.pause();
      const paused = game.readState();
      game.resume();
      const resumeState = game.readState();
      return {
        paused: paused.status,
        resumed: resumeState.status,
      };
    });

    expect(result).toEqual({ paused: 'paused', resumed: 'running' });
  });

  test('network risk: scenario selector and ranking render', async ({ page }) => {
    await page.getByLabel('Mock scenario').selectOption('slow');
    await page.getByRole('button', { name: 'Reset mock' }).click();

    const visible = await page.locator('text=Ranking').isVisible();
    const historyVisible = await page.locator('text=History').isVisible();
    expect(visible).toBe(true);
    expect(historyVisible).toBe(true);
  });
});
