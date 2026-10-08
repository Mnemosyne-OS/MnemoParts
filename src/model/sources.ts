/**
 * sources.ts — where to find a 3D model Parts can open.
 *
 * A hand-written list, read on 2026-10-03. Each entry says what the site
 * offers, the licence its models usually carry, the formats it serves, and
 * whether its parts tend to arrive named. Licences are stated as the site
 * states them: a model's own page always wins over this summary.
 *
 * No logo is shown: logos are trademarks, and fetching them from each site
 * would tell every one of them who opened the app. Each entry gets a letter on
 * a colour instead.
 */
export type SourceLang = 'en' | 'fr' | 'es';
type Text = Record<SourceLang, string>;

export type SourceGroup = 'makers' | 'open' | 'public' | 'community' | 'test';
/** How often the parts of a model from this site arrive with names Parts can show. */
export type Naming = 'named' | 'per-file' | 'mixed' | 'one-surface';

export type Source = {
  id: string;
  name: string;
  url: string;
  group: SourceGroup;
  color: string;
  formats: string[];
  naming: Naming;
  about: Text;
  licence: Text;
};

/** The formats Parts reads. */
export const READABLE = ['step', 'stp', 'glb', 'gltf', 'obj', 'stl'];

export const SOURCES: Source[] = [
  {
    id: 'traceparts', name: 'TraceParts', url: 'https://www.traceparts.com', group: 'makers', color: '#2f6fb5',
    formats: ['STEP', 'STL', 'IGES'], naming: 'named',
    about: {
      en: 'Manufacturer catalogues: screws, bearings, cylinders, motors. A free account downloads the CAD.',
      fr: 'Catalogues de fabricants : vis, roulements, vérins, moteurs. Un compte gratuit télécharge la CAO.',
      es: 'Catálogos de fabricantes: tornillos, rodamientos, cilindros, motores. Una cuenta gratuita descarga el CAD.',
    },
    licence: { en: "The manufacturer's terms", fr: 'Conditions du fabricant', es: 'Condiciones del fabricante' },
  },
  {
    id: 'mcmaster', name: 'McMaster-Carr', url: 'https://www.mcmaster.com', group: 'makers', color: '#b5892f',
    formats: ['STEP', 'IGES', 'DWG'], naming: 'per-file',
    about: {
      en: 'An industrial supplier. Most product pages offer the part as a CAD file.',
      fr: 'Un fournisseur industriel. La plupart des fiches produit proposent la pièce en CAO.',
      es: 'Un proveedor industrial. La mayoría de las fichas de producto ofrecen la pieza en CAD.',
    },
    licence: { en: "McMaster-Carr's terms", fr: 'Conditions de McMaster-Carr', es: 'Condiciones de McMaster-Carr' },
  },
  {
    id: 'grabcad', name: 'GrabCAD Library', url: 'https://grabcad.com/library', group: 'community', color: '#3a8f5c',
    formats: ['STEP', 'STL', 'SolidWorks'], naming: 'named',
    about: {
      en: 'CAD models shared by engineers: machines, mechanisms, assemblies. A free account downloads them.',
      fr: 'Modèles CAO partagés par des ingénieurs : machines, mécanismes, assemblages. Un compte gratuit les télécharge.',
      es: 'Modelos CAD compartidos por ingenieros: máquinas, mecanismos, ensamblajes. Una cuenta gratuita los descarga.',
    },
    licence: { en: "GrabCAD's terms, model by model", fr: 'Conditions de GrabCAD, modèle par modèle', es: 'Condiciones de GrabCAD, modelo a modelo' },
  },
  {
    id: 'framework', name: 'Framework', url: 'https://github.com/FrameworkComputer', group: 'open', color: '#5b5bd6',
    formats: ['STEP'], naming: 'named',
    about: {
      en: 'The Framework Laptop 13 and 16, part by part, published by the maker for repair.',
      fr: 'Les Framework Laptop 13 et 16, pièce par pièce, publiés par le fabricant pour la réparation.',
      es: 'Los Framework Laptop 13 y 16, pieza a pieza, publicados por el fabricante para la reparación.',
    },
    licence: { en: 'CC BY 4.0', fr: 'CC BY 4.0', es: 'CC BY 4.0' },
  },
  {
    id: 'voron', name: 'Voron Design', url: 'https://github.com/VoronDesign', group: 'open', color: '#c0392b',
    formats: ['STL', 'Fusion 360'], naming: 'per-file',
    about: {
      en: '3D printers you build yourself. The printed parts come one file each.',
      fr: 'Des imprimantes 3D à monter soi-même. Les pièces imprimées arrivent un fichier chacune.',
      es: 'Impresoras 3D que montas tú mismo. Las piezas impresas llegan en un archivo cada una.',
    },
    licence: { en: 'GPL-3.0', fr: 'GPL-3.0', es: 'GPL-3.0' },
  },
  {
    id: 'nasa', name: 'NASA 3D Resources', url: 'https://github.com/nasa/NASA-3D-Resources', group: 'public', color: '#1f4e9c',
    formats: ['OBJ', 'STL', '3DS', 'Blender'], naming: 'mixed',
    about: {
      en: 'Spacecraft, satellites, rovers and asteroids, from NASA missions.',
      fr: 'Engins spatiaux, satellites, rovers et astéroïdes, issus des missions de la NASA.',
      es: 'Naves, satélites, rovers y asteroides, de las misiones de la NASA.',
    },
    licence: {
      en: 'Public domain in the US; the NASA logos are excluded',
      fr: 'Domaine public aux États-Unis ; les logos de la NASA sont exclus',
      es: 'Dominio público en EE. UU.; los logotipos de la NASA están excluidos',
    },
  },
  {
    id: 'smithsonian', name: 'Smithsonian 3D', url: 'https://3d.si.edu', group: 'public', color: '#6b4f2a',
    formats: ['GLB', 'OBJ'], naming: 'one-surface',
    about: {
      en: 'Museum objects, scanned. A scan is one surface: it opens, it does not come apart.',
      fr: "Objets de musée numérisés. Un scan est une seule surface : il s'ouvre, il ne s'éclate pas.",
      es: 'Objetos de museo escaneados. Un escaneo es una sola superficie: se abre, no se despieza.',
    },
    licence: { en: 'CC0 for the open access models', fr: 'CC0 pour les modèles en accès libre', es: 'CC0 para los modelos de acceso abierto' },
  },
  {
    id: 'sketchfab', name: 'Sketchfab', url: 'https://sketchfab.com/search?features=downloadable&type=models', group: 'community', color: '#1caad9',
    formats: ['GLB', 'glTF', 'USDZ'], naming: 'mixed',
    about: {
      en: 'A very large catalogue. The link filters on downloadable models; many are scans in one surface.',
      fr: 'Un très grand catalogue. Le lien filtre les modèles téléchargeables ; beaucoup sont des scans en une seule surface.',
      es: 'Un catálogo muy grande. El enlace filtra los modelos descargables; muchos son escaneos de una sola superficie.',
    },
    licence: { en: 'Creative Commons, model by model', fr: 'Creative Commons, modèle par modèle', es: 'Creative Commons, modelo a modelo' },
  },
  {
    id: 'printables', name: 'Printables', url: 'https://www.printables.com', group: 'community', color: '#e8762b',
    formats: ['STL', '3MF', 'STEP'], naming: 'per-file',
    about: {
      en: 'Models for 3D printing, run by Prusa. A multi-part object comes as several files.',
      fr: "Des modèles pour l'impression 3D, tenu par Prusa. Un objet en plusieurs pièces arrive en plusieurs fichiers.",
      es: 'Modelos para impresión 3D, de Prusa. Un objeto de varias piezas llega en varios archivos.',
    },
    licence: { en: 'Model by model', fr: 'Modèle par modèle', es: 'Modelo a modelo' },
  },
  {
    id: 'thingiverse', name: 'Thingiverse', url: 'https://www.thingiverse.com', group: 'community', color: '#248bfb',
    formats: ['STL', 'OBJ'], naming: 'per-file',
    about: {
      en: 'The oldest library of models for 3D printing. One file per printed part.',
      fr: "La plus ancienne bibliothèque de modèles pour l'impression 3D. Un fichier par pièce imprimée.",
      es: 'La biblioteca más antigua de modelos para impresión 3D. Un archivo por pieza impresa.',
    },
    licence: { en: 'Creative Commons, model by model', fr: 'Creative Commons, modèle par modèle', es: 'Creative Commons, modelo a modelo' },
  },
  {
    id: 'khronos', name: 'glTF Sample Assets', url: 'https://github.com/KhronosGroup/glTF-Sample-Assets', group: 'test', color: '#7a7a7a',
    formats: ['GLB', 'glTF'], naming: 'mixed',
    about: {
      en: 'Test models of the glTF format, including mechanical assemblies (a gearbox, an engine).',
      fr: 'Les modèles de test du format glTF, dont des assemblages mécaniques (une boîte de vitesses, un moteur).',
      es: 'Los modelos de prueba del formato glTF, incluidos ensamblajes mecánicos (una caja de cambios, un motor).',
    },
    licence: { en: 'Listed for each model', fr: 'Indiquée pour chaque modèle', es: 'Indicada para cada modelo' },
  },
];

export const GROUPS: SourceGroup[] = ['makers', 'open', 'public', 'community', 'test'];

/** Whether Parts opens at least one of the formats a source serves. */
export function opensHere(s: Source): boolean {
  return s.formats.some(f => READABLE.includes(f.toLowerCase()));
}
