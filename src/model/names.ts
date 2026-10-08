/**
 * names.ts — a factory part code, turned into a name a person can read.
 *
 * CAD exporters write codes like GFW00_3H_NB_ID_HINGE_PLATE_R_1: a vendor
 * prefix, a project code, then the words that matter, often abbreviated. This
 * drops the codes, expands the abbreviations and orders the words the way the
 * reading language orders them. Nothing is guessed: a word the tables do not
 * know is kept as it is written, and a code with no word left in it returns ''
 * so the caller keeps the raw code instead of inventing a name.
 *
 * English stacks modifiers before the noun (« hinge plate »); French and
 * Spanish put the noun first and hang the rest on « de » (« plaque de
 * charnière », « placa de bisagra »). The last noun of the code is the part
 * itself, the one before it says what it belongs to, anything earlier says
 * where it sits.
 */
export type NameLang = 'en' | 'fr' | 'es';

type Table = {
  /** Lettered laptop shells: A lid, B bezel, C keyboard deck, D bottom. */
  shells: Record<'A' | 'B' | 'C' | 'D', string>;
  words: Record<string, string>;
  key: string;
};

const TABLES: Record<NameLang, Table> = {
  en: {
    shells: {A: 'Lid cover', B: 'Screen bezel', C: 'Palm rest and keyboard deck', D: 'Bottom cover'},
    key: 'keyboard key',
    words: {
      HINGE: 'hinge', PLATE: 'plate', BRK: 'bracket', BRACKET: 'bracket', SUP: 'support', BASE: 'base',
      AXIS: 'axle', RIVET: 'rivet', CAP: 'cap', LENS: 'lens', SWITCH: 'switch', FRAME: 'frame',
      LOGO: 'logo', LCD: 'screen', DISPLAY: 'screen', CAM: 'camera', CAMERA: 'camera', MIC: 'microphone',
      ALS: 'light sensor', LED: 'indicator light', CARD: 'card', KEYBOARD: 'keyboard key',
      BEZEL: 'screen bezel', COVER: 'cover', BATTERY: 'battery', FAN: 'fan', SCREW: 'screw',
      SPEAKER: 'speaker', TOUCHPAD: 'touchpad', MAINBOARD: 'mainboard', CABLE: 'cable',
      R: 'right', L: 'left', LH: 'left', RH: 'right', TOP: 'top', BOT: 'bottom', BOTTOM: 'bottom',
    },
  },
  fr: {
    shells: {A: 'Capot de l\'écran', B: 'Contour de l\'écran', C: 'Repose-poignets et clavier', D: 'Coque du dessous'},
    key: 'touche du clavier',
    words: {
      HINGE: 'charnière', PLATE: 'plaque', BRK: 'support', BRACKET: 'support', SUP: 'support', BASE: 'base',
      AXIS: 'axe', RIVET: 'rivet', CAP: 'cache', LENS: 'lentille', SWITCH: 'interrupteur', FRAME: 'cadre',
      LOGO: 'logo', LCD: 'écran', DISPLAY: 'écran', CAM: 'caméra', CAMERA: 'caméra', MIC: 'micro',
      ALS: 'capteur de luminosité', LED: 'voyant', CARD: 'carte', KEYBOARD: 'touche du clavier',
      BEZEL: 'contour de l\'écran', COVER: 'capot', BATTERY: 'batterie', FAN: 'ventilateur', SCREW: 'vis',
      SPEAKER: 'haut-parleur', TOUCHPAD: 'pavé tactile', MAINBOARD: 'carte mère', CABLE: 'câble',
      R: 'droite', L: 'gauche', LH: 'gauche', RH: 'droite', TOP: 'haut', BOT: 'bas', BOTTOM: 'bas',
    },
  },
  es: {
    shells: {A: 'Tapa de la pantalla', B: 'Marco de la pantalla', C: 'Reposamuñecas y teclado', D: 'Carcasa inferior'},
    key: 'tecla del teclado',
    words: {
      HINGE: 'bisagra', PLATE: 'placa', BRK: 'soporte', BRACKET: 'soporte', SUP: 'soporte', BASE: 'base',
      AXIS: 'eje', RIVET: 'remache', CAP: 'tapa', LENS: 'lente', SWITCH: 'interruptor', FRAME: 'marco',
      LOGO: 'logotipo', LCD: 'pantalla', DISPLAY: 'pantalla', CAM: 'cámara', CAMERA: 'cámara', MIC: 'micrófono',
      ALS: 'sensor de luz', LED: 'indicador', CARD: 'tarjeta', KEYBOARD: 'tecla del teclado',
      BEZEL: 'marco de la pantalla', COVER: 'tapa', BATTERY: 'batería', FAN: 'ventilador', SCREW: 'tornillo',
      SPEAKER: 'altavoz', TOUCHPAD: 'panel táctil', MAINBOARD: 'placa base', CABLE: 'cable',
      R: 'derecha', L: 'izquierda', LH: 'izquierda', RH: 'derecha', TOP: 'arriba', BOT: 'abajo', BOTTOM: 'abajo',
    },
  },
};

/** Port and standard names: they label a noun without « de » and never translate. */
const TAGS: Record<string, string> = {USBA: 'USB-A', USBC: 'USB-C', HDMI: 'HDMI', SD: 'SD', DP: 'DisplayPort'};
/** Which side: placed after the whole noun group. */
const SIDES = new Set(['R', 'L', 'LH', 'RH', 'TOP', 'BOT', 'BOTTOM']);
/** Tokens that carry no meaning for a reader: assembly markers, layout variants, drawing references, the maker's own name. */
const NOISE = new Set(['FRAMEWORK', 'ID', 'NB', 'ASM', 'ASSY', 'REFER', 'ALL', 'ANSI', 'ISO', 'MAIN', 'LOG', 'PRT', 'PART', 'PARTS']);
/** Placeholders exporters write when the author gave no name (body_3, Mesh.042, prt_1_SOLIDS_1). */
const GENERIC = new Set(['BODY', 'MESH', 'OBJECT', 'NODE', 'SOLID', 'SOLIDS', 'INSTANCE', 'GROUP', 'DEFAULT', 'UNTITLED', 'SHAPE', 'PRIMITIVE']);
/** A code: letters glued to digits (GFW00, 3H, V5, 0703). */
const CODE = /^(?=.*\d)[A-Z0-9]+$/;

function capitalize(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

/** The French and Spanish « de », elided before a vowel in French only. */
function joinOf(lang: NameLang, head: string, owner: string): string {
  if (lang === 'fr') return head + (/^[aeiouyéèêh]/i.test(owner) ? " d'" : ' de ') + owner;
  return `${head} de ${owner}`;
}

export function readableName(raw: string, lang: NameLang): string {
  const table = TABLES[lang];
  const tokens = raw.toUpperCase().split(/[\s_\-.]+/).filter(Boolean);
  // « C_COVER » or « COVER_A »: a lettered laptop shell.
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] !== 'COVER') continue;
    const letter = [tokens[i - 1], tokens[i + 1]].find((t): t is keyof Table['shells'] => !!t && t in table.shells);
    if (letter) return table.shells[letter];
  }
  const nouns: string[] = [];
  const tags: string[] = [];
  const sides: string[] = [];
  let index = '';
  for (const t of tokens) {
    if (/^\d+$/.test(t)) { index = t; continue; }
    if (CODE.test(t) || NOISE.has(t)) continue;
    if (GENERIC.has(t)) continue;
    if (TAGS[t]) tags.push(TAGS[t]);
    else if (SIDES.has(t)) sides.push(table.words[t]);
    else nouns.push(table.words[t] ?? t.toLowerCase());
  }
  if (!nouns.length && !tags.length) return '';

  let name: string;
  if (!nouns.length) {
    name = tags.join(' ');
  } else if (lang === 'en') {
    // English keeps the code's own order: « right hinge plate », « USB-C card ».
    name = [...sides, ...tags, ...nouns].join(' ');
  } else {
    const head = nouns[nouns.length - 1];
    const owner = nouns[nouns.length - 2];
    const place = nouns.slice(0, -2);
    name = [head, ...tags].join(' ');
    if (owner) name = joinOf(lang, name, owner);
    if (sides.length) name += ' ' + sides.join(' ');
    if (place.length) name += ` (${place.join(', ')})`;
  }
  // Keys keep their number, so 80 keys stay 80 names.
  if (nouns[nouns.length - 1] === table.key && index) name += ` ${index}`;
  return capitalize(name);
}
