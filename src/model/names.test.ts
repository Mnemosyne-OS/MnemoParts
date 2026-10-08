import { describe, expect, it } from 'vitest';
import { readableName } from './names';

// Codes read from the Framework Laptop 13 STEP (CC BY 4.0) and the Khronos glTF samples.
describe('readableName', () => {
  it.each([
    ['GFW00_3H_NB_ID_HINGE_PLATE_R_1', 'Plaque de charnière droite'],
    ['GFW00_3H_NB_ID_USBC_CARD_1', 'Carte USB-C'],
    ['GFW00_3H_NB_ID_C_COVER_REFER_2', 'Repose-poignets et clavier'],
    ['GFW_NB_ID_COVER_A', "Capot de l'écran"],
    ['GFW00_3H_NB_ID_BEZEL_CAM_LENS_1', "Lentille de caméra (contour de l'écran)"],
    ['GFW30_HINGE_R_AXIS_0703', 'Axe de charnière droite'],
    ['GFW00_3H_NB_ID_BEZEL_ALS_LENS_1', "Lentille de capteur de luminosité (contour de l'écran)"],
    ['FRAMEWORK_ID_KEYBOARD_ANSI_V5_12', 'Touche du clavier 12'],
    ['Lifter_123-923_0_Parts_1', 'Lifter'],
  ])('fr: %s -> %s', (raw, name) => expect(readableName(raw, 'fr')).toBe(name));

  it.each([
    ['GFW00_3H_NB_ID_HINGE_PLATE_R_1', 'Right hinge plate'],
    ['GFW00_3H_NB_ID_USBC_CARD_1', 'USB-C card'],
    ['GFW00_3H_NB_ID_D_COVER_REFER_3', 'Bottom cover'],
    ['FRAMEWORK_ID_KEYBOARD_ANSI_V5_12', 'Keyboard key 12'],
  ])('en: %s -> %s', (raw, name) => expect(readableName(raw, 'en')).toBe(name));

  it.each([
    ['GFW00_3H_NB_ID_HINGE_PLATE_R_1', 'Placa de bisagra derecha'],
    ['GFW00_3H_NB_ID_USBC_CARD_1', 'Tarjeta USB-C'],
    ['GFW00_3H_NB_ID_BEZEL_CAM_LENS_1', 'Lente de cámara (marco de la pantalla)'],
    // Spanish never elides « de »: only French does.
    ['GFW30_HINGE_R_AXIS_0703', 'Eje de bisagra derecha'],
  ])('es: %s -> %s', (raw, name) => expect(readableName(raw, 'es')).toBe(name));

  it('elides « de » before a vowel in French', () => {
    expect(readableName('FRAME_AXIS', 'fr')).toBe('Axe de cadre');
    expect(readableName('AXIS_SWITCH', 'fr')).toBe("Interrupteur d'axe");
  });

  it('returns nothing when only codes or placeholders are left, so the caller keeps the raw code', () => {
    for (const raw of ['GFW00_3H_ASM_1', 'Mesh.042', 'body_instance_0', 'body_3', 'prt_1_12_SOLIDS_1_2', '']) {
      expect(readableName(raw, 'fr')).toBe('');
    }
  });

  it('keeps a word the tables do not know, as written, instead of guessing', () => {
    expect(readableName('GEARBOX_HOUSING', 'en')).toBe('Gearbox housing');
  });
});
