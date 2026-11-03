/**
 * The content pipeline: TEI in, HTML out, at build time.
 *
 *     parse()            string → xast     (build.ts, once per file)
 *     wsTrim             xast   → xast     TEI indentation is not text
 *     lineEndHyphens     xast   → xast     the hyphen at a joined line end
 *     createRenderer     xast   → hast     the ODD's Processing Model; its `plain`
 *                                          output is the search text; regions and
 *                                          commented ranges resolved on the result
 *     toHtml             hast   → string
 *
 * Everything element-specific — which elements are blocks where they stand, how
 * each renders — comes from the ODD.
 */

import type { Root as HastRoot } from 'hast'

import type { Finding } from '../findings.ts'
import { select, type Odd } from '../odd/odd.ts'
import { seq, str } from '../odd/xpath.ts'
import { hastToSearchText } from '../search/text.ts'
import { toHtml } from './html.ts'
import { lineEndHyphens } from './hyphens.ts'
import { resolveRanges } from './ranges.ts'
import { resolveRegions } from './regions.ts'
import { createRenderer, type CollectedNote, type Decision, type RenderState } from './teiToHast.ts'
import { wsTrim } from './whitespace.ts'
import { isElement, localName, type Element, type Root as XastRoot } from './xast.ts'

/** What one render produces. */
export interface RenderResult {
  html: string
  /** The same page as a tree, for a consumer that maps elements to its own components. */
  hast: HastRoot
  /** The ODD's `plain` rendering, for the search index; not yet normalised. */
  text: string
  /** Note bodies, already rendered to HTML, in document order. */
  notes: RenderedNote[]
  warnings: Finding[]
  /** Elements the ODD has no model for. */
  unmapped: string[]
  /** The params of the root element's `page` model, each as strings. */
  page: Record<string, string[]>
  /** What the ODD decided for each element, where the caller asked for it. */
  decisions?: Decision
}

export interface RenderedNote extends Omit<CollectedNote, 'body'> {
  html: string
  hast: HastRoot
}

/** The output the search indexes. */
const PLAINTEXT = 'plain'
/** The output whose params, on the root element, describe the page around the text. */
const PAGE = 'page'

export interface Processor {
  odd: Odd
  render: ReturnType<typeof createRenderer>
}

/** The processor for one ODD, so a build creates it once. */
export const createProcessor = (odd: Odd): Processor => ({ odd, render: createRenderer(odd) })

export function renderTei(source: XastRoot, { odd, render }: Processor, decisions = false): RenderResult {
  const tree = lineEndHyphens(wsTrim(source, odd.flow), odd)

  // Notes and findings are the page's; this rendering's go nowhere.
  const scratch: RenderState = { notes: [], warnings: [], unmapped: new Set(), anchors: [] }
  const text = hastToSearchText({ type: 'root', children: render(tree, scratch, PLAINTEXT) })
  const top = tree.children.find((n): n is Element => isElement(n))
  const pageModel = top && select(odd.models[localName(top.name)] ?? [], { node: top, up: [] }, PAGE)
  if (pageModel) odd.reached.models.add(pageModel.id)
  const page = Object.fromEntries(
    Object.entries(pageModel?.params ?? {}).map(([k, f]) => [k, seq(f({ node: top!, up: [] })).map((item) => str([item]))]),
  )

  const state: RenderState = { notes: [], warnings: [], unmapped: new Set(), anchors: [] }
  // The document's own decision is the one below this, which only holds it.
  const collected: Decision = { element: '#document', model: null, behaviour: null, classes: [], children: [] }
  if (decisions) state.open = collected
  const hast: HastRoot = { type: 'root', children: render(tree, state) }
  state.warnings.push(...resolveRegions(hast))
  // A range lies in the text, or within one note's body.
  const bodies = state.notes.map((n): HastRoot => ({ type: 'root', children: n.body }))
  state.warnings.push(...resolveRanges([hast, ...bodies], state.anchors, `${PLAINTEXT}-omit`))

  return {
    html: toHtml(hast),
    hast,
    text,
    notes: state.notes.map(({ body, ...rest }, i) => ({ ...rest, html: toHtml(bodies[i]), hast: bodies[i] })),
    warnings: state.warnings,
    unmapped: [...state.unmapped].sort(),
    page,
    decisions: collected.children.find((c): c is Decision => typeof c !== 'string'),
  }
}
