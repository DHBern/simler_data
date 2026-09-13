/**
 * The content pipeline: TEI in, HTML out, at build time.
 *
 *     parse()                 string → xast     (build.ts, once per file)
 *     unified()
 *       .use(wsTrim)          xast   → xast     TEI indentation is not text
 *       .use(lineEndHyphens)  xast   → xast     the hyphen at a joined line end
 *       .use(teiToHast)       xast   → hast     the ODD's Processing Model; its
 *                                              `plaintext` output is the search text;
 *                                              commented ranges resolved on the result
 *       .use(rehypeStringify) hast   → string
 *
 * Everything element-specific — which elements are blocks where they stand, how
 * each renders — comes from the ODD. What a render collects lives on the VFile.
 */

import type { Root as HastRoot } from 'hast'
import rehypeStringify from 'rehype-stringify'
import { unified, type Plugin } from 'unified'
import { VFile } from 'vfile'

import { select, type Odd } from '../odd/odd'
import { seq, str } from '../odd/xpath'
import { hastToSearchText } from '../search/text'
import { lineEndHyphens } from './hyphens'
import { wsTrim } from './plugins'
import { resolveRanges } from './ranges'
import { createRenderer, type CollectedNote, type RenderState } from './teiToHast'
import { isElement, localName, type Element, type Root as XastRoot } from './xast'

/** What one render produces. */
export interface RenderResult {
  html: string
  /** The ODD's `plaintext` rendering, for the search index; not yet normalised. */
  text: string
  /** Note bodies, already rendered to HTML, in document order. */
  notes: RenderedNote[]
  warnings: string[]
  /** Elements the ODD has no model for. */
  unmapped: string[]
  /** The params of the root element's `page` model, each as strings. */
  page: Record<string, string[]>
}

export interface RenderedNote extends Omit<CollectedNote, 'body'> {
  html: string
}

/** The output the search indexes. */
const PLAINTEXT = 'plaintext'
/** The output whose params, on the root element, describe the page around the text. */
const PAGE = 'page'

const teiToHast: Plugin<[Odd], XastRoot, HastRoot> = function (odd) {
  const render = createRenderer(odd)
  return (tree, file) => {
    // Notes and findings are the page's; this rendering's go nowhere.
    const scratch: RenderState = { notes: [], warnings: [], unmapped: new Set(), anchors: [] }
    file.data.text = hastToSearchText({ type: 'root', children: render(tree, scratch, PLAINTEXT) })
    const top = tree.children.find((n): n is Element => isElement(n))
    const page = top && select(odd.models[localName(top.name)] ?? [], { node: top, up: [] }, PAGE)
    file.data.page = Object.fromEntries(
      Object.entries(page?.params ?? {}).map(([k, f]) => [k, seq(f({ node: top!, up: [] })).map((item) => str([item]))]),
    )

    const state = file.data.teiState as RenderState
    const root: HastRoot = { type: 'root', children: render(tree, state) }
    // A range lies in the text, or within one note's body.
    const bodies = state.notes.map((n): HastRoot => ({ type: 'root', children: n.body }))
    state.warnings.push(...resolveRanges([root, ...bodies], state.anchors, `${PLAINTEXT}-omit`))
    return root
  }
}

/** The processor for one ODD; frozen, so a build creates it once. */
export function createProcessor(odd: Odd) {
  return unified()
    .use(wsTrim, odd.flow)
    .use(lineEndHyphens, odd.flow)
    .use(teiToHast, odd)
    .use(rehypeStringify)
    .freeze()
}

export function renderTei(tree: XastRoot, processor: ReturnType<typeof createProcessor>): RenderResult {
  const file = new VFile()
  const state: RenderState = { notes: [], warnings: [], unmapped: new Set(), anchors: [] }
  file.data.teiState = state
  const hast = processor.runSync(tree, file) as HastRoot
  return {
    html: processor.stringify(hast, file),
    text: file.data.text as string,
    notes: state.notes.map(({ body, ...rest }) => ({
      ...rest,
      html: processor.stringify({ type: 'root', children: body } as HastRoot, file),
    })),
    warnings: state.warnings,
    unmapped: [...state.unmapped].sort(),
    page: file.data.page as Record<string, string[]>,
  }
}
