/**
 * A path inside the cartridge, resolved against the page's own URL. An
 * installed cartridge lives under mnemo-plugin://app/<id>/, so a root-absolute
 * '/x' would leave the plugin's prefix and 404.
 */
export function assetUrl(path: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return path;
  return new URL(path.replace(/^\/+/, ''), document.baseURI).toString();
}
