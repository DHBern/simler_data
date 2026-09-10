/**
 * The walker: xast (TEI) → hast (HTML).
 */

import type { Element as HastElement, ElementContent, Properties } from 'hast'
import { resolveTeiOptions, type TeiOptions } from './options'
import { children, isElement, isText, localName, type Element, type Nodes } from './xast'

export type { HastElement, ElementContent }

/** Collected during one render, in document order. */
export interface RenderState {
  /** Note bodies, already converted, in the order their markers appear. */
  notes: CollectedNote[]
  /** `pb/@facs` values seen, in order. */
  pages: string[]
  /** Anything the editors should know about. */
  warnings: string[]
  /**
   * Display labels for page breaks, keyed by `@facs` — supplied by the caller.
   */
  pageLabels?: Record<string, string>
  /**
   * `rs/@key` → where that entity's register entry lives and what it is called.
   * Supplied by the caller: the element map must not know what a URL looks like.
   */
  entityRefs?: Record<string, { href: string; label: string; registerLabel: string }>
}

export interface CollectedNote {
  /**
   * `note-1`, `note-2`, … — the id of the endnote and the target of the marker.
   */
  id: string
  /** 1-based sequence number, what the marker prints. */
  number: number
  /** `annotation`, `bibl`, `speaker`, … */
  type: string | null
  /** True when the note was anchored to a range (Stellenkommentar). */
  ranged: boolean
  body: ElementContent[]
}

export interface HandlerContext {
  node: Element
  /** Local name, namespace prefix stripped. */
  ln: string
  /** TEI attributes mapped to HTML properties. */
  props: Properties
  /** Children, already converted. */
  children: ElementContent[]
  /** Enclosing TEI elements, outermost first. */
  ancestors: Element[]
  state: RenderState
  options: TeiOptions
}

export type TeiHandler = (ctx: HandlerContext) => ElementContent | ElementContent[] | null
export type HandlerMap = Record<string, TeiHandler>

// ── hast construction ───────────────────────────────────────────────────────

export function h(
  tagName: string,
  properties: Properties = {},
  content: ElementContent[] = [],
): HastElement {
  return { type: 'element', tagName, properties, children: content }
}

export function text(value: string): ElementContent {
  return { type: 'text', value }
}

/**
 * TEI attributes → HTML properties.
 */
const MIRRORED_ATTRIBUTES = [
  'type', 'n', 'place', 'key', 'facs', 'corresp', 'reason', 'cert', 'unit', 'break', 'ref',
]

export function attrMap(node: Element): Properties {
  const attributes = node.attributes ?? {}
  const props: Properties = {}
  const classNames: string[] = []

  for (const [name, value] of Object.entries(attributes)) {
    if (value == null) continue
    if (name === 'xml:id') props.id = value
    else if (name === 'xml:lang') props.lang = value
    else if (name === 'rendition') {
      // `#aq #b` → the classes `r-aq r-b`, styled by renditions.css.
      for (const token of value.split(/\s+/).filter(Boolean)) {
        classNames.push(`r-${token.replace(/^#/, '')}`)
      }
    } else if (name.startsWith('data-')) props[name] = value
    else if (MIRRORED_ATTRIBUTES.includes(name)) props[`data-${name}`] = value
  }

  if (classNames.length) props.className = classNames
  return props
}

/**
 * Merge extra class names onto properties produced by {@link attrMap}.
 * `className` is placed first so the serialised HTML reads `<span class="…"
 * data-…>` — the order a person scanning view-source expects.
 */
export function withClass(props: Properties, ...names: string[]): Properties {
  const existing = Array.isArray(props.className) ? (props.className as string[]) : []
  const { className: _replaced, ...rest } = props
  return { className: [...names, ...existing], ...rest }
}

// ── the walker ──────────────────────────────────────────────────────────────

export interface TeiToHastOptions extends Partial<TeiOptions> {
  handlers: HandlerMap
  state?: RenderState
}

export function emptyState(): RenderState {
  return { notes: [], pages: [], warnings: [] }
}

function convert(
  node: Nodes,
  handlers: HandlerMap,
  ancestors: Element[],
  state: RenderState,
  options: TeiOptions,
): ElementContent[] {
  if (isText(node)) return node.value ? [text(node.value)] : []
  if (!isElement(node)) return [] // comments, PIs, doctype

  const nextAncestors = [...ancestors, node]
  const converted = children(node).flatMap((child) =>
    convert(child as Nodes, handlers, nextAncestors, state, options),
  )

  const ln = localName(node.name)
  const handler = handlers[ln] ?? handlers['*']
  if (!handler) return converted

  const result = handler({
    node,
    ln,
    props: attrMap(node),
    children: converted,
    ancestors,
    state,
    options,
  })
  if (result == null) return []
  return Array.isArray(result) ? result : [result]
}

/**
 * Convert a TEI subtree to hast. Accepts a document root or a single element.
 */
export function teiToHast(
  tree: Nodes,
  options: TeiToHastOptions,
): { children: ElementContent[]; state: RenderState } {
  const resolved = resolveTeiOptions(options)
  const state = options.state ?? emptyState()
  const roots = tree.type === 'root' ? (children(tree) as Nodes[]) : [tree]
  const out = roots.flatMap((node) => convert(node, options.handlers, [], state, resolved))
  return { children: out, state }
}
