# Arquitetura

## Visão geral

A estrutura ficou bem direta e funcional:

1. React cuida da UI: menu, opções, result screen, ranking, histórico e telas de sessão.
2. a simulação vive em `src/game/sim` e define regras de combate, tempo, colisões, spawns e vida.
3. o PixiJS fica em `src/game/render` e desenha a arena, os navios, projéteis e efeitos.
4. o input tá em `src/game/inpupt` e normaliza teclado, toque e estado de pausa.
5. os dados e mocks ficam em `src/api`, com persistência local, outbox e snapshots do HUD.

Sem enrolação: a lógica da partida não precisa ficar presa ao React. Isso é o que mantém a coisa mais estável do que parece.

## Como o fluxo anda

- `App` organiza a navegação e o ciclo da partida.
- `createInitialGameState` gera a partida com seed e snapshot da config vigente.
- `step` roda a simulação com `dt`, respeitando pausa e fim de jogo.
- `GamePixiRenderer` transforma o estado em cena visível.
- `publishGameUiSnapshot` e `subscribeToGameUi` deixam o HUD atualizando sem virar um render por frame.
- `fetchRanking`, `fetchHistory` e `registerScore` usam Axios + TanStack Query.

## Simulação

A simulação foi pensada pra ser previsível e de boa pra testar:

- seed configurável;
- atualização por `dt` e não por taxa de quadros;
- ifs de colisão com ilhas;
- cooldown por arma;
- contagem de tempo, score, HP e fim da partida.

O guard principal é esse:

```ts
if (state.status !== 'running' || input.paused) {
  return state;
}
```

Esse bloco é o coração da pausa. Quando o jogo tá parado, nada avança sem querer.

## Renderização

O PixiJS tem a responsabilidade de:

- montar o canvas e as texturas;
- desenhar água, ilhas, navios e projéteis;
- atualizar barras de vida e efeitos de impacto;
- limpar recursos ao sair da partida ou reiniciar.

A parte importante aqui é que o render da arena fica separada da UI React. Isso evita o clássico “React refaz a página inteira a cada frame” que mata performance.

## Input

A camada de input junta teclado, toque e estado de pausa:

- `turnLeft`, `turnRight`, `thrust` e disparos;
- `normalizeInputState` centraliza a validação;
- `toSimulationInput` transformam os valores no formato da simulação.

Pausa por teclado, foco perdido ou aba escondida entram na mesma regra. Sem truque, sem avanço de cronômetro “por acidente”.

## Persistência e UI

A interface salva algumas coisas no `localStorage`:

- opções do usuário;
- último resultado;
- estado pendente do ranking/histórico;
- cenário de rede ativo.

O outbox continua tentando registrar o resultado mesmo com falha da API. Quando a conexão volta, ele tenta de novo sem duplicar a entrada no ranking.

## Ranking, histórico e MSW

A API define contratos para ranking, histórico e registro da partida. O MSW simula:

- sucesso;
- timeout;
- latência;
- páginas vazias;
- falhas de rede e recuperação.

Quando tudo fecha certinho, o `queryClient.invalidateQueries` atualiza as abas sem deixar dados velhos sujando a tela.

## Testes e instrumentação

No modo `?test=1`, a app expõe `window.__game` para o Playwright. Isso deixa o teste bem decente:

- inicia partida com seed determinístico;
- lê o estado real do jogo;
- dispara inputs do combate;
- valida pausa, retomada e ciclo de vida sem depender de DOM fake.

Ou seja: o teste clica no jogo de verdade, não em um mock de mentira.

## Performance

A arquitetura já tenta não gastar energia atoa:

- o estado do jogo fica fora do React;
- o HUD usa snapshot em baixa frequência;
- sprites e texturas são reaproveitados;
- listeners e recursos são limpos ao sair da partida.

O perfil de performance fica em [docs/performance-profile.md](docs/performance-profile.md). A intenção é medir em ambiente de referência e documentar tudo em `reports/` sem “achismo”.

## Limitações honestas

- os assets tem identidade visual boa, mas a licença por arquivo não ficou documentada no repositório;
- o projeto tá focado em gameplay e avaliação, não em distribuição final com compliance completa;
- FPS e memória variam bastante de hardware e browser.

## Conclusão

O projeto chegou num ponto bem sólido: gameplay funcional, UI com cara de jogo, mocks e testes, benchmark documentado e arquitetura clara.

O que ainda fica como observação importante é que a métrica de performance atual foi medida em Chromium headless, e aí o desempenho cai bastante em relação ao alvo de 60 FPS do desafio. Isso não é desculpa; é um diagnóstico real do ambiente. Para fechar de verdade, a próxima validação tem que ser em ambiente de referência real, sem headless, e com registro de hardware/resolução/browser no relatório final.
