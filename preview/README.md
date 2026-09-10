# TEI preview

Renders every TEI file in `webdav/data/sources/tei/` to a standalone HTML page.
It serves two purposes:
* editors proof the encoding before it reaches the presentation layer,
* and the rendering engine is developed here and goes back into the frontend.

## Usage

```sh
npm ci
npm run build              # whole corpus to dist/
npm run build -- A_1648    # only matching file names
npm run build -- --src ../exported --out /tmp/preview
```

`dist/index.html` is the index. The pages open from `file://` too, but the
search and the typeface both need a server:

```sh
python -m http.server -d dist 8080     # or: npx serve dist
```

## Layout

| Path | Contents |
| --- | --- |
| `lib/` | The rendering pipeline, shared with the frontend |
| `assets/tokens.css`, `renditions.css`, `tei.css` | The text layer, likewise shared |
| `assets/preview.css` | The preview's own chrome, as plain CSS |
| `assets/preview.js` | The switches and the two anchored panels |
| `assets/facsimile.js` | The facsimile rail: OpenSeadragon over the IIIF images |
| `assets/normalize.js` | Search normalisation — plain ESM |
| `assets/search.js` | The search page, and marking the hits in a document |
| `page.ts` | The HTML shell: top bar, apparatus; index, search and findings pages |
| `build.ts` | Walks the corpus and writes `dist/` |
