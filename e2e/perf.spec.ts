import { expect, test } from '@playwright/test';

test.describe('performance benchmark', () => {
  test('captures FPS, frame p95 and heap usage during gameplay', async ({ page }) => {
    await page.goto('/?test=1');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
      window.dispatchEvent(new Event('storage'));
    });

    const beforeHeapBytes = await page.evaluate(() => {
      const heap = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory?.usedJSHeapSize ?? 0;
      return heap;
    });

    await page.getByRole('button', { name: 'PLAY' }).click();
    await page.evaluate(() => {
      const game = window.__game;
      if (!game) return;
      game.setSeed(42);
      game.startMatch();
    });

    await page.waitForFunction(() => window.__game?.readState()?.status === 'running');

    const benchmark = await page.evaluate(async () => {
      const samples: number[] = [];
      const start = performance.now();
      const stopAt = start + 3000;
      let last = performance.now();

      await new Promise<void>((resolve) => {
        const tick = (now: number) => {
          const delta = now - last;
          samples.push(delta);
          last = now;

          if (now >= stopAt) {
            resolve();
            return;
          }

          requestAnimationFrame(tick);
        };

        requestAnimationFrame(tick);
      });

      const sorted = [...samples].sort((left, right) => left - right);
      const p95 = sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
      const meanFrameMs = samples.reduce((total, value) => total + value, 0) / Math.max(1, samples.length);
      const avgFps = 1000 / meanFrameMs;
      const heapBytes = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory?.usedJSHeapSize ?? 0;

      return {
        frameCount: samples.length,
        averageFrameMs: Number(meanFrameMs.toFixed(2)),
        averageFps: Number(avgFps.toFixed(2)),
        p95FrameMs: Number(p95.toFixed(2)),
        minFrameMs: Number(Math.min(...samples).toFixed(2)),
        maxFrameMs: Number(Math.max(...samples).toFixed(2)),
        heapUsedMb: Number((heapBytes / (1024 * 1024)).toFixed(2)),
      };
    });

    const afterHeapBytes = await page.evaluate(() => {
      const heap = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory?.usedJSHeapSize ?? 0;
      return heap;
    });
    const heapDeltaMb = Number((((afterHeapBytes - beforeHeapBytes) / (1024 * 1024))).toFixed(2));

    expect(benchmark.frameCount).toBeGreaterThan(0);

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({
      benchmark,
      heapDeltaMb,
      beforeHeapMb: Number((beforeHeapBytes / (1024 * 1024)).toFixed(2)),
      afterHeapMb: Number((afterHeapBytes / (1024 * 1024)).toFixed(2)),
    }, null, 2));
  });
});
