# Performance profile

Este documento define o procedimento para medir desempenho do jogo em Chrome DevTools e manter um registro reprodutível do comportamento da simulação.

## Objetivo

Validar, em ambiente de referência, que o jogo mantém:

- taxa de quadros (FPS) próxima a 60;
- p95 do tempo entre frames em um patamar aceitável;
- contagem estável de entidades ao longo de uma partida de 3 minutos;
- comportamento de memória após 5 ciclos de iniciar → jogar → sair.

## Ambiente recomendado

- navegador: Chrome/Chromium atual;
- resolução: desktop 1440x900 ou a resolução do alvo de teste;
- build: `npm run build` e abrir a versão em `npm run dev -- --host 127.0.0.1`;
- modo de teste: `http://127.0.0.1:5173/?test=1` para utilizar a API `window.__game`.

## Procedimento para 3 minutos

1. Inicie o app localmente.
2. Abra o Chrome DevTools.
3. Vá em Performance.
4. Selecione as opções de memória e JS profiling.
5. Acesse `/?test=1`.
6. Inicie a gravação.
7. Inicie a partida a partir do menu.
8. Jogue por 3 minutos, mantendo movimento, disparos e combate ativos.
9. Pare a gravação e analise:
   - FPS médio e mínimo;
   - p95 do frame time;
   - spikes de renderização;
   - crescimento de entidades por segundo.

## Captura de entidades em tempo real

Use o console do DevTools durante a partida:

```js
const sample = () => {
  const state = window.__game?.readState();
  return {
    status: state?.status ?? 'idle',
    enemies: state?.enemies.length ?? 0,
    projectiles: state?.projectiles.length ?? 0,
    playerHp: state?.player.hp ?? 0,
    heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / (1024 * 1024)) : null,
  };
};

setInterval(() => console.table([sample()]), 2000);
```

A contagem de entidades deve ser observada em uma janela de 180 segundos e registrada em tabela em formato de benchmark local.

## Procedimento para memória após 5 ciclos

1. Inicie a sessão no perfil de memória do DevTools.
2. Execute 5 ciclos completos do fluxo:
   - iniciar partida;
   - jogar por alguns segundos;
   - sair da partida e retornar ao menu.
3. Verifique se o heap está estabilizado ou se existe crescimento contínuo.
4. Observe retenção de texturas, containers PixiJS, listeners e objetos de simulação.

## Registro da amostra

Preencher o bloco a seguir no ato da medição local em máquina alvo:

```md
### Baseline local
- Hardware: <modelo>
- CPU: <modelo>
- RAM: <quantidade>
- Browser: <versão>
- Resolução: <resolução>
- Build: <modo>
- Partida: 3 minutos / seed <número>

- FPS médio: <valor>
- FPS mínimo: <valor>
- p95 frame time: <valor> ms
- entidades máximas: <valor>
- heap final: <valor> MB
- crescimento após 5 ciclos: <valor> MB
```

## Regras de aceite

- FPS alvo de referência: 60 FPS.
- p95 do frame time: preferencialmente abaixo de 16,7 ms.
- sem regressão estrutural em memória entre ciclos.
- sem vazamentos visíveis de listeners, textures ou entidades após sair do match.

## Observações

A definição de desempenho foi pensada para ser reproduzível em qualquer máquina de desenvolvimento, mas a medição final deve ser registrada no ambiente de referência da máquina de avaliação para que a comparação seja confiável.
