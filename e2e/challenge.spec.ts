import { expect, test, type Page } from '@playwright/test';

async function resetApp(page: Page) {
  await page.goto('/?test=1');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.dispatchEvent(new Event('storage'));
  });
}

async function startMatch(page: Page, seed = 42) {
  await page.getByRole('button', { name: 'PLAY' }).click();
  const result = await page.evaluate((value) => {
    const game = window.__game;
    if (!game) return null;
    game.setSeed(value);
    game.startMatch();
    return game.readState();
  }, seed);

  expect(result).not.toBeNull();
  expect(result?.status).toBe('running');
  return result;
}

test.describe('Pirate Battle challenge coverage', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page);
  });

  test('01 - menu navigation, validation and persistence of options', async ({ page }) => {
    await page.getByRole('button', { name: 'OPTIONS' }).click();
    await expect(page.getByRole('heading', { name: 'Options' })).toBeVisible();

    const sessionInput = page.locator('input').nth(0);
    const spawnInput = page.locator('input').nth(1);

    await sessionInput.fill('30');
    await spawnInput.fill('500');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Session length must be between 60 and 180 seconds.')).toBeVisible();
    await expect(page.getByText('Spawn interval must be between 1000ms and 20000ms.')).toBeVisible();

    await sessionInput.fill('120');
    await spawnInput.fill('2000');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('button', { name: 'PLAY' })).toBeVisible();

    await page.reload();
    await page.getByRole('button', { name: 'OPTIONS' }).click();
    await expect(page.locator('input').nth(0)).toHaveValue('120');
    await expect(page.locator('input').nth(1)).toHaveValue('2000');
  });

  test('02 - asset loading indicator is visible during startup', async ({ page }) => {
    await page.getByRole('button', { name: 'PLAY' }).click();
    await expect(page.getByText(/Loading assets|Loading/i)).toBeVisible({ timeout: 10000 });
  });

  test('03 - a match starts with live gameplay state', async ({ page }) => {
    const state = await startMatch(page, 7);
    expect(state?.player.hp).toBeGreaterThan(0);
    expect(state?.player.maxHp).toBeGreaterThan(0);
  });

  test('04 - keyboard controls do not crash the match', async ({ page }) => {
    await startMatch(page, 11);
    const state = await page.evaluate(() => {
      const game = window.__game;
      if (!game) return null;
      game.pressKey('left', true);
      game.pressKey('right', true);
      game.pressKey('up', true);
      game.advance(250);
      return game.readState();
    });

    expect(state).not.toBeNull();
    expect(state?.status).toBe('running');
  });

  test('05 - weapon controls keep the game in a valid state', async ({ page }) => {
    await startMatch(page, 22);
    const state = await page.evaluate(() => {
      const game = window.__game;
      if (!game) return null;
      game.pressKey('fireFront', true);
      game.pressKey('fireLeft', true);
      game.pressKey('fireRight', true);
      game.advance(300);
      return game.readState();
    });

    expect(state).not.toBeNull();
    expect(state?.status).toBe('running');
    expect(Array.isArray(state?.projectiles)).toBeTruthy();
  });

  test('06 - enemy snapshots remain readable during time advancement', async ({ page }) => {
    const state = await page.evaluate(() => {
      const game = window.__game;
      if (!game) return null;
      game.setSeed(33);
      game.startMatch();
      game.advance(5000);
      return game.readState();
    });

    expect(state).not.toBeNull();
    expect(Array.isArray(state?.enemies)).toBeTruthy();
    expect(state?.status).toBe('running');
  });

  test('07 - pause and resume transitions are stable', async ({ page }) => {
    const state = await page.evaluate(() => {
      const game = window.__game;
      if (!game) return null;
      game.setSeed(66);
      game.startMatch();
      const before = game.readState();
      game.pause();
      game.advance(3000);
      const paused = game.readState();
      game.resume();
      const resumed = game.readState();
      return {
        beforeStatus: before?.status,
        pausedStatus: paused?.status,
        resumedStatus: resumed?.status,
        remainingBefore: before?.remainingMs,
        remainingPaused: paused?.remainingMs,
      };
    });

    expect(state).not.toBeNull();
    expect(state?.pausedStatus).toBe('paused');
    expect(state?.resumedStatus).toBe('running');
  });

  test('08 - ranking panel renders from the menu', async ({ page }) => {
    await page.getByRole('button', { name: 'RANKING' }).click();
    await expect(page.getByRole('heading', { name: 'Ranking' })).toBeVisible();
  });

  test('09 - history panel renders from the menu', async ({ page }) => {
    await page.getByRole('button', { name: 'MATCH HISTORY' }).click();
    await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
  });

  test('10 - mock scenario selector is usable and resets to success', async ({ page }) => {
    await page.getByRole('button', { name: 'MOCK' }).click();
    await page.getByLabel('Mock scenario').selectOption('slow');
    await page.getByRole('button', { name: 'Reset mock' }).click();
    await expect(page.getByLabel('Mock scenario')).toHaveValue('success');
  });

  test('11 - touch controls are visible in an active match and the menu can be reopened', async ({ page }) => {
    await startMatch(page, 77);
    await expect(page.locator('.touch-controls')).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: 'Pause match' }).click();
    await page.getByRole('button', { name: 'MAIN MENU' }).click();
    await expect(page.getByRole('button', { name: 'PLAY' })).toBeVisible();
  });

  test('12 - a fresh run can restart cleanly from the main menu', async ({ page }) => {
    await page.getByRole('button', { name: 'PLAY' }).click();
    await expect(page.getByLabel('Pirate battle arena')).toBeVisible();
    await page.getByRole('button', { name: 'Pause match' }).click();
    await page.getByRole('button', { name: 'MAIN MENU' }).click();
    await page.getByRole('button', { name: 'PLAY' }).click();
    await expect(page.getByLabel('Pirate battle arena')).toBeVisible();
  });
});
