/**
 * The element map: one entry per TEI element, TEI local name → hast.
 *
 * Conventions: every element gets a `tei-<name>` class, so CSS can address it;
 * `@rendition` becomes `r-<id>` classes (renditions.css); the reading and
 * diplomatic views are CSS over one rendering, never two.
 */

import { NOTE_RANGE } from './noteRanges'
import { BLOCK_ELEMENTS, ENTITY_TYPES } from './options'
import {
  h,
  text,
  withClass,
  type ElementContent,
  type HandlerContext,
  type HandlerMap,
} from './teiToHast'
import { attr, children, elementChildren, isElement, isText, localName, plainText, type Element } from './xast'

const BLOCK = new Set<string>(BLOCK_ELEMENTS)
const ENTITIES = new Set<string>(ENTITY_TYPES)

/** Transparent: emit the children, drop the wrapper. */
const transparent = (ctx: HandlerContext) => ctx.children

/** Drop the element and everything in it. */
const omit = () => null

/** `<tag class="tei-<name> …">children</tag>` */
const wrap =
  (tagName: string) =>
  (ctx: HandlerContext): ElementContent =>
    h(tagName, withClass(ctx.props, `tei-${ctx.ln}`), ctx.children)

/**
 * Is this `<lb/>` redundant?
 */
function isRedundantLineBreak(ctx: HandlerContext): boolean {
  const parent = ctx.ancestors.at(-1)
  if (!parent) return true
  const siblings = children(parent)
  const index = siblings.indexOf(ctx.node)
  for (let i = index - 1; i >= 0; i--) {
    const sibling = siblings[i]
    if (isText(sibling)) {
      if (sibling.value?.trim()) return false // text on this line: a real break
      continue
    }
    if (isElement(sibling)) return BLOCK.has(localName(sibling.name))
  }
  return true // nothing before it — a leading break, not a line end
}

/**
 * Heading level from division depth, clamped to h1–h6.
 */
function headingLevel(ctx: HandlerContext): number {
  const depth = ctx.ancestors.filter((a) => localName(a.name) === 'div').length
  return Math.min(6, Math.max(1, ctx.options.headingBase + Math.max(0, depth - 1)))
}

/** `@rendition="#a #b"` → `['a', 'b']`. */
function renditions(node: Element): string[] {
  return (attr(node, 'rendition') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.replace(/^#/, ''))
}

/**
 * Buͦchſtabwaͤchſel: split an acrostic line into its grid cells.
 *
 * `<l rendition="#acrostic">` is a mini-grid — [Randbuchstabe] [Vers]
 * [Randbuchstabe] — and CSS Grid makes *every* element child a cell of its own,
 * so the verse needs one explicit cell.
 */
function acrosticCells(content: ElementContent[]): { cells: ElementContent[]; classes: string[] } {
  const init: ElementContent[] = []
  const fin: ElementContent[] = []

  const lift = (nodes: ElementContent[]): ElementContent[] =>
    nodes.flatMap((node): ElementContent[] => {
      if (node.type !== 'element') return [node]
      const names = node.properties?.className
      const classes = Array.isArray(names) ? names.map(String) : []
      if (classes.includes('r-acroInit')) {
        init.push(node)
        return []
      }
      if (classes.includes('r-acroFin')) {
        fin.push(node)
        return []
      }
      return [{ ...node, children: lift(node.children) }]
    })

  const body = lift(content)
  return {
    cells: [...init, h('span', { className: ['acro-body'] }, body), ...fin],
    // A line missing one of the two marginal letters gets a two-cell grid, so
    // no measure is spent on a column it does not use.
    classes: [...(fin.length ? [] : ['acro-init-only']), ...(init.length ? [] : ['acro-fin-only'])],
  }
}

/**
 * What a page break prints.
 */
function pageLabel(ctx: HandlerContext): string {
  const n = attr(ctx.node, 'n')
  if (n) return n
  const facs = attr(ctx.node, 'facs')
  return (facs && ctx.state.pageLabels?.[facs]) ?? '·'
}

export const handlers: HandlerMap = {
  // ── document skeleton ─────────────────────────────────────────────────────
  TEI: transparent,
  teiHeader: omit,
  text: transparent,
  body: transparent,
  front: transparent,
  back: transparent,
  group: transparent,

  div: (ctx) => h('section', withClass(ctx.props, 'tei-div'), ctx.children),

  head: (ctx) => {
    // Only a division's head is a document heading. A `<head>` inside an `<lg>`
    // is a stanza number, and inside a `<list>` or `<figure>` a caption — making
    // those <h2> would put "2." on a level with the poem's title and wreck the
    // outline a screen reader announces.
    const parent = ctx.ancestors.at(-1)
    const parentName = parent ? localName(parent.name) : ''
    if (!ctx.options.headingLevels || parentName !== 'div') {
      return h('p', withClass(ctx.props, 'tei-head', `tei-head-${parentName || 'orphan'}`), ctx.children)
    }
    return h(`h${headingLevel(ctx)}`, withClass(ctx.props, 'tei-head'), ctx.children)
  },

  p: wrap('p'),
  ab: wrap('p'),

  // ── verse ─────────────────────────────────────────────────────────────────
  lg: (ctx) => {
    const props = withClass(ctx.props, 'tei-lg')
    if (!renditions(ctx.node).includes('twocol')) return h('div', props, ctx.children)
    const columns = elementChildren(ctx.node, 'l')
      .map((line, i) => (renditions(line).includes('acrostic') ? (i % 2 ? 'right' : 'left') : ''))
      .filter(Boolean)
    return h('div', withClass(props, ...[...new Set(columns)].sort().map((c) => `acro-${c}`)), ctx.children)
  },

  l: (ctx) => {
    const props = withClass(ctx.props, 'tei-l')
    const parent = ctx.ancestors.at(-1)
    if (parent && renditions(parent).includes('twocol')) {
      props['data-col'] = elementChildren(parent, 'l').indexOf(ctx.node) % 2 ? 'r' : 'l'
    }
    if (!renditions(ctx.node).includes('acrostic')) return h('div', props, ctx.children)
    const { cells, classes } = acrosticCells(ctx.children)
    return h('div', withClass(props, ...classes), cells)
  },

  // ── page and line breaks ──────────────────────────────────────────────────
  pb: (ctx) => {
    const facs = attr(ctx.node, 'facs')
    if (facs) ctx.state.pages.push(facs)
    // The scroll anchor the facsimile pane syncs on. Page-level only — line-level
    // coordinates are an editorial non-goal.
    const label = pageLabel(ctx)
    return h(
      'span',
      withClass(
        {
          ...ctx.props,
          id: facs ? `pb-${facs}` : undefined,
          title: facs ? `Seitenwechsel — Digitalisat ${facs}` : 'Seitenwechsel',
        },
        'tei-pb',
      ),
      [h('span', { className: ['tei-pb-label'] }, [text(label)])],
    )
  },

  lb: (ctx) => {
    if (isRedundantLineBreak(ctx)) return null
    // `@break="no"` means the word continues across the line end. In the reading
    // text nothing is shown; the diplomatic view restores the print's break and
    // supplies the hyphen the source does not encode (see tei.css).
    if (attr(ctx.node, 'break') === 'no') {
      // `data-hyphen` is set by `hyphens.ts` where the print's own hyphen stood
      // in the file; it only tells the stylesheet not to mark the hyphen it
      // restores as an editorial addition.
      return h(
        'span',
        { className: ['tei-lb'], 'data-break': 'no', 'data-hyphen': attr(ctx.node, 'data-hyphen') },
        [],
      )
    }
    return h('br', { className: ['tei-lb'] }, [])
  },

  cb: (ctx) => h('span', withClass(ctx.props, 'tei-cb'), []),

  milestone: (ctx) =>
    h('span', withClass(ctx.props, 'tei-milestone'), []),

  // ── highlighting and source appearance ────────────────────────────────────
  hi: (ctx) => h('span', withClass(ctx.props, 'tei-hi'), ctx.children),
  emph: wrap('em'),
  foreign: (ctx) => h('span', withClass(ctx.props, 'tei-foreign'), ctx.children),

  // ── editorial interventions ───────────────────────────────────────────────
  choice: (ctx) => h('span', withClass(ctx.props, 'tei-choice'), ctx.children),
  sic: (ctx) => h('span', withClass(ctx.props, 'tei-sic'), ctx.children),
  corr: (ctx) => h('span', withClass(ctx.props, 'tei-corr'), ctx.children),
  orig: (ctx) => h('span', withClass(ctx.props, 'tei-orig'), ctx.children),
  reg: (ctx) => h('span', withClass(ctx.props, 'tei-reg'), ctx.children),
  abbr: (ctx) => h('span', withClass(ctx.props, 'tei-abbr'), ctx.children),
  expan: (ctx) => h('span', withClass(ctx.props, 'tei-expan'), ctx.children),
  // Brackets and the wavy underline come from CSS, so they never enter the text
  // layer and cannot end up in the search index or a copy-paste.
  supplied: (ctx) => h('span', withClass(ctx.props, 'tei-supplied'), ctx.children),
  unclear: (ctx) => h('span', withClass(ctx.props, 'tei-unclear'), ctx.children),
  gap: (ctx) => h('span', withClass(ctx.props, 'tei-gap'), [text('[…]')]),
  space: (ctx) => h('span', withClass(ctx.props, 'tei-space'), []),
  del: wrap('del'),
  add: wrap('ins'),

  // ── notes ─────────────────────────────────────────────────────────────────
  [NOTE_RANGE]: (ctx) =>
    h('span', { className: ['note-range'], 'data-note': ctx.props['data-note'] }, ctx.children),

  note: (ctx) => {
    const type = (attr(ctx.node, 'type') ?? null) as string | null

    // `note[@type="bibl"]` is a marginal Bible reference printed in the source —
    // part of the text, not of the editorial apparatus, and it must not be swept
    // into the note stream.
    if (type === 'bibl') {
      return h('span', withClass(ctx.props, 'tei-note-bibl'), ctx.children)
    }
    if (type === 'remarkResponsibility') return null

    const ranged = Boolean(attr(ctx.node, 'targetEnd'))
    const number = ctx.state.notes.length + 1
    const id = `note-${number}` // not `n<number>`: the corpus uses those as xml:id
    ctx.state.notes.push({ id, number, type, ranged, body: ctx.children })

    // Unanchored notes are Überblickskommentare: they comment on the division,
    // not on a place in it, so they get no marker.
    if (!ranged) return null

    return h(
      'a',
      {
        className: ['note-marker'],
        id: `ref-${id}`,
        href: `#${id}`,
        role: 'doc-noteref',
        'data-note': id,
      },
      [text(String(number))],
    )
  },

  // The anchor has been consumed by `noteRanges`; any survivor is a dangling
  // pointer, kept as an empty target so an id in a URL still resolves.
  anchor: (ctx) =>
    ctx.props.id ? h('span', { id: ctx.props.id, className: ['tei-anchor'] }, []) : null,

  // ── entity references ─────────────────────────────────────────────────────

  rs: (ctx) => {
    const type = attr(ctx.node, 'type')
    const key = attr(ctx.node, 'key')
    const classes = ['rs']
    if (type && ENTITIES.has(type)) classes.push(`rs-${type}`)
    else if (type) ctx.state.warnings.push(`rs/@type="${type}" is not in the ODD's value list`)

    const ref = key ? ctx.state.entityRefs?.[key] : undefined
    if (!ref) return h('span', withClass(ctx.props, ...classes), ctx.children)

    return h(
      'a',
      withClass(
        {
          ...ctx.props,
          href: ref.href,
          'data-entity': key,
          title: `${ref.registerLabel}: ${ref.label}`,
        },
        ...classes,
      ),
      ctx.children,
    )
  },

  // ── figures and music ─────────────────────────────────────────────────────
  figure: (ctx) => {
    if (attr(ctx.node, 'type') !== 'notatedMusic') {
      return h('figure', withClass(ctx.props, 'tei-figure'), ctx.children)
    }
    const corresp = attr(ctx.node, 'corresp')
    if (!corresp) ctx.state.warnings.push('notatedMusic figure has no @corresp')
    return h('div', withClass(ctx.props, 'tei-music'), [
      h('span', { className: ['tei-music-label'] }, [
        text(corresp ? `Notensatz: ${corresp}` : 'Notensatz'),
      ]),
    ])
  },
  figDesc: wrap('figcaption'),
  graphic: (ctx) => h('img', { ...ctx.props, src: attr(ctx.node, 'url') ?? '', alt: '' }, []),

  // ── forme work ────────────────────────────────────────────────────────────
  fw: (ctx) => h('span', withClass(ctx.props, 'tei-fw'), ctx.children),

  // ── lists, titles, references ─────────────────────────────────────────────
  list: (ctx) => h(attr(ctx.node, 'type') === 'ordered' ? 'ol' : 'ul', withClass(ctx.props, 'tei-list'), ctx.children),
  item: wrap('li'),
  label: (ctx) => h('span', withClass(ctx.props, 'tei-label'), ctx.children),
  title: (ctx) => h('em', withClass(ctx.props, 'tei-title'), ctx.children),
  bibl: (ctx) => h('cite', withClass(ctx.props, 'tei-bibl'), ctx.children),
  cit: wrap('blockquote'),
  quote: (ctx) => h('q', withClass(ctx.props, 'tei-quote'), ctx.children),
  num: (ctx) => h('span', withClass(ctx.props, 'tei-num'), ctx.children),
  date: (ctx) => h('time', withClass(ctx.props, 'tei-date'), ctx.children),
  ref: (ctx) => {
    const target = attr(ctx.node, 'target')
    if (!target) return h('span', withClass(ctx.props, 'tei-ref'), ctx.children)
    return h('a', withClass({ ...ctx.props, href: target }, 'tei-ref'), ctx.children)
  },

  // ── names ─────────────────────────────────────────────────────────────────
  persName: (ctx) => h('span', withClass(ctx.props, 'tei-persName'), ctx.children),
  name: (ctx) => h('span', withClass(ctx.props, 'tei-name'), ctx.children),
  surname: transparent,
  forename: transparent,

  // ── title page and closers ────────────────────────────────────────────────
  titlePage: (ctx) => h('section', withClass(ctx.props, 'tei-titlePage'), ctx.children),
  docTitle: (ctx) => h('div', withClass(ctx.props, 'tei-docTitle'), ctx.children),
  titlePart: (ctx) => h('div', withClass(ctx.props, 'tei-titlePart'), ctx.children),
  docAuthor: (ctx) => h('div', withClass(ctx.props, 'tei-docAuthor'), ctx.children),
  docImprint: (ctx) => h('div', withClass(ctx.props, 'tei-docImprint'), ctx.children),
  docDate: (ctx) => h('span', withClass(ctx.props, 'tei-docDate'), ctx.children),
  publisher: (ctx) => h('span', withClass(ctx.props, 'tei-publisher'), ctx.children),
  pubPlace: (ctx) => h('span', withClass(ctx.props, 'tei-pubPlace'), ctx.children),
  docEdition: (ctx) => h('div', withClass(ctx.props, 'tei-docEdition'), ctx.children),
  epigraph: (ctx) => h('div', withClass(ctx.props, 'tei-epigraph'), ctx.children),
  byline: (ctx) => h('p', withClass(ctx.props, 'tei-byline'), ctx.children),
  closer: (ctx) => h('div', withClass(ctx.props, 'tei-closer'), ctx.children),
  opener: (ctx) => h('div', withClass(ctx.props, 'tei-opener'), ctx.children),
  salute: (ctx) => h('p', withClass(ctx.props, 'tei-salute'), ctx.children),
  dateline: (ctx) => h('p', withClass(ctx.props, 'tei-dateline'), ctx.children),
  signed: (ctx) => h('p', withClass(ctx.props, 'tei-signed'), ctx.children),
  trailer: (ctx) => h('p', withClass(ctx.props, 'tei-trailer'), ctx.children),

  /**
   * Fallback. An element with no entry renders as a transparent span rather than
   * disappearing, and says so in the class name: unmapped should be visible in
   * the DOM inspector, not silently swallowed.
   */
  '*': (ctx) => h('span', withClass(ctx.props, `tei-${ctx.ln}`, 'tei-unmapped'), ctx.children),
}

/** Elements that carry no text and should not warn when they render empty. */
export const EMPTY_ELEMENTS = new Set(['pb', 'lb', 'cb', 'anchor', 'milestone', 'space', 'graphic'])

/** Plain-text of a TEI subtree — used for page titles and the (future) search index. */
export { plainText }
