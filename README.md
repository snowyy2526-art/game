# Entre as Árvores

Jogo de terror e sobrevivência em primeira pessoa, em português. Uma floresta procedural, uma cabana e cinco dias e noites para sobreviver. Todos os modelos, texturas e sons são gerados localmente, sem serviços externos nem chaves de API.

## Executar

Requer Node.js 22.12+; Node 24 é recomendado e foi usado na validação.

```sh
npm ci
npm run dev
```

Abra o endereço apresentado pelo Vite em um navegador com WebGL2. Use um computador com teclado e mouse; fones ajudam a localizar as entidades. Clique em **Entrar na floresta** para capturar o mouse. `Esc` libera o mouse e pausa. Há renderização simplificada automática para GPUs por software.

## Jogar sem servidor ou prévia web

```sh
npm run export
```

O comando gera **`dist/Entre-as-Arvores.html`**, um arquivo independente com todo o jogo, estilos, modelos e sons. Baixe esse arquivo e abra-o com dois cliques no Chrome, Edge ou Firefox de um computador com teclado, mouse e WebGL2 habilitado. Não é necessário instalar Node no computador que vai jogar, iniciar um servidor ou conectar serviços externos. O arquivo também funciona sem internet.

A prévia web do ambiente pode ficar indisponível quando o servidor é encerrado ou quando a plataforma não oferece encaminhamento da porta. O arquivo independente permite jogar diretamente no seu navegador sem depender dessa prévia.

Se a captura do mouse for bloqueada pela prévia, segure o botão direito e arraste para olhar, ou use as setas. O clique esquerdo e a barra de espaço continuam funcionando para atacar. Se WebGL2 não estiver disponível, o jogo exibe uma mensagem de compatibilidade; nesse caso, abra o arquivo em um navegador com aceleração gráfica habilitada.

## Sobreviver

Cada dia dura 3 minutos e cada noite 1 minuto e 40 segundos. O jogo termina em vitória somente ao amanhecer após a quinta noite. Você pode encerrar o período diurno antes, pelo menu de construção, estando dentro da cabana. Os menus pausam a simulação.

Durante o dia, colete madeira (troncos), sucata (caixas) e comida (cogumelos). Suprimentos reaparecem a cada amanhecer. Reforce as três entradas, fabrique lanças, alimente-se e abasteça a lareira. Você começa com alguns materiais, comida e fogo suficientes para aprender os controles.

À noite, fique dentro. Repare a entrada atacada com `R`, mantenha `B` pressionado próximo da entrada para resistir e use a lança pelos vãos. Cada lança suporta cinco ataques. O fogo consome combustível continuamente, mais depressa à noite. Uma lareira apagada por tempo demais atrai o Pesadelo.

| Controle | Ação |
| --- | --- |
| WASD | Mover |
| Mouse ou setas | Olhar; se a captura for bloqueada, segure o botão direito e arraste |
| Shift esquerdo | Correr; consome fôlego e faz barulho |
| C | Agachar e reduzir o ruído |
| E | Coletar, interagir com uma entrada ou abastecer a lareira |
| Tab | Mochila e construção |
| R | Reparar a entrada próxima; custa 2 madeiras |
| B, mantido | Segurar uma entrada de dentro da cabana |
| Clique esquerdo ou espaço | Atacar com lança |
| F | Comer |
| H | Manual com as regras das seis entidades |
| M | Silenciar / ativar áudio |
| Esc | Pausar / liberar mouse |

### Entidades

- **Andarilho:** patrulha lentamente e persegue o jogador, com passos sofridos e respiração pesada.
- **Flora Tímida:** o ruído a atrai; depois de encontrar você, aproxima-se quando não está sendo observada.
- **Impostor:** alterna entre humano ferido, objeto e criatura. Disfarces possuem detalhes errados. Aproximar-se revela a armadilha.
- **Invasor:** ataca entradas, esgota o vigor e recua para se recuperar. Lanças e resistência com o corpo ajudam a ganhar tempo.
- **Pesadelo:** aparece no breu se você deixar a lareira morrer. Reacender o fogo interrompe sua aparição.
- **Risonho:** surge em um ponto cego, ri e desaparece depois de um tempo. Olhar diretamente por 1,5 segundo é fatal.

## Verificar

```sh
npm test
npm run build
```

Os testes cobrem o ciclo completo de cinco noites, custos e restrições das receitas, alimentação, fôlego, ruído e as regras de comportamento das entidades. O build gera `dist/`; `npm run preview` serve o resultado.

Para os testes de interface, use `npm run test:browser`. O Playwright utiliza `/usr/bin/chromium` se disponível; caso contrário, execute `npx playwright install chromium` uma vez. O teste inicia seu próprio Vite, verifica menus, movimentação, coleta, construção e pausa. Na nuvem, os comandos que abrem portas ou executam o navegador precisam da permissão de execução correspondente.

Não há salvamento da partida: **Começar novamente** reinicia os cinco dias. O projeto é uma versão inicial jogável, com arte e áudio procedurais.

## Publicação no GitHub Pages

O workflow `.github/workflows/pages.yml` valida e publica o jogo quando a branch `main` recebe alterações. No GitHub, o Pages deve usar **GitHub Actions** como origem em **Settings → Pages**. A compilação usa o nome do repositório como caminho base, para que os arquivos carreguem corretamente no endereço do projeto.

Também é possível executar o workflow manualmente pela aba **Actions**. A existência do workflow ou um envio ao GitHub não confirma uma publicação bem-sucedida: confira o resultado do deploy antes de divulgar o endereço.
