# Checklist de profiling

## Métricas obrigatórias

- FPS médio e mínimo
- p95 de frame time
- contagem de entidades por 3 minutos
- memória total após 5 ciclos

## Passo a passo

1. Abrir `http://127.0.0.1:5173/?test=1`
2. Abrir DevTools → Performance
3. Registrar 3 minutos da partida ativa
4. Coletar amostras de memória em 5 ciclos
5. Salvar o relatório em markdown no diretório `reports/`

## Resultado esperado

- taxa de quadros próxima de 60 FPS;
- p95 de frame time abaixo de 16,7 ms;
- crescimento de memória controlado e sem vazamentos evidentes;
- entidades estáveis dentro da faixa esperada para a sessão ativa.
