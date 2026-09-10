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
| `../schema/tei_simler.odd` | The schema **and** the rendering: every element's Processing Model and all text styling |
| `lib/odd/` | Reads the ODD: models, XPath predicates and params, the generated `odd.css` |
| `lib/tei/` | The pipeline that applies it: whitespace, hyphens, note ranges, the PM walker |
| `assets/tokens.css`, `fonts.css` | Design tokens and the fallback face the ODD's CSS refers to |
| `assets/preview.css` | The preview's own chrome, as plain CSS |
| `assets/preview.js` | The switches and the two anchored panels |
| `assets/facsimile.js` | The facsimile rail: OpenSeadragon over the IIIF images |
| `assets/normalize.js` | Search normalisation — plain ESM |
| `assets/search.js` | The search page, and marking the hits in a document |
| `page.ts` | The HTML shell: top bar, apparatus; index, search and findings pages |
| `build.ts` | Walks the corpus and writes `dist/` |

## The ODD renders the text

`schema/tei_simler.odd` is the only source of truth for the rendering; the code
knows no TEI element by name. Each element takes the first `<model>` whose
`@predicate` holds, and its `@behaviour` (`block`, `inline`, `heading`, `break`,
`note`, …) decides the HTML. `<outputRendition>` and `<tagsDecl>` compile to
`dist/assets/odd.css`; a `<modelGrp>`'s rendition styles all its models. Which
elements count as blocks for whitespace and line breaks follows from their
behaviours. Models with `@output` restyle a view instead: `normalized` and
`entities` are the preview's switches, `plaintext` is what the search indexes.

To change how something looks or renders, edit its `elementSpec` and rebuild.
Predicates and params use an XPath subset (`lib/odd/xpath.ts`); anything outside
it fails the build with the expression named. The ODD itself validates against
`tei_odds.rng`.
