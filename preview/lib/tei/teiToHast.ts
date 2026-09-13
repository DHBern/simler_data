/**
 * The walker: xast (TEI) → hast (HTML), driven by the ODD's Processing Model.
 *
 * Top-down: each element takes the first model of the output being rendered
 * whose predicate holds, else the first such base model, and renders by its
 * behaviour, which decides what of its content to render. Rendering the page,
 * the models of views only add classes, an `omit`, or other params for the same
 * behaviour; the view's CSS keys on them.
 */

import type { Element as HastElement, ElementContent, Properties } from 'hast'

import { BLOCK, type Model, type Odd } from '../odd/odd'
import { bool, isPos, seq, str, type Item, type Pos, type Value } from '../odd/xpath'
import { NOTE_RANGE } from './noteRanges'
import { attr, children, isElement, isText, localName, type Element, type Nodes } from './xast'

export type { ElementContent }

export interface CollectedNote {
  /** `end` for the numbered apparatus, or where else the note belongs. */
  place: string
  /** `note-1`, … and the marker's number, for the numbered apparatus only. */
  id?: string
  number?: number
  body: ElementContent[]
}

export interface RenderState {
  notes: CollectedNote[]
  warnings: string[]
  /** Elements without a model, rendered as plain spans. */
  unmapped: Set<string>
}

interface Ctx {
  pos: Pos
  props: Properties
  params: Record<string, Value>
  /** The params of each view whose model shares this behaviour; null for an output rendered on its own. */
  views: Record<string, Record<string, Value>> | null
  /** Whether the output around this element takes phrasing content only. */
  phrasing: boolean
  /** The element's content — its `content` param, or its children rendered inside `tag`. */
  content: (tag?: string) => ElementContent[]
  /** A param's value: the nodes it selects rendered by their own models, anything else as text. */
  value: (v: Value, tag?: string) => ElementContent[]
  state: RenderState
  atLineStart: () => boolean
}
type Behaviour = (c: Ctx) => ElementContent | ElementContent[] | null

export const h = (tagName: string, properties: Properties = {}, content: ElementContent[] = []): HastElement =>
  ({ type: 'element', tagName, properties, children: content })
export const text = (value: string): ElementContent => ({ type: 'text', value })

/** HTML elements whose content must be phrasing: a block inside becomes a span. */
const PHRASING = new Set(['p', 'span', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'])

const items = (v: Value | undefined): Item[] => (v === undefined ? [] : seq(v))
const same = (a: Item, b: Item) => (isPos(a) && isPos(b) ? a.node === b.node : a === b)

const block =
  (tag: string): Behaviour =>
  (c) => {
    const [t, props] = c.phrasing ? ['span', { ...c.props, className: [...classes(c.props), 'pm-block'] }] : [tag, c.props]
    return h(t, props, c.content(t))
  }

/** The PM behaviours this edition uses. */
const BEHAVIOURS: Record<string, Behaviour> = {
  omit: () => null,
  metadata: () => null,
  text: (c) => c.content(),
  block: block('div'),
  section: block('section'),
  paragraph: block('p'),
  heading: (c) => block(`h${Math.min(6, Math.max(1, Number(str(c.params.level)) || 1))}`)(c),
  list: block('ul'),
  listItem: block('li'),
  cit: block('blockquote'),
  inline: (c) => h('span', c.props, c.content('span')),
  /** Each reading once, marked as the default or not of the page and of each view; alone, the default. */
  alternate: (c) => {
    if (!c.views) return c.value(c.params.default)
    const outputs = [['pm', c.params], ...Object.entries(c.views)] as const
    const readings = outputs
      .flatMap(([, p]) => [...items(p.default), ...items(p.alternate)])
      .filter((r, i, all) => all.findIndex((s) => same(r, s)) === i)
    return h('span', c.props, readings.map((r) => h('span', {
      className: ['pm-alt', ...outputs.map(([o, p]) => `${o}-${items(p.default).some((d) => same(d, r)) ? 'default' : 'alternate'}`)],
    }, c.value([r], 'span'))))
  },
  anchor: (c) => (c.props.id ? h('span', c.props) : null),
  /** A line break where the output already starts a line would be an empty line. */
  break: (c) => {
    if (str(c.params.type) === 'line' && c.atLineStart()) return null
    if (!('label' in c.params)) return h('br', c.props)
    const label = str(c.params.label)
    return h('span', c.props, label ? [text(label)] : [])
  },
  /** Collected for the apparatus; in the text, a numbered marker when it goes to the end. */
  note: (c) => {
    const place = 'place' in c.params ? str(c.params.place) : 'end'
    const body = c.content('div')
    if (place !== 'end') {
      c.state.notes.push({ place, body })
      return null
    }
    const number = c.state.notes.filter((n) => n.place === 'end').length + 1
    const id = `note-${number}` // not `n<number>`: the corpus uses those as xml:id
    c.state.notes.push({ place, id, number, body })
    return h(
      'a',
      { className: ['note-marker', ...classes(c.props)], id: `ref-${id}`, href: `#${id}`, role: 'doc-noteref', 'data-note': id },
      [text(String(number))],
    )
  },
}

/** TEI attributes the pages' scripts read, mirrored as `data-*`. */
const MIRRORED = ['type', 'n', 'place', 'key', 'facs', 'corresp', 'reason', 'cert', 'unit', 'break', 'ref']

function classes(props: Properties): string[] {
  return Array.isArray(props.className) ? props.className.map(String) : []
}

function attrMap(node: Element): Properties {
  const props: Properties = {}
  for (const [name, value] of Object.entries(node.attributes ?? {})) {
    if (value == null) continue
    if (name === 'xml:id') props.id = value
    else if (name === 'xml:lang') props.lang = value
    else if (name.startsWith('data-')) props[name] = value
    else if (MIRRORED.includes(name)) props[`data-${name}`] = value
  }
  return props
}

/** `@rendition="#a #b"` → `['a', 'b']`. */
const renditions = (node: Element) => (attr(node, 'rendition') ?? '').split(/\s+/).filter(Boolean).map((t) => t.replace(/^#/, ''))

export function createRenderer(odd: Odd) {
  for (const [ident, models] of Object.entries(odd.models)) {
    for (const m of models) if (!BEHAVIOURS[m.behaviour]) throw new Error(`${ident}: unknown behaviour "${m.behaviour}"`)
  }
  const outputs = Object.fromEntries(
    Object.entries(odd.models).map(([ident, ms]) => [ident, [...new Set(ms.flatMap((m) => (m.output ? [m.output] : [])))]]),
  )
  const select = (models: Model[], pos: Pos, output?: string) =>
    models.find((m) => m.output === output && (!m.predicate || bool(m.predicate(pos))))

  /** Nothing but whitespace, or an element its model sets as a block, before this element in its parent. */
  function atLineStart({ node, up }: Pos): boolean {
    const siblings = children(up.at(-1))
    for (let i = siblings.indexOf(node) - 1; i >= 0; i--) {
      const s = siblings[i]
      if (isText(s)) {
        if (s.value?.trim()) return false
      } else if (isElement(s)) return BLOCK.has(select(odd.models[localName(s.name)] ?? [], { node: s, up })?.behaviour ?? '')
    }
    return true
  }

  /** Values outside the ODD's lists, and renditions it does not declare. */
  function check(node: Element, ln: string, state: RenderState) {
    for (const [name, value] of Object.entries(node.attributes ?? {})) {
      if (value != null && odd.values[ln]?.[name] && !odd.values[ln][name].has(value)) {
        state.warnings.push(`Wert nicht in der Werteliste der ODD: ${ln}/@${name}="${value}"`)
      }
    }
    for (const r of renditions(node)) {
      if (!odd.renditions.has(r)) state.warnings.push(`Rendition nicht in der ODD deklariert: #${r}`)
    }
  }

  /** `output` unset renders the page, with its views; set, that output alone. */
  function render(node: Nodes, up: Element[], phrasing: boolean, state: RenderState, output?: string): ElementContent[] {
    if (isText(node)) return node.value ? [text(node.value)] : []
    if (!isElement(node)) return []

    const ln = localName(node.name)
    const inside = (tag?: string) => (tag ? PHRASING.has(tag) : phrasing)
    const kids = (tag?: string) =>
      children(node).flatMap((child) => render(child as Nodes, [...up, node], inside(tag), state, output))
    if (ln === NOTE_RANGE) return [h('span', { className: ['note-range'], 'data-note': attr(node, 'data-note') }, kids('span'))]

    const pos: Pos = { node, up }
    const models = odd.models[ln] ?? []
    const model = (output && select(models, pos, output)) || select(models, pos)
    if (!model) {
      state.unmapped.add(ln)
      return [h('span', { ...attrMap(node), className: [`tei-${ln}`, 'tei-unmapped'] }, kids('span'))]
    }
    check(node, ln, state)

    const evaluate = (m: Model) => Object.fromEntries(Object.entries(m.params).map(([k, f]) => [k, f(pos)]))
    const views: Record<string, Record<string, Value>> = {}
    const viewClasses: string[] = []
    for (const v of output ? [] : outputs[ln]) {
      const m = select(models, pos, v)
      if (m?.behaviour === 'omit') viewClasses.push(`${v}-omit`)
      else if (m?.behaviour === model.behaviour) {
        viewClasses.push(...m.classes)
        views[v] = evaluate(m)
      }
    }
    const params = evaluate(model)
    const props = {
      className: [`tei-${ln}`, ...model.classes, ...viewClasses, ...renditions(node).map((r) => `r-${r}`)],
      ...attrMap(node),
    }
    const value = (v: Value, tag?: string) =>
      seq(v).flatMap((item) =>
        isPos(item) ? render(item.node, item.up, inside(tag), state, output) : String(item) ? [text(String(item))] : [],
      )
    const out = BEHAVIOURS[model.behaviour]({
      pos,
      props,
      params,
      views: output ? null : views,
      phrasing,
      content: (tag) => ('content' in params ? value(params.content, tag) : kids(tag)),
      value,
      state,
      atLineStart: () => atLineStart(pos),
    })
    return out == null ? [] : Array.isArray(out) ? out : [out]
  }

  return (tree: Nodes, state: RenderState, output?: string): ElementContent[] =>
    (tree.type === 'root' ? children(tree) : [tree]).flatMap((node) => render(node as Nodes, [], false, state, output))
}
