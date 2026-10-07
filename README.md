# Pirate Game

Jogo de batalha naval em React + TypeScript + PixiJS, com simulação do combate, ranking/histórico mockado, e testes de browser no Playwright.

## Rodando localmente

```bash
npm install
npm run dev -- --host 127.0.0.1
```

Depois abre a URL que aparecer no terminal:

```text
http://127.0.0.1:5173/
```

Se quiser ativar o modo de instrumentação de teste:

```text
http://127.0.0.1:5173/?test=1
```

## Comandos úteis

```bash
npm run dev
npm run build
npm run lint
npx playwright test e2e/step10.spec.ts --project=chromium-desktop
npx playwright show-report
```

## Controles

- `W` / `ArrowUp`: avançar
- `A` / `ArrowLeft`: virar para a esquerda
- `D` / `ArrowRight`: virar para a direita
- `Espaço`: disparo frontal
- `Q`: disparo lateral esquerdo
- `E`: disparo lateral direito
- `P`: pausar/despausar
- toque: joystick e disparo na tela

## Stack do projeto

- renderização: PixiJS
- UI: React 19
- simulação: engine determinístico em `src/game/sim`
- dados e mocks: Axios + TanStack Query + MSW
- testes: Playwright

## Documentação

- Arquitetura: [ARCHITECTURE.md](ARCHITECTURE.md)
- Profiling: [docs/performance-profile.md](docs/performance-profile.md)
- Licenças/assets: [LICENSES.md](LICENSES.md)
- Relatório de testes: [reports/playwright-step10.md](reports/playwright-step10.md)
- Checklist de perfil: [reports/performance-checklist.md](reports/performance-checklist.md)

## Performance

O passo 11 ficou documentado em [docs/performance-profile.md](docs/performance-profile.md). Ali tem o passo a passo para medir:

- FPS
- p95 de frame time
- número de entidades em 3 minutos
- uso de memória após 5 ciclos de iniciar/jogar/sair

## Observações rápidas

- o modo `?test=1` expõe `window.__game` para validar o estado real do jogo no browser;
- ranking e histórico são mockados para simular falhas e recuperação de rede;
- os relatórios ficam em `reports/` para manter evidência de regressão e profiling.
