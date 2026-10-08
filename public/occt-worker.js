// Reads a STEP file off the main thread. occt-import-js (LGPL-2.1) is a
// separate, replaceable file next to this one, under vendor/occt-import-js/.
// Paths are relative to THIS file's URL, so the worker works under the
// cartridge's mnemo-plugin://app/<id>/ prefix as well as on the dev server.
const BASE = new URL('vendor/occt-import-js/', self.location.href).href;
importScripts(BASE + 'occt-import-js.js');
let ready = null;
onmessage = async (e) => {
  try {
    ready = ready || occtimportjs({ locateFile: (name) => BASE + name });
    const occt = await ready;
    postMessage({ ok: true, result: occt.ReadStepFile(new Uint8Array(e.data), null) });
  } catch (err) {
    postMessage({ ok: false, error: String((err && err.message) || err) });
  }
};
