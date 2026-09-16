/**
 * The walker: xast (TEI) → hast (HTML), driven by the ODD's Processing Model.
 *
 * Top-down: each element takes the first model of the output being rendered
 * whose predicate holds, else the first such base model, and renders by its
 * behaviour, which decides what of its content to render; a sequence renders
 * each of its models whose predicate holds. Rendering the page,
 * the models of views only add classes, an `omit`, or other params for the same
 * behaviour; the view's CSS keys on them.
 */

import type { Element as HastElement, ElementContent, Properties } from 'hast'

import { select, type Model, type Odd } from '../odd/odd'
import { bool, isPos, seq, str, type Item, type Pos, type Value } from '../odd/xpath'
import { BEHAVIOURS, type Flow } from './behaviours'
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
  /** The ids of the anchors rendered, for the ranges that start at them. */
  anchors: string[]
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

/** Wrap the content in the behaviour's tag; a block set inside phrasing content becomes a span. */
const wrap =
  (tag: string, flow?: Flow): Behaviour =>
  (c) => {
    const [t, props] =
      flow === 'block' && c.phrasing
        ? ['span', { ...c.props, className: [...classes(c.props), 'pm-block'] }]
        : [tag, c.props]
    return h(t, props, c.content(t))
  }

/** How each behaviour renders: the table's own for those that only wrap, written out for the rest. */
const RENDER: Record<string, Behaviour> = {
  ...Object.fromEntries(
    Object.entries(BEHAVIOURS)
      .filter(([, b]) => b.tag)
      .map(([name, b]) => [name, wrap(b.tag!, b.flow)]),
  ),
  omit: () => null,
  metadata: () => null,
  text: (c) => c.content(),
  heading: (c) => wrap(`h${Math.min(6, Math.max(1, Number(str(c.params.level)) || 1))}`, 'block')(c),
  link: (c) => h('a', { ...c.props, href: str(c.params.uri ?? '') }, c.content('a')),
  graphic: (c) => h('img', { ...c.props, src: str(c.params.url ?? ''), alt: '' }),
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
  anchor: (c) => {
    if (!c.props.id) return null
    c.state.anchors.push(String(c.props.id))
    return h('span', c.props)
  },
  /** A line break where the output already starts a line would be an empty line; a labelled one is its label, then the break. */
  break: (c) => {
    const line = str(c.params.type) === 'line'
    if (line && c.atLineStart()) return null
    if (!('label' in c.params)) return h('br', c.props)
    const label = str(c.params.label)
    const span = h('span', c.props, label ? [text(label)] : [])
    return line ? [span, h('br', { ...c.props, id: undefined })] : span
  },
  /**
   * Collected for the apparatus; in the text, a numbered marker when it goes to the end,
   * which closes the range its `range` param names. Collected before its body is
   * rendered, so that a note inside comes after it.
   */
  note: (c) => {
    const note: CollectedNote = { place: 'place' in c.params ? str(c.params.place) : 'end', body: [] }
    c.state.notes.push(note)
    if (note.place === 'end') {
      note.number = c.state.notes.filter((n) => n.place === 'end').length
      note.id = `note-${note.number}` // not `n<number>`: the corpus uses those as xml:id
    }
    note.body = c.content('div')
    if (note.place !== 'end') return null
    return h(
      'a',
      {
        className: ['note-marker', ...classes(c.props)],
        id: `ref-${note.id}`,
        href: `#${note.id}`,
        role: 'doc-noteref',
        'data-note': note.id,
        ...('range' in c.params && { 'data-range': str(c.params.range).replace(/^#/, '') }),
      },
      [text(String(note.number))],
    )
  },
}

function classes(props: Properties): string[] {
  return Array.isArray(props.className) ? props.className.map(String) : []
}

/** Params named `--…` become CSS custom properties of the rendered element, `data-…` its attributes. */
function paramProps(params: Record<string, Value>): Properties {
  const named = (prefix: string) => Object.entries(params).filter(([k]) => k.startsWith(prefix))
  const style = named('--').map(([k, v]) => `${k}: ${str(v)}`).join('; ')
  return { ...Object.fromEntries(named('data-').map(([k, v]) => [k, str(v)])), ...(style ? { style } : {}) }
}

/**
 * The element's attributes: `xml:id` and `xml:lang` as HTML's, the others as `data-*`
 * (`targetEnd` → `data-target-end`); `@rendition` is the model's to use.
 */
function attrMap(node: Element): Properties {
  const props: Properties = {}
  for (const [name, value] of Object.entries(node.attributes ?? {})) {
    if (value == null || name === 'rendition') continue
    if (name === 'xml:id') props.id = value
    else if (name === 'xml:lang') props.lang = value
    else if (name.startsWith('data-')) props[name] = value
    else if (!name.includes(':') && name !== 'xmlns') props[`data-${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`] = value
  }
  return props
}

/** `@rendition="#a #b"` → `['a', 'b']`. */
const renditions = (node: Element) => (attr(node, 'rendition') ?? '').split(/\s+/).filter(Boolean).map((t) => t.replace(/^#/, ''))

export function createRenderer(odd: Odd) {
  for (const [ident, models] of Object.entries(odd.models)) {
    for (const m of models.flatMap((m) => m.sequence ?? [m])) {
      if (!RENDER[m.behaviour]) throw new Error(`${ident}: unknown behaviour "${m.behaviour}"`)
    }
  }
  const outputs = Object.fromEntries(
    Object.entries(odd.models).map(([ident, ms]) => [ident, [...new Set(ms.flatMap((m) => (m.output ? [m.output] : [])))]]),
  )
  /** Nothing but whitespace, or an element its model sets as a block, before this element in its parent. */
  function atLineStart({ node, up }: Pos): boolean {
    const siblings = children(up.at(-1))
    for (let i = siblings.indexOf(node) - 1; i >= 0; i--) {
      const s = siblings[i]
      if (isText(s)) {
        if (s.value?.trim()) return false
      } else if (isElement(s)) return odd.flow(s, up) === 'block'
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

    const pos: Pos = { node, up }
    const models = odd.models[ln] ?? []
    const model = (output && select(models, pos, output)) || select(models, pos)
    if (!model) {
      state.unmapped.add(ln)
      return [h('span', { ...attrMap(node), className: [`tei-${ln}`, 'tei-unmapped'] }, kids('span'))]
    }
    check(node, ln, state)

    const evaluate = (m: Model) => Object.fromEntries(Object.entries(m.params).map(([k, f]) => [k, f(pos)]))
    const value = (v: Value, tag?: string) =>
      seq(v).flatMap((item) =>
        isPos(item) ? render(item.node, item.up, inside(tag), state, output) : String(item) ? [text(String(item))] : [],
      )
    /**
     * The `k`th model of a sequence (or the model); a view's sequence overlays it part by part.
     * After the first part rendered, without the element's id.
     */
    const apply = (model: Model, k: number, again: boolean): ElementContent[] => {
      const views: Record<string, Record<string, Value>> = {}
      const viewClasses: string[] = []
      for (const v of output ? [] : outputs[ln]) {
        const view = select(models, pos, v)
        const m = view?.sequence?.[k] ?? view
        if (m?.behaviour === 'omit') viewClasses.push(`${v}-omit`)
        else if (m?.behaviour === model.behaviour) {
          viewClasses.push(...m.classes)
          views[v] = evaluate(m)
        }
      }
      const params = evaluate(model)
      const source = model.useSourceRendition ? renditions(node).map((r) => `r-${r}`) : []
      const props = {
        className: [`tei-${ln}`, ...model.classes, ...viewClasses, ...source],
        ...attrMap(node),
        ...(again && { id: undefined }),
        ...paramProps(params),
      }
      const out = RENDER[model.behaviour]({
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
    let rendered = 0
    return (model.sequence ?? [model]).flatMap((m, k) =>
      model.sequence && m.predicate && !bool(m.predicate(pos)) ? [] : apply(m, k, rendered++ > 0),
    )
  }

  return (tree: Nodes, state: RenderState, output?: string): ElementContent[] =>
    (tree.type === 'root' ? children(tree) : [tree]).flatMap((node) => render(node as Nodes, [], false, state, output))
}
