# Arquitetura

## Visão geral

O projeto ficou dividido em camadas bem simples:

1. React cuida do menu, opções, telas de resultado e painel de ranking/histórico.
2. a simulação vive em `src/game/sim` e define as regras do combate, colisões, vida, spawns e tempo.
3. o PixiJS fica em `src/game/render` e desenha a arena, as naves, os projéteis e os efeitos visuais.
4. o input tá em `src/game/inpupt` e normaliza teclado, toque e pausa.
5. a parte de dados e mock de rede fica em `src/api` e `src/ui`, com persistência local e snapshots do HUD.

## Como o fluxo funciona

- `App` organiza as telas e o estado da sessão.
- `createInitialGameState` cria a partida com seed e snapshot da configuração atual.
- `step` roda a simulação e respeita `paused` e o fim da partida.
- `GamePixiRenderer` transforma o estado do jogo em cena visível.
- `publishGameUiSnapshot` e `subscribeToGameUi` evitam re-render do React a cada frame.
- `fetchRanking`, `fetchHistory` e `registerScore` usam Axios + TanStack Query para o ranking e o histórico.

## Simulação

A lógica do jogo foi pensada para ser previsível e reprodutível:

- seed configurável para partidas e testes;
- atualização pelo `dt`, sem depender da taxa de quadros do navegador;
- arena com limite e colisão com ilhas;
- cooldown por arma e disparos laterais;
- tempo restante, score, HP e fim de partida.

O ponto chave é esse:

```ts
if (state.status !== 'running' || input.paused) {
  return state;
}
```

Esse guard centraliza a pausa e funciona como bloqueio para o avanço do jogo quando o estado tá parado.

## Renderização

O PixiJS fica responsável por:

- montar o canvas e as texturas;
- desenhar água, ilhas e entidades;
- atualizar HP, sprites e efeitos de impacto;
- limpar recursos quando a partida fecha ou reinicia.

A renderização da arena fica separada da interface React, então o jogo não fica re-renderizando a página inteira a cada frame.

## Input

A camada de input junta teclado, toque e estado de pausa:

- `turnLeft`, `turnRight`, `thrust` e disparos;
- `normalizeInputState` centraliza a validação dos inputs;
- `toSimulationInput` transforma os valores no formato que a simulação entende.

Pausa por teclado, foco perdido ou aba escondida usam a mesma regra para não avançar o cronômetro sem querer.

## Persistência e UI

A UI salva algumas coisas em `localStorage`:

- opções do jogador;
- último resultado;
- estado de ranking/histórico pendente;
- cenário de rede selecionado.

O outbox deixa o envio de resultado continuar mesmo quando a API falha, e depois tenta de novo quando a conexão volta.

## Ranking, histórico e MSW

A camada de API define contratos para ranking, histórico e registro da partida. O MSW simula:

- sucesso;
- timeout;
- latência;
- vazio;
- falhas de rede e recuperação.

Quando um registro fecha, o `queryClient.invalidateQueries` atualiza as abas de ranking e histórico sem deixar dados antigos sobrando.

## Testes e instrumentação

No modo `?test=1`, a app expõe `window.__game` para o Playwright. Isso permite:

- criar uma partida com seed determinístico;
- ler o estado real do jogo;
- disparar inputs do combate;
- validar pausa, retomada e ciclo de vida sem depender de DOM fake.

## Performance

A arquitetura tenta não gastar energia atoa:

- o estado do jogo roda em simulação, não em React;
- o HUD usa snapshot externo em baixa frequência;
- sprites e texturas são reutilizados;
- listeners e recursos são limpos ao sair da partida.

O perfil de performance fica em [docs/performance-profile.md](docs/performance-profile.md). O ideal é medir em máquina de referência e registrar tudo em `reports/`.

## Limitações

- os assets visuais do projeto não tem licença explícita por arquivo no repositório, então a versão pública precisa passar por revisão antes de uso comercial;
- o projeto é um protótipo focado em avaliação e gameplay, não uma distribuição final com compliance completo;
- FPS e memória dependem bastante do hardware e do browser usado para testar.
