# Slime Renascido

Jogo de mundo aberto 3D, inspirado em Tensura (*That Time I Got Reincarnated as a Slime*), que roda no navegador, inclusive no iPhone.

## Como jogar

- **Andar:** arraste o dedo no lado esquerdo da tela.
- **Girar a câmera:** arraste no lado direito.
- **ATACAR:** o slime dá uma investida. Na forma de lobo ele morde, e na forma humana usa a espada.
- **PREDADOR:** absorve corpos de monstros, Ervas Luminosas, Minério Mágico e água. Cada espécie nova vira uma habilidade.
- **Habilidades (1, 2 e 3):** aparecem conforme você absorve as espécies. Escolha qual fica em cada botão em Menu > Habilidades.
- **EVOLUIR:** o botão aparece quando os requisitos são cumpridos. Veja em Menu > Evolução.
- **FALAR:** aparece perto do Dragão Selado e do Ancião Goblin.
- **Minimapa:** toque para abrir o mapa grande. O losango dourado marca o objetivo.

No computador: WASD para andar, Espaço para pular, J para atacar, K para o Predador, 1 a 3 para as habilidades, E para falar, Q para a poção, F para trocar de forma e M para o menu.

## Mecânicas

| Sistema | Como funciona |
|---|---|
| Predador | Absorver uma espécie pela primeira vez dá a habilidade dela: Aranha → Fio de Aço, Lobo → Faro Aguçado, Morcego → Asas (pulo duplo e planar), Serpente → Veneno Corrosivo, Lagarto → Pele Blindada, Ogro → Força Bruta, Lobo Alfa → Mimetismo de Lobo, Ogro Chefe → Chama Negra, Água → Lâmina d'Água |
| Grande Sábio | A voz que avisa tudo: análises, habilidades, missões e perigos |
| Síntese | 2 ervas viram 1 Poção de Cura. 4 minérios viram 1 Cristal Mágico (+5 de PM máximo) |
| Evolução | Slime → Slime Superior → Slime Arcano → Slime Demoníaco (libera a forma humana) → Lorde Demônio |
| Nomear | Dar nome a um goblin custa PM. Ele vira Hobgoblin e luta ao seu lado (até 4). A vila cresce conforme você nomeia |
| Dia e noite | Um dia dura 12 minutos. À noite, os monstros enxergam mais longe |

O progresso é salvo sozinho no navegador a cada 15 segundos.

## Modelos do Meshy

Já vieram do Meshy: lobo (o Lobo Alfa usa o mesmo modelo, maior e mais escuro), aranha, serpente, morcego, goblin (o ancião usa o goblin com um cajado), hobgoblin, dragão, pinheiro, pedra e cabana. O resto continua feito por código. A árvore redonda saiu quebrada e foi descartada (veja `ferramentas/meshy-modelos.json`).

Os originais ficam em `ferramentas/brutos/` (fora do git). O script reduz as texturas para webp antes de colocar no jogo.

Para gerar mais:

```bash
export MESHY_API_KEY=msy_...                        # nunca coloque a chave no código
cd ferramentas && npm install
node meshy.mjs saldo
node meshy.mjs gerar --prioridade 1                 # só mostra o custo estimado
node meshy.mjs gerar --prioridade 1 --confirmar     # gera e salva em jogo/modelos/
```

O jogo lê `jogo/modelos/manifest.json` e usa um `.glb` no lugar do modelo feito por código quando ele existir.

## Estrutura

- `jogo/index.html`: página, estilos e HUD
- `jogo/js/data.js`: habilidades, monstros, evoluções e missões (ajuste o balanceamento aqui)
- `jogo/js/world.js`: terreno, biomas, árvores, céu e ciclo de dia e noite
- `jogo/js/models.js`: modelos low-poly e o carregador de GLB
- `jogo/js/game.js`: jogador, combate, Predador, evolução, aliados, missões e save
- `jogo/js/ui.js`, `input.js`, `audio.js`: interface, controles de toque e sons
- `ferramentas/build-artifact.mjs`: junta tudo num arquivo só para publicar
