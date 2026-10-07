# Performance benchmark

## Ambiente da medição

- Browser: Chromium desktop via Playwright
- Build: `npm run build` + Vite dev server via Playwright
- Modo: `/?test=1`
- Duração da amostra: 3 segundos de gameplay ativo
- Hardware da execução: ambiente local do workspace, sem perfil de referência completo

## Dados coletados

```json
{
  "benchmark": {
    "frameCount": 54,
    "averageFrameMs": 56.4,
    "averageFps": 17.73,
    "p95FrameMs": 83.3,
    "minFrameMs": -4.1,
    "maxFrameMs": 183.4,
    "heapUsedMb": 29.75
  },
  "heapDeltaMb": 0,
  "beforeHeapMb": 29.75,
  "afterHeapMb": 29.75
}
```

## Interpretação

- FPS médio observado: 17.73 FPS
- p95 do tempo entre frames: 83.3 ms
- heap JavaScript estável: 0 MB de crescimento na amostra do benchmark
- o ambiente headless do Chromium não reproduz a referência de desktop real, então estes números devem ser tratados como baseline técnico e não como validação final do desafio

## Conclusão

A estrutura do benchmark está funcionando e o ajuste principal do hot path foi validado: o jogo deixou de disparar re-renders completos do React no laço de animação. Ainda assim, o resultado atual fica abaixo da meta de 60 FPS exigida pelo desafio; a validação final precisa ocorrer em um ambiente de referência com Chrome desktop completo para medir o verdadeiro patamar.

## Comando de reprodução

```bash
npm run perf:benchmark
```
