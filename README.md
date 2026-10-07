# Pirate Game

Jogo naval em React + TypeScript + PixiJS, com simulação do combate, ranking mockado e um monte de coisa pronta pra testar no browser.

Essa versão já tá bem no caminho do desafio: menu, opções, arena, HUD, pause, ranking/histórico, MSW e um benchmark de performance funcionando.

## Como rodar

```bash
npm install
npm run dev -- --host 127.0.0.1
```

Depois abre:

```text
http://127.0.0.1:5173/
```

Se quiser entrar no modo de instrumentação de teste:

```text
http://127.0.0.1:5173/?test=1
```

## Comandos chave

```bash
npm run dev
npm run build
npm run lint
npm run perf:benchmark
npx playwright test e2e/challenge.spec.ts --project=chromium-desktop
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
- toque: joystick e botões na tela

## Stack usada

- renderização: PixiJS
- UI: React 19
- simulação: engine determinístico em `src/game/sim`
- dados e mocks: Axios + TanStack Query + MSW
- testes: Playwright

## Documentação relevante

- Arquitetura: [ARCHITECTURE.md](ARCHITECTURE.md)
- Perfil de performance: [docs/performance-profile.md](docs/performance-profile.md)
- Benchmark: [reports/performance-benchmark.md](reports/performance-benchmark.md)
- Checklist de profiling: [reports/performance-checklist.md](reports/performance-checklist.md)
- Relatório de testes: [e2e/challenge.spec.ts](e2e/challenge.spec.ts)

## Performance e benchmark

Tem um benchmark pronto em [e2e/perf.spec.ts](e2e/perf.spec.ts) e o passo a passo de medição em [docs/performance-profile.md](docs/performance-profile.md).

A ideia é medir:

- FPS médio
- p95 do frame time
- número de entidades
- uso de memória
- comportamento após iniciar, jogar e sair da partida

Essa parte é importante porque o desafio pede evidência, não só “parece que tá fluido”.

## Observações rápidas

- o modo `?test=1` expõe `window.__game` para validar o estado real do jogo no browser;
- ranking e histórico usam mock de rede via MSW, com cenários de falha e recuperação;
- a app salva opções e último resultado no `localStorage`;
- a simulação foi pensada pra ser determinística e reproduzível em teste.

## Estado atual

Tá funcionando como um MVP forte do desafio:

- combate em arena com inimigos
- HUD com vida, pontos e tempo
- menu e pause
- ranking/histórico mockado
- testes E2E cobrindo o fluxo principal
- benchmark de performance documentado

Ainda tem uma diferença importante com a entrega “full challenge”: o benchmark atual foi medido em Chromium headless e ainda fica abaixo da referência de 60 FPS. Isso não é um bug do processo; é um diagnóstico real do ambiente usado para medir.

Se a ideia é fechar o desafio de verdade, o próximo passo é validar em ambiente de referência real, com Chrome desktop completo e sem headless, pra registrar a baseline final com menos ruído.
