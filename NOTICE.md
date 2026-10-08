# Notices

Parts is MIT (see `LICENSE`). It ships two third-party libraries as separate
files, each with its own licence beside it.

| Files | Library | Licence |
|---|---|---|
| `public/vendor/occt-import-js/` | [occt-import-js](https://github.com/kovacsv/occt-import-js) 0.0.23, built on Open CASCADE Technology | LGPL-2.1 (`LICENSE.md` in that folder) |
| `public/vendor/draco/` | [Draco](https://github.com/google/draco) decoder, as shipped by three.js 0.159 | Apache-2.0 (`LICENSE` in that folder) |

occt-import-js is loaded at run time from its own files and is never bundled
into the app's code. You can replace those two files with another build of the
library and the app uses it.

The app also uses [three.js](https://github.com/mrdoob/three.js) (MIT),
bundled.

## The models

Parts ships no model. Each person opens files they have the right to use. A
model's licence stays with that file.
