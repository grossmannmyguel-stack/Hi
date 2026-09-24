// Dados do jogo: habilidades, monstros, evoluções, missões e pontos de spawn.

export const WATER_Y = 0;

// type: 'ativa' usa MP e fica na barra de atalhos; 'passiva' é sempre ligada; 'forma' libera Mimetismo.
export const SKILLS = {
  predador: { nome: 'Predador', type: 'unica', desc: 'Absorve monstros derrotados, plantas, minérios e até água. Cada espécie nova é analisada e vira habilidade.' },
  sabio: { nome: 'Grande Sábio', type: 'unica', desc: 'Uma voz interior que analisa tudo e avisa sobre o que acontece com você.' },
  protecaoDragao: { nome: 'Proteção do Dragão', type: 'passiva', desc: '+20% de HP máximo. Um presente do Dragão Selado.' },
  laminaAgua: { nome: "Lâmina d'Água", type: 'ativa', mp: 6, cd: 0.7, desc: 'Dispara uma lâmina de água pressurizada.', cor: 0x6fd3ff },
  fioAco: { nome: 'Fio de Aço', type: 'ativa', mp: 5, cd: 2.2, desc: 'Lança um fio pegajoso que prende e causa dano.', cor: 0xe8e8f0 },
  venenoCorrosivo: { nome: 'Veneno Corrosivo', type: 'ativa', mp: 12, cd: 3.5, desc: 'Sopro venenoso em cone que causa dano contínuo.', cor: 0x8cf05a },
  chamaNegra: { nome: 'Chama Negra', type: 'ativa', mp: 24, cd: 7, desc: 'Explosão de fogo negro ao redor do corpo.', cor: 0x9a4dff },
  faro: { nome: 'Faro Aguçado', type: 'passiva', desc: 'Mostra inimigos no minimapa e dá +10% de velocidade.' },
  asas: { nome: 'Asas de Morcego', type: 'passiva', desc: 'Pulo duplo. Segure PULAR no ar para planar.' },
  peleBlindada: { nome: 'Pele Blindada', type: 'passiva', desc: '+40% de defesa.' },
  forcaBruta: { nome: 'Força Bruta', type: 'passiva', desc: '+15% de ataque.' },
  mimetismoLobo: { nome: 'Mimetismo: Lobo', type: 'forma', forma: 'lobo', desc: 'Assume a forma do Lobo Alfa. Mais rápido e morde forte.' },
  mimetismoHumano: { nome: 'Mimetismo: Humano', type: 'forma', forma: 'humano', desc: 'Assume uma forma humana com espada.' },
};

export const MONSTERS = {
  aranha: { nome: 'Aranha Gigante', hp: 45, atk: 8, def: 1, spd: 4.2, xp: 18, reach: 2.0, aggro: 11, skill: 'fioAco', size: 1.1 },
  lobo: { nome: 'Lobo Sombrio', hp: 60, atk: 10, def: 2, spd: 6.6, xp: 25, reach: 2.2, aggro: 17, skill: 'faro', size: 1 },
  morcego: { nome: 'Morcego Gigante', hp: 32, atk: 7, def: 0, spd: 5.5, xp: 16, reach: 2.2, aggro: 15, skill: 'asas', size: 1, voa: true },
  serpente: { nome: 'Serpente Negra', hp: 85, atk: 13, def: 3, spd: 4.2, xp: 38, reach: 2.6, aggro: 11, skill: 'venenoCorrosivo', size: 1.2 },
  lagarto: { nome: 'Lagarto Blindado', hp: 130, atk: 15, def: 9, spd: 3.6, xp: 55, reach: 2.6, aggro: 9, skill: 'peleBlindada', size: 1.2 },
  ogro: { nome: 'Ogro', hp: 190, atk: 20, def: 6, spd: 3.8, xp: 90, reach: 3.2, aggro: 15, skill: 'forcaBruta', size: 1 },
  loboAlfa: { nome: 'Lobo Alfa', hp: 380, atk: 18, def: 5, spd: 7.2, xp: 220, reach: 3.2, aggro: 22, skill: 'mimetismoLobo', size: 1.7, chefe: true },
  ogroChefe: { nome: 'Ogro Chefe', hp: 900, atk: 30, def: 10, spd: 4, xp: 600, reach: 4.2, aggro: 22, skill: 'chamaNegra', size: 1.45, chefe: true },
};

// Espécies que contam para as evoluções.
export const SPECIES = ['aranha', 'lobo', 'morcego', 'serpente', 'lagarto', 'ogro', 'loboAlfa', 'ogroChefe'];

export const STAGES = [
  { nome: 'Slime', cor: 0x4fb6ff, size: 0.7, hp: 60, mp: 40, atk: 8, def: 2, spd: 7 },
  { nome: 'Slime Superior', cor: 0x5fe0ff, size: 0.85, hp: 110, mp: 75, atk: 13, def: 4, spd: 7.6, req: { lvl: 4, especies: 2 } },
  { nome: 'Slime Arcano', cor: 0x7d8bff, size: 0.95, hp: 170, mp: 130, atk: 19, def: 6, spd: 8.2, req: { lvl: 9, especies: 4 } },
  { nome: 'Slime Demoníaco', cor: 0x3448c8, size: 1.05, hp: 260, mp: 200, atk: 28, def: 10, spd: 8.8, req: { lvl: 14, chefe: 'ogroChefe' } },
  { nome: 'Lorde Demônio', cor: 0x9ad8ff, size: 1.15, hp: 400, mp: 320, atk: 40, def: 15, spd: 9.6, req: { lvl: 19, especies: 7 } },
];

export const xpNext = (lvl) => Math.floor(25 * Math.pow(lvl, 1.5));

// Missões em sequência. evt é o evento que conta progresso.
export const QUESTS = [
  { id: 'dragao', titulo: 'Uma Voz na Escuridão', desc: 'Algo enorme dorme no fundo da gruta. Chegue perto e fale com ele.', evt: 'falar:dragao', n: 1, alvo: 'dragao', xp: 20 },
  { id: 'ervas', titulo: 'Predador', desc: 'Absorva 3 Ervas Luminosas da gruta. Chegue perto e toque em PREDADOR.', evt: 'absorver:erva', n: 3, alvo: 'erva', xp: 30 },
  { id: 'sair', titulo: 'O Mundo Lá Fora', desc: 'Saia da gruta pela passagem ao norte.', evt: 'regiao:floresta', n: 1, alvo: 'saida', xp: 20 },
  { id: 'caca', titulo: 'Primeira Caçada', desc: 'Derrote um monstro da floresta e absorva o corpo com PREDADOR.', evt: 'absorverMonstro:any', n: 1, xp: 40 },
  { id: 'vila', titulo: 'Fumaça a Oeste', desc: 'Siga a fumaça até a Vila Goblin, a oeste, e fale com o Ancião.', evt: 'falar:anciao', n: 1, alvo: 'anciao', xp: 40 },
  { id: 'lobos', titulo: 'A Matilha Sombria', desc: 'Os lobos ameaçam a vila. Derrote 5 Lobos Sombrios na floresta a leste.', evt: 'matar:lobo', n: 5, alvo: 'lobos', xp: 120 },
  { id: 'alfa', titulo: 'O Lobo Alfa', desc: 'Derrote o Lobo Alfa no Covil da Matilha, a leste.', evt: 'matar:loboAlfa', n: 1, alvo: 'covil', xp: 200 },
  { id: 'nomes', titulo: 'O Peso de um Nome', desc: 'Volte ao Ancião e dê nome a pelo menos um goblin. Nomear custa PM.', evt: 'nomear', n: 1, alvo: 'anciao', xp: 100 },
  { id: 'evolucao', titulo: 'Evolução', desc: 'Fique mais forte e alcance a forma Slime Arcano. Absorva espécies diferentes.', evt: 'evoluir:2', n: 1, xp: 150 },
  { id: 'ogro', titulo: 'Ameaça nas Montanhas', desc: 'Derrote o Ogro Chefe no Acampamento Ogro, nas montanhas ao norte.', evt: 'matar:ogroChefe', n: 1, alvo: 'acampamento', xp: 500 },
  { id: 'lorde', titulo: 'Lorde Demônio', desc: 'Alcance a evolução final. Precisa do nível 19 e de 7 espécies analisadas.', evt: 'evoluir:4', n: 1, xp: 800 },
  { id: 'livre', titulo: 'Mundo Livre', desc: 'Você venceu a história! Absorva todas as espécies e dê nome a todos os goblins.', evt: 'nunca', n: 1, xp: 0 },
];

// Regiões do mapa (centro e raio). Fora delas é a Floresta Selvagem.
export const REGIONS = [
  { id: 'gruta', nome: 'Gruta do Selo', x: 0, z: 172, r: 36 },
  { id: 'vila', nome: 'Vila Goblin', x: -95, z: -30, r: 24 },
  { id: 'lago', nome: 'Lago Cristalino', x: -150, z: 110, r: 58 },
  { id: 'covil', nome: 'Covil da Matilha', x: 120, z: -70, r: 26 },
  { id: 'acampamento', nome: 'Acampamento Ogro', x: 70, z: -165, r: 24 },
  { id: 'montanhas', nome: 'Montes Dentados', x: 0, z: -190, r: 80 },
  { id: 'planicie', nome: 'Planícies do Leste', x: 155, z: 95, r: 70 },
];

export const PLACES = {
  inicio: { x: 0, z: 170 },
  dragao: { x: 0, z: 196 },
  saida: { x: 0, z: 128 },
  anciao: { x: -95, z: -34 },
  covil: { x: 120, z: -70 },
  acampamento: { x: 70, z: -165 },
  lobos: { x: 60, z: -10 },
};

// Grupos de monstros: tipo, centro, raio, quantidade.
export const SPAWNS = [
  { t: 'aranha', x: 10, z: 95, r: 14, n: 2 },
  { t: 'aranha', x: -35, z: 60, r: 16, n: 3 },
  { t: 'aranha', x: 40, z: 30, r: 16, n: 3 },
  { t: 'aranha', x: -60, z: 10, r: 14, n: 2 },
  { t: 'lobo', x: 60, z: -10, r: 18, n: 4 },
  { t: 'lobo', x: 85, z: -45, r: 16, n: 3 },
  { t: 'lobo', x: 30, z: -60, r: 16, n: 3 },
  { t: 'lobo', x: 120, z: -70, r: 12, n: 3 },
  { t: 'loboAlfa', x: 128, z: -78, r: 2, n: 1 },
  { t: 'serpente', x: -110, z: 70, r: 12, n: 2 },
  { t: 'serpente', x: -175, z: 160, r: 14, n: 2 },
  { t: 'serpente', x: -200, z: 80, r: 12, n: 2 },
  { t: 'lagarto', x: 140, z: 70, r: 18, n: 2 },
  { t: 'lagarto', x: 175, z: 130, r: 18, n: 2 },
  { t: 'lagarto', x: 115, z: 150, r: 16, n: 2 },
  { t: 'morcego', x: -50, z: -150, r: 16, n: 3 },
  { t: 'morcego', x: 20, z: -200, r: 16, n: 3 },
  { t: 'morcego', x: -100, z: -175, r: 16, n: 3 },
  { t: 'ogro', x: 60, z: -155, r: 12, n: 2 },
  { t: 'ogroChefe', x: 76, z: -172, r: 2, n: 1 },
];

export const GOBLIN_NAMES = ['Buro', 'Rugo', 'Kobu', 'Mina', 'Zeno', 'Tari', 'Haru', 'Doro', 'Suki', 'Garu'];
export const NAME_COST = 15;
