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
npm run build -- --records # also: what the ODD decided, as data
npm test                   # the conformance fixtures
npm run check              # types
```

`dist/index.html` is the index. The pages open from `file://` too, but the
search and the typeface both need a server:

```sh
python -m http.server -d dist 8080     # or: npx serve dist
```

## How it works

```mermaid
flowchart TD
  ODD["<b>schema/tei_simler.odd</b><br/>models · predicates · params · CSS"]
  TEI["<b>TEI sources</b><br/>webdav/data/sources/tei/*.xml"]

  ODD --> READ["<b>readOdd</b><br/>compile the XPath, generate odd.css,<br/>check the ODD itself"]
  READ --> PROC["<b>createProcessor</b><br/>once per build"]
  TEI --> PARSE["<b>parse</b><br/>check the ids"]

  subgraph RENDER["renderTei — per document"]
    direction TB
    PREP["whitespace, joined line ends"] --> WALK["<b>walker</b><br/>each element takes the first model<br/>whose predicate holds"]
    WALK --> PAGE["the page<br/>base models + views"]
    WALK --> PLAIN["output plain<br/>the search text"]
  end

  PROC --> PREP
  PARSE --> PREP
  PAGE --> HTML["dist/*.html"]
  PLAIN --> INDEX["Pagefind index"]
  READ --> CSS["dist/assets/odd.css"]
  READ -. "findings" .-> FIND["dist/findings.html"]
  WALK -. "coverage, --records" .-> FIND
```

The ODD is the only place that says how anything renders; the code reads it and
carries it out. Every element takes the first model whose predicate holds, and one
walk of the tree gives the page (the base models, with the views laid over them as
switches); a second walk gives the `plain` output, which is what the search indexes.
What the ODD itself gets wrong, and which of its models never fire, is reported on
the findings page next to what the documents get wrong.

## Layout

| Path | Contents |
| --- | --- |
| `../schema/tei_simler.odd` | The schema **and** the rendering: every element's Processing Model and all text styling |
| `lib/` | The renderer, as the package `tei-odd-interpreter`: everything below is behind `lib/index.ts` |
| `lib/odd/` | Reads the ODD: models, XPath predicates and params, the generated `odd.css` |
| `lib/tei/` | The pipeline that applies it: parsing, whitespace, hyphens, note ranges and regions, the behaviour table, the PM walker, the HTML serialiser |
| `lib/findings.ts` | What the package reports, as data: a code, its values and an English message |
| `messages.ts` | Those findings in German, as the preview's pages say them |
| `iiif.ts` | The IIIF image addresses the document pages and the facsimile drawer use |
| `assets/tokens.css`, `fonts.css` | Design tokens and the fallback face the ODD's CSS refers to |
| `assets/preview.css` | The preview's own chrome, as plain CSS |
| `assets/preview.js` | The reading pages: the switches, the two anchored panels, the way into a synopsis |
| `assets/store.js` | What a reader chose, kept across pages; the one thing the two scripts share |
| `assets/synopsis.css`, `synopsis.js` | The synopsis pages, loaded by them alone |
| `assets/facsimile.js` | The facsimile drawer: open, close, resize; OpenSeadragon over the IIIF images |
| `assets/normalize.js` | Search normalisation — plain ESM |
| `assets/search.js` | The search page, and marking the hits in a document |
| `entities.ts` | The project's registers (persons, places, works, institutions) from `gsheet/csv`, for the entity cards |
| `alignments.ts` | The alignments from `../alignment/documents`, as the synopsis pages show them: Alignment JSON 1.0, whose apparatus it derives |
| `page.ts` | The HTML shell: top bar, apparatus (the numbered notes, and a box per other place); document, index, search and findings pages |
| `synopsis.ts` | The synopsis pages; it knows nothing of the ODD, and `page.ts` knows nothing of alignments |
| `build.ts` | Walks the corpus and writes `dist/` |
| `test/` | What reading the ODD must report, and one ODD with four TEI cases, one per Processing-Model feature, with what they must render |

## Using the renderer in a site

`lib/` is the package `tei-odd-interpreter`; [lib/README.md](lib/README.md) describes its
API, the HTML it promises and how to use it in Astro or SvelteKit. The preview imports its
source directly, so no build step is needed here; `npm pack` in `lib/` compiles it. The
ODD's CSS reads the design tokens (`var(--c-person)`, …), so a page of this edition needs
`assets/tokens.css` as well as `odd.css`. `page.ts` here is a working reference for the rest;
the note popovers, entity cards and facsimile viewer are the preview's own `assets/*.js`,
not part of the package.

## The ODD renders the text

`schema/tei_simler.odd` is the only source of truth for the rendering; the code
knows no TEI element by name. Each element takes the first `<model>` whose
`@predicate` holds, and its `@behaviour` (`block`, `inline`, `heading`, `break`,
`note`, `alternate`, …) decides the HTML. `lib/tei/behaviours.ts` gives each
behaviour the element it wraps its content in and whether that renders as a block
or inline; a behaviour that does more than wrap is written out in the walker.
A `<modelSequence>` renders each of its models whose predicate holds, one after
the other (`supplied` as its brackets and its text). A `break` with a `label` is the label, then the break (the hyphen at a
joined line end). A `line` break with a `label` *is* a joined line end: the hyphen
encoded before it and the whitespace around it do not render; the word goes on past
what the search text leaves out, so one hyphenated across a page is joined after the
catchword, the page break and the running head. A hyphen at any other
line end stays, and the ODD's Schematron warns about it unless it is an ellipsis
(*Ehren- und*), a catchword's or a turnover's. `@rendition` styles the
element only where its model has `@useSourceRendition="true"` (or inherits it
from its `<modelGrp>`). Predicates see the text as encoded, even where the
pipeline changed what renders (the hyphen at a joined line end). Params are
XPath: the nodes they select are rendered by their own models, anything else is
text, so
`<param name="content" value="corr"/>` renders the correction. Params named
`--…` become CSS custom properties of the rendered element, `data-…` its
attributes, and `join` says a line joins the next: the spaces around it go, and a
last character of its text that the param names. Of an element's own attributes only
`xml:id` and `xml:lang` reach the page without a param; attribute values are
read with their whitespace collapsed. `<outputRendition>` and `<tagsDecl>` compile to
`dist/assets/odd.css`; a `<modelGrp>`'s rendition styles all its models, and a
styled model among several must name its class with `@cssClass`. A `<modelGrp>` has
no predicate, so it decides like a model without one: an element that reaches it
takes one of its models or none, and a model behind it is never reached. 
The ODD's `<availability>` travels into what is generated from it: the head of
`odd.css`, the footer of the pages, and each `--records` file. Whether an element counts as a
block for whitespace and line breaks follows from the model it takes where it
stands, and from its behaviour's flow. A note's `marker` param, where false, leaves no marker in the text. Its `range` param names the element its commented range starts at;
the range is resolved on the rendered page, across any element boundary. Range
and marker share `data-note`: pointing at either lights up both, and clicking the
range opens the note. A `data-page` param names the facsimile image of a page
break: the drawer finds its pages by it, and clicking the break opens its page. A
`data-margin` param (`left` or `right`) puts the element in the page's margin, on
that side and beside its line, where the window leaves room for a margin beside the
text; elsewhere, as on a phone or beside the open facsimile, it stays in the line.
A `data-region` param (`start`, `end`) brackets a region between two milestones, as
`cb` brackets a column set: what stands between moves into the start, across any
element boundary, so the start's model styles the region.

Models with `@output` belong to that output and take precedence over the base
models there. `plain` is rendered on its own and is what the search indexes;
what it leaves out is not searched on the page either, where a hit may span
`hi`, ranges and joined line ends. Only that rendering decides what the index
joins: a joined line end leaves neither hyphen nor word boundary behind, so the
word is one; any other line end leaves both, so it is two, exactly as the page
shows it. `normalized` (the reading text, which joins
every line but the title page's) and `entities` are the preview's switches:
views over the one page, where a model may omit the element, restyle it, or give
the same behaviour other params — an `alternate` (as for `choice`) renders every
reading once and shows each view's own default. A view's `<modelSequence>`
overlays the page's sequence model by model. **The switches are the ODD's:** every
output but `web`, `page` and `plain` becomes one, named by the first `<desc>` among
its models and explained by a second; a new view is an ODD change, and nothing here
knows their names. Each view's CSS keys on its switch as well as on the attribute
the script sets, so the views work with JavaScript off. *Anmerkungen*, *Schrift* and
*Dunkler Modus* are the preview's own controls, not renderings. The `page` model of the root element says, in its
params, what the page shows around the text: `title`, `manifest` (the IIIF
manifest), `pages` (the facsimile ids) and `entities` (the register keys).

To change how something looks or renders, edit its `elementSpec` and rebuild.
Predicates and params use an XPath subset (`lib/odd/xpath.ts`). An expression
outside it, or one that fails where it is evaluated, counts as empty — the
predicate is false and the next model decides, the param has no value — so the
corpus still renders; the build names it, `findings.html` lists it under *ODD*,
and the run ends non-zero. Reading the ODD also reports a param the behaviour does
not read, a model an earlier one or a group makes unreachable, a CSS custom property that
neither the design tokens nor the ODD itself defines, and what it does not take from the ODD:
the `@source` of a `schemaSpec`, since the ODD must be flattened first, and any `schemaSpec`
but the first. A behaviour it does not know, or a model without one, renders as `inline`; a
styled model among several without `@cssClass` is styled by its id. All three are findings too.

Every build also reads the ODD back against the corpus: which of its models fired,
which element it has models for that the corpus never has, and which element it has
no model for. `findings.html` lists the gaps under *ODD-Abdeckung*. A model that
never fires is a finding, not an error, so it does not fail the build. With
`--records`, each document's decisions are written to `dist/records/<name>.json` —
per element the model that won, its behaviour, classes and params, and the text as
it renders. It is what another toolchain reads instead of re-implementing the
Processing Model; the pages do not need it, so it is off by default.

A source file that is not well-formed XML does not stop the others: its page says
so, with the parser's line and column, the index flags it, and `findings.html` lists
it first. It has no text, so it is missing from the search. On CI it is a warning on
the run's summary; the run still succeeds and publishes the rest, since only a flaw
in the ODD fails it.

The ODD validates against
`tei_odds.rng`: the `odd` job of the TEI Preview workflow checks it with `jing` on
every run, against a pinned TEI release. The Schema to WebDAV workflow compiles it to
`tei_simler.rng` and `tei_simler.sch` whenever it changes, and puts them into
`/schema/` on the WebDAV, where the editors validate.
