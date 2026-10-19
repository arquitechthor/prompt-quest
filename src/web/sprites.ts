// Pixel art 8 bits dibujado en código: cada sprite es una matriz de 16×16 caracteres que indexan una paleta.
// Sin imágenes externas: pesa unos pocos KB y el color del elemento sale de cambiar la paleta.
import type { ClassId, ElementId, ItemType } from '../engine/types';

export const PX = 16; // píxeles por casilla en el mundo de baja resolución

/** Paleta fija (inspirada en PICO-8). Las letras c/C/l dependen del elemento. */
const BASE: Record<string, string> = {
  o: '#1a1c2c', // contorno
  k: '#ffccaa', // piel
  K: '#d9906a', // piel en sombra
  m: '#c2c3c7', // metal claro
  M: '#6b6f7a', // metal oscuro
  w: '#ab5236', // madera / cuero
  W: '#5c3524', // madera oscura
  y: '#c9894a', // cuero claro
  g: '#ffec27', // oro
  s: '#fff1e8', // blanco
  r: '#ff004d', // rojo
  R: '#9e1438', // rojo oscuro
  u: '#3a5fcd', // azul del escudo
  p: '#a25cff', // orbe
  P: '#5b2bb5', // orbe en sombra
  b: '#29233a', // traje ninja
  B: '#12101c', // traje ninja en sombra
};

export const EL_PAL: Record<ElementId, { c: string; C: string; l: string }> = {
  fire: { c: '#e43b44', C: '#8f1f2c', l: '#ffa300' },
  water: { c: '#29adff', C: '#1d5fb0', l: '#a8e4ff' },
  earth: { c: '#3fa34d', C: '#1e6b3a', l: '#a5e05c' },
  air: { c: '#d8e2f0', C: '#8b9bb4', l: '#ffffff' },
};

// Todos miran a la derecha; el renderizador los voltea cuando se mueven a la izquierda.
const CLASS_ART: Record<ClassId, string[]> = {
  // Capucha, arco con cuerda y carcaj a la espalda
  archer: [
    '................',
    '.....ooooo...w..',
    '.s..occccco..sw.',
    'sr.occccccco.sw.',
    'Wy.occkkkkko.s.w',
    'Wy.ocCkkkoko.s.w',
    'Wy.ocCkkKkko.s.w',
    'WyoCcccccckkkkkw',
    'WyoCcclccco..s.w',
    'WyoCcclccco..s.w',
    'Wy.oyygyyyo..sw.',
    '...oCccccCo..sw.',
    '....oWWoWWo..w..',
    '....oWWoWWo.....',
    '....oyyoyyo.....',
    '....ooo.ooo.....',
  ],
  // Casco con cresta, espada en alto y escudo del color del elemento
  warrior: [
    '......rrr.......',
    '.....orrro...m..',
    '....ommmmmo..mM.',
    '....ommmmmmo.mM.',
    '....oMkkkkko.mM.',
    '....oMkkkoko.mM.',
    '....oMMkkkMo.mM.',
    '.ooooocmmco.ggg.',
    'occcoCcmmckkkk..',
    'ocgcoCcmmco.....',
    'occcoCcccco.....',
    '.ocoyyygyyo.....',
    '..o.oCcccCo.....',
    '....oMMoMMo.....',
    '....oMMoMMo.....',
    '....ooo.ooo.....',
  ],
  // Traje negro, máscara con rendija y cinta al viento; shuriken en la mano
  ninja: [
    '................',
    '.....oooooo.....',
    '....obbbbbbo....',
    '..cocccccccco...',
    '.c..obkkokoo....',
    'c...obbbbbbo....',
    '....obbbbbbo..m.',
    '...obbbbbbbkkmMm',
    '...obBbbbbBo..m.',
    '...obbccccbo....',
    '....obbbbbo.....',
    '....obbobbo.....',
    '...obbo.obbo....',
    '...obo...obo....',
    '..oBBo...oBBo...',
    '..ooo.....ooo...',
  ],
  // Sombrero de ala ancha, mochila y catalejo
  explorer: [
    '................',
    '......oooo......',
    '.....oyyyyo.....',
    '.....occcco.....',
    '..oyyyyyyyyyyo..',
    '....okkkkkko....',
    '....okkkokko....',
    '....oKkkkkKo....',
    '..Wyoccllcco....',
    '..WyoccllcckkMM.',
    '..Wyoccccco.....',
    '..Wyoyygyyo.....',
    '....oWWoWWo.....',
    '....oWWoWWo.....',
    '....oMMoMMo.....',
    '....ooo.ooo.....',
  ],
};

const ITEM_ART: Record<ItemType, string[]> = {
  potion: [
    '................', '................', '................',
    '......oWWo......',
    '......owwo......',
    '......osso......',
    '.....osssso.....',
    '....osrrrrro....',
    '....orsrrrro....',
    '....orrrrrro....',
    '....oRrrrrRo....',
    '.....oRRRRo.....',
    '......oooo......',
    '................', '................', '................',
  ],
  shield: [
    '................', '................',
    '...oooooooooo...',
    '...ouuuuguuuo...',
    '...ouuuuguuuo...',
    '...oggggggggo...',
    '...ouuuuguuuo...',
    '...ouuuuguuuo...',
    '....ouuuguuo....',
    '....ouuuguuo....',
    '.....ouuguo.....',
    '......ouuo......',
    '.......oo.......',
    '................', '................', '................',
  ],
  boots: [
    '................', '................', '................',
    '....ooooo.......',
    '.ss.oyyyo.......',
    'sss.oyyyo.......',
    '.ss.oyyyo.......',
    '....oWWWo.......',
    '....oyyyoooo....',
    '....oyyyyyyyo...',
    '....oyyyyyyyyo..',
    '....oWWWWWWWWo..',
    '....oooooooooo..',
    '................', '................', '................',
  ],
  sword: [
    '................',
    '......oo........',
    '.....omMo.......',
    '.....omMo.......',
    '.....omMo.......',
    '.....omMo.......',
    '.....omMo.......',
    '.....omMo.......',
    '.....omMo.......',
    '...oggggggo.....',
    '.....oWwo.......',
    '.....oWwo.......',
    '.....oggo.......',
    '......oo........',
    '................', '................',
  ],
  orb: [
    '................', '................', '................',
    '.....oooooo.....',
    '....oppppppo....',
    '...opsspppppo...',
    '...opsppppppo...',
    '...opppppppPo...',
    '...opppppppPo...',
    '...oppppppPPo...',
    '....opppPPPo....',
    '.....oooooo.....',
    '....oMMMMMMo....',
    '....oooooooo....',
    '................', '................',
  ],
  treasure: [
    '................', '................', '................',
    '.....g.gg.......',
    '...oooooooooo...',
    '...owwwwwwwwo...',
    '..owwwwwwwwwwo..',
    '..oggggggggggo..',
    '..oWWWWggWWWWo..',
    '..owwwwggwwwwo..',
    '..owwwwwwwwwwo..',
    '..oggggggggggo..',
    '..oooooooooooo..',
    '................', '................', '................',
  ],
};

// Pequeños sprites de efectos
const MISC_ART: Record<string, string[]> = {
  tomb: [
    '................', '................', '................', '................',
    '......oooo......',
    '.....ommmmo.....',
    '....ommMmmmo....',
    '....omMMMmmo....',
    '....ommMmmmo....',
    '....ommMmmmo....',
    '....ommmmmmo....',
    '....oMMMMMMo....',
    '...oooooooooo...',
    '................', '................', '................',
  ],
  flame: [
    '.......o........',
    '......oro.......',
    '.....orgro......',
    '.....orggro.....',
    '......oooo......',
  ],
  arrow: [
    'sr........',
    '.swwwwwwmm',
    'sr........',
  ],
};

// Validación en tiempo de carga: un error de dibujo debe saltar en desarrollo, no verse raro en el evento.
for (const set of [CLASS_ART, ITEM_ART, MISC_ART] as Record<string, string[]>[]) {
  for (const [k, rows] of Object.entries(set)) {
    const w = rows[0].length;
    for (const row of rows) if (row.length !== w) throw new Error(`Sprite ${k}: fila de ${row.length} en lugar de ${w}`);
  }
}

export type Art = string[];
export const ART = { cls: CLASS_ART, item: ITEM_ART, misc: MISC_ART };

/** Color RGBA de un carácter, o null si es transparente. Sirve también para scripts sin DOM. */
export function pixelColor(ch: string, el?: ElementId): string | null {
  if (ch === '.') return null;
  if ((ch === 'c' || ch === 'C' || ch === 'l') && el) return EL_PAL[el][ch];
  return BASE[ch] ?? (ch === 'c' ? '#888' : ch === 'C' ? '#555' : ch === 'l' ? '#bbb' : '#f0f');
}

// ----------------------------------------------------------------------------- caché de canvas (solo navegador)

const cache = new Map<string, HTMLCanvasElement>();

function paint(art: Art, el?: ElementId, mode: 'normal' | 'white' | 'flip' = 'normal'): HTMLCanvasElement {
  const h = art.length, w = art[0].length;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const col = pixelColor(art[y][x], el);
      if (!col) continue;
      g.fillStyle = mode === 'white' ? '#ffffff' : col;
      g.fillRect(mode === 'flip' ? w - 1 - x : x, y, 1, 1);
    }
  }
  return c;
}

function cached(key: string, make: () => HTMLCanvasElement) {
  let c = cache.get(key);
  if (!c) cache.set(key, (c = make()));
  return c;
}

/** Sprite de un personaje. flip = mirando a la izquierda; white = silueta blanca para el destello de impacto. */
export function classSprite(cls: ClassId, el: ElementId, flip = false, white = false) {
  return cached(`c:${cls}:${el}:${flip ? 1 : 0}:${white ? 1 : 0}`, () => {
    const base = paint(CLASS_ART[cls], el, white ? 'white' : 'normal');
    if (!flip) return base;
    const c = document.createElement('canvas');
    c.width = base.width;
    c.height = base.height;
    const g = c.getContext('2d')!;
    g.translate(base.width, 0);
    g.scale(-1, 1);
    g.drawImage(base, 0, 0);
    return c;
  });
}
export const itemSprite = (t: ItemType) => cached(`i:${t}`, () => paint(ITEM_ART[t]));
export const miscSprite = (k: keyof typeof MISC_ART) => cached(`m:${k}`, () => paint(MISC_ART[k]));

const urls = new Map<string, string>();
/** <img> pixelado para el HTML (avatares, feed). */
export function spriteImg(cls: ClassId, el: ElementId, size = 32, extra = '') {
  const key = `${cls}:${el}`;
  let url = urls.get(key);
  if (!url) urls.set(key, (url = classSprite(cls, el).toDataURL()));
  return `<img class="px" src="${url}" width="${size}" height="${size}" alt="" ${extra}>`;
}
export function itemImg(t: ItemType, size = 18) {
  const key = `i:${t}`;
  let url = urls.get(key);
  if (!url) urls.set(key, (url = itemSprite(t).toDataURL()));
  return `<img class="px" src="${url}" width="${size}" height="${size}" alt="">`;
}
