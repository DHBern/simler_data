# tei-odd-interpreter

Reads a TEI ODD and renders TEI documents by its Processing Model, in Node or a
bundler, without generating code. It knows no TEI element by name: the ODD says how
everything renders, and what the ODD gets wrong is reported instead of stopping the run.

```sh
npm add tei-odd-interpreter
```

```ts
import { readFileSync } from 'node:fs'
import { createProcessor, parse, readOdd, renderTei } from 'tei-odd-interpreter'

const odd = readOdd(readFileSync('my.odd', 'utf8'))
const processor = createProcessor(odd) // once per build

const result = renderTei(parse(readFileSync('doc.xml', 'utf8')), processor)
result.html // the page; odd.css styles it
```

An ODD is read from its first `schemaSpec`, through the `specGrp`s it refers to in the same
file. A chain to another ODD (`schemaSpec/@source`) is not followed and is reported: flatten
such an ODD first, with `odd2odd` from the TEI Stylesheets.

## API

| | |
| --- | --- |
| `readOdd(xml, { tokensCss?, behaviours?, ignoredOutputs?, checkedValueLists? })` | The ODD as an `Odd`: its models, `css`, `views`, `availability`, `findings` |
| `createProcessor(odd)` | The processor for one ODD |
| `parse(xml)` | TEI as xast; throws on XML that is not well-formed |
| `renderTei(tree, processor, decisions?)` | One document as a `RenderResult` |
| `coverage(odd)` | After rendering: the models that never fired, the elements without one |
| `idFindings(tree)` | Ids used twice, and ids that are no NCName |
| `toHtml(hast)` | hast as HTML, for a tree you changed |

`RenderResult` holds:

| | |
| --- | --- |
| `html`, `hast` | The page, as a string and as a tree to map to your own components |
| `text` | The `plain` output, for any search index |
| `notes` | In document order: `place`, `number` and `id` where numbered, `html`, `hast` |
| `page` | The params of the root element's `page` model, each as strings |
| `warnings` | Findings about this document |
| `unmapped` | Elements the ODD has no model for; they render as `span.tei-<name>.tei-unmapped` |
| `decisions` | Per element the model that won, with its classes and params, when asked for |

`tokensCss` is the stylesheet that defines the custom properties your ODD's CSS reads. It
is only used to check them, and is not added to `odd.css`. A value outside its `valList` is a
warning where the list is `closed`; `checkedValueLists: ['closed', 'semi']` also reports the
values a `semi` list does not suggest.

## Findings

`odd.findings`, `result.warnings`, `coverage(odd)` and `idFindings(tree)` all return
`{ code, severity, args, message }`. `severity` is `error` (a rule is lost), `warning` (the
result may not be what the ODD means) or `info` (it works, but may need a look). `message` is
in English; to report in another language, format `code` and `args`. An expression that
cannot be evaluated counts as empty, and a behaviour that is not known, or missing, renders as
`inline`, so one flaw costs one rule, not the document. Only XML that is not well-formed throws.

## Behaviours

`alternate`, `anchor`, `block`, `body`, `break`, `cell`, `cit`, `document`, `figDesc`,
`figure`, `glyph`, `graphic`, `heading`, `index`, `inline`, `link`, `list`, `listItem`,
`metadata`, `note`, `omit`, `paragraph`, `row`, `section`, `table`, `text`, `title`.

`index` renders nothing; generating the list TEI describes is left to you. `note` collects
its body and `place` into `result.notes` and leaves a numbered marker in the text, unless the
model's `marker` param is false, as for a note placed elsewhere on the page.

A project adds behaviours, or replaces one. One that only wraps needs a `tag`, any other a
`render`, which is given the element's params, its `content` and the rest of
`BehaviourContext`. `flow` decides how whitespace and line breaks around it are treated.

```ts
import { h, readOdd } from 'tei-odd-interpreter'

const odd = readOdd(xml, { behaviours: {
  verse: { tag: 'blockquote', flow: 'block' },
  stamp: { flow: 'block', params: ['by'], render: (c) => h('aside', c.props, c.content('aside')) },
} })
```

## Params and the XPath subset

Besides what a behaviour reads, a param named `--…` becomes a CSS custom property of the
rendered element, and one named `data-…` its attribute. `content` replaces the element's
content. A param that selects nothing has no value: a `break` whose `label` is `@n` on a line
without one is a plain break, while a `label` of `''` gives an empty element.

Predicates and params use a subset of XPath:

- **Paths:** `.`, `..`, `@name`, `name`, `*`, `node()`, `text()`, `/`, `//`, absolute paths
  and `[predicate]`. Namespace prefixes are ignored.
- **Axes:** `self`, `child`, `parent`, `ancestor`, `ancestor-or-self`, `descendant`,
  `descendant-or-self`, `preceding-sibling`, `following-sibling`, `preceding`, `following`.
- **Operators:** `or`, `and`, `=`, `!=`, `<`, `<=`, `>`, `>=`, `eq`, `ne`, `lt`, `le`, `gt`,
  `ge`, `+`, `-`, `mod`, `if (…) then … else …`, sequences `(a, b)`.
- **Functions:** `position`, `last`, `exists`, `empty`, `local-name`, `string-length`,
  `ends-with`, `matches`, `replace`, `not`, `count`, `concat`, `contains`, `contains-token`,
  `starts-with`, `normalize-space`, `translate`, `string`, `true`, `false`.

## Beyond the Processing Model

TEI's Processing Model does not cover everything an edition needs. These are this package's own
conventions; an ODD that does not use them renders as TEI describes.

| | |
| --- | --- |
| `page` output | Params of the root element's `page` model describe the page: `result.page`, each as strings. Simler's ODD gives `title`, `manifest`, `pages` and `entities` |
| `join` param of a `break` | The line joins the next: the spaces around it go, and a last character of the text that the param names, such as a hyphen |
| `marker` param of a `note` | False: the note is collected without a marker in the text |
| `place` param of a `note` | Where the note belongs, passed on to `result.notes` |
| `range` param of a `note` | The element its commented range starts at; the text between becomes `.note-range` |
| `data-region` param | `start` and `end` bracket a region: what stands between moves into the start |
| `--…` and `data-…` params | A CSS custom property and an attribute of the rendered element |

**A title without a `page` model:** take it from the parsed tree.

```ts
import { findFirst, parse, plainText } from 'tei-odd-interpreter'

const tree = parse(xml)
const title = plainText(findFirst(findFirst(tree, 'titleStmt'), 'title'))
```

## Outputs

Models with `@output` belong to the outputs it lists, and take precedence over the base models
there.

| Output | Meaning |
| --- | --- |
| `web` | The page itself, the same as no `@output` |
| `plain` | Rendered on its own: `result.text` |
| `page` | Not rendered. The root element's params describe the page: `result.page` |
| `print`, `latex`, `fo`, `epub`, `markdown` | Other media: their models are not read. `ignoredOutputs` changes the list |
| any other | A **view** over the page, listed in `odd.views`: its label is the model's first `<desc>`, its explanation the second |

A view renders in the same HTML and is switched by CSS: set `data-<output>="on"` on an
ancestor, or check an element with the id `view-<output>`. No script is needed.

## The HTML

You can rely on these, and they follow semantic versioning:

| | |
| --- | --- |
| `.tei-<element>` | On every element rendered |
| `.r-<id>`, `style` | A `@rendition` (`#id`, or a prefix the ODD's `prefixDef` resolves) and the source's `@style`, where the model has `@useSourceRendition="true"` |
| `id`, `lang` | From `xml:id` and `xml:lang`, the only attributes passed on without a param |
| `.<ident>-group`, `@cssClass` | A `modelGrp` beyond an element's only entry, and a styled model among several |
| `.pm-block` | A block set inside phrasing content, rendered as a span |
| `.pm-alt`, `.<output>-default`, `.<output>-alternate` | The readings of an `alternate`; `pm` stands for the page |
| `.<output>-omit` | An element a view leaves out |
| `a.note-marker` | A note's marker, with `id="ref-note-<n>"`, `href="#note-<n>"`, `role="doc-noteref"`, `data-note` and, for a range, `data-range` |
| `.note-range` | The text of a commented range, with the `data-note` of its note |
| `data-region` | A param with `start` and `end`: what stands between moves into the start |

## In a site (Astro, SvelteKit)

Render at build time or on the server. Read the ODD and create the processor once, then
render each document with it.

```ts
// src/lib/edition.ts
import { readFileSync } from 'node:fs'
import { createProcessor, parse, readOdd, renderTei } from 'tei-odd-interpreter'

const read = (path: string) => readFileSync(`edition/${path}`, 'utf8')
export const odd = readOdd(read('my.odd'))
const processor = createProcessor(odd)
export const render = (name: string) => renderTei(parse(read(`${name}.xml`)), processor)
```

**Astro**: `src/pages/[doc].astro`

```astro
---
import { odd, render } from '../lib/edition'
export const getStaticPaths = () => ['first', 'second'].map((doc) => ({ params: { doc } }))
const { html, page } = render(Astro.params.doc)
---
<Fragment set:html={`<style>${odd.css}</style>`} />
<h1>{page.title?.[0]}</h1>
<div set:html={html} />
```

**SvelteKit**: `src/routes/[doc]/+page.server.ts` and `+page.svelte`

```ts
import { odd, render } from '../../lib/edition'
export const prerender = true
export const entries = () => [{ doc: 'first' }, { doc: 'second' }]
export const load = ({ params }) => {
  const { html, page } = render(params.doc)
  return { html, title: page.title?.[0], css: odd.css }
}
```

```svelte
<script>
  let { data } = $props()
</script>
<svelte:head>{@html `<style>${data.css}</style>`}</svelte:head>
<h1>{data.title}</h1>
<div>{@html data.html}</div>
```

## Licence

BSD-2-Clause.
