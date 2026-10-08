<div align="center">

<img src="https://raw.githubusercontent.com/Mnemosyne-OS/Mnemosyne-Neural-OS/main/assets/banner-mnemosyne-os.png" width="100%" alt="Mnemosyne OS — Your memory. Your machine. Your rules." />

🌐 [**mnemosyne-os.io**](https://mnemosyne-os.io) — the product&ensp;·&ensp;[**mnemosyne-os.com**](https://mnemosyne-os.com) — for organizations&ensp;·&ensp;📖 [**docs.mnemosyne-os.io**](https://docs.mnemosyne-os.io) — the documentation

</div>

# Parts

A Mnemosyne OS cartridge. You open a 3D model you have on your machine, and
Parts takes it apart.

## What it does

- Opens STEP, GLB, glTF, OBJ and STL files. You drop the file on the window
  or pick it with the button.
- Explodes the model. By default it opens layer by layer, along the
  model's thinnest side: a laptop opens like the exploded view of a repair
  manual. A second mode moves each part away from the centre.
- Lists every part. You can select a part in the list or in the 3D view, hide
  it, or show it alone.
- Decodes factory part codes into readable names, in English, French and
  Spanish. `GFW00_3H_NB_ID_HINGE_PLATE_R_1` becomes « Right hinge plate ». The
  decoder uses a word table. A name it cannot decode stays as the file wrote
  it.
- Lets you correct a name and write a note on any part. They come back the
  next time you open the same file.
- Writes a model sheet into your memory when you press « Keep this sheet in
  my memory ». The sheet lists the model, its parts count, and the parts you
  named or wrote about. It goes into the app's own vault. You open that vault
  to the rest of your memory from the vault panel, and then the chat finds it.

## Where your files go

The model file stays on your machine. Parts reads it in the window and keeps
only the names and notes you wrote, in the app's storage.

## What a file needs

Parts names what the file names. A STEP file from a maker usually carries a
name for every part. Many GLB files found online carry placeholders such as
`body_3` or `Mesh.042`: Parts shows them as they are and you can name them
yourself.

A scan (photogrammetry) is one single surface. It opens, and it cannot be
exploded.

A `.gltf` that points to separate `.bin` files cannot be read from a dropped
file. Open the `.glb` version of the same model.

## Requirements

Mnemosyne OS 1.8.0 or later. Earlier versions do not let a cartridge open
STEP, GLB, glTF, OBJ or STL files through the file picker.

## Install

In Mnemosyne OS, open the MnemoHub, choose « Add a cartridge », and paste this
repository's URL: `https://github.com/Mnemosyne-OS/MnemoParts`.

## Develop

Parts is developed inside the Mnemosyne OS workspace, where its dev server
listens on `127.0.0.1:5225`. This repository carries the built app in
`dist/`, which is what Mnemosyne OS installs.

## Licences

Parts is MIT. It ships occt-import-js (LGPL-2.1) and the Draco decoder
(Apache-2.0) as separate files. See `NOTICE.md`.

## Where Mnemosyne OS lives

This cartridge runs inside **Mnemosyne OS**, the sovereign, local-first memory operating system published by XPACEGEMS LLC. Its official addresses:

- Product site: <https://mnemosyne-os.io>
- Organizations: <https://mnemosyne-os.com>
- Documentation: <https://docs.mnemosyne-os.io>
- Host source: <https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS>
- Packages: the npm scope `@mnemosyne_os`

---

<sub>**[Mnemosyne OS](https://mnemosyne-os.io)** — the sovereign, local-first memory OS this cartridge runs in.
Get it at [mnemosyne-os.io/download](https://mnemosyne-os.io/download), install cartridges from the built-in MnemoHub store, or [build your own](https://mnemosyne-os.io/dev).</sub>
