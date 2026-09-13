/**
 * The content pipeline: TEI in, HTML out, at build time.
 *
 *     unified()
 *       .use(xastParse)       string → xast     (xast-util-from-xml)
 *       .use(wsTrim)          xast   → xast     TEI indentation is not text
 *       .use(lineEndHyphens)  xast   → xast     the hyphen at a joined line end
 *       .use(noteRanges)      xast   → xast     <anchor>…<note @targetEnd> → <noteRange>
 *       .use(teiToHast)       xast   → hast     the ODD's Processing Model; its
 *                                              `plaintext` output is the search text
 *       .use(rehypeStringify) hast   → string
 *
 * Everything element-specific — which elements are blocks, how each renders —
 * comes from the ODD. What a render collects lives on the VFile.
 */

import type { Root as HastRoot } from 'hast'
import rehypeStringify from 'rehype-stringify'
import { unified, type Plugin } from 'unified'
import { VFile } from 'vfile'
import { fromXml } from 'xast-util-from-xml'

import type { Odd } from '../odd/odd'
import { hastToSearchText } from '../search/text'
import { lineEndHyphens } from './hyphens'
import { noteRanges } from './noteRanges'
import { wsTrim } from './plugins'
import { createRenderer, type CollectedNote, type RenderState } from './teiToHast'
import type { Root as XastRoot } from './xast'

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
}

export interface RenderedNote extends Omit<CollectedNote, 'body'> {
  html: string
}

const xastParse: Plugin<[], XastRoot> = function () {
  const self = this as unknown as { parser: (doc: string) => XastRoot }
  self.parser = (doc: string) => fromXml(doc)
}

/** The output the search indexes. */
const PLAINTEXT = 'plaintext'

const teiToHast: Plugin<[Odd], XastRoot, HastRoot> = function (odd) {
  const render = createRenderer(odd)
  return (tree, file) => {
    // Notes and findings are the page's; this rendering's go nowhere.
    const scratch: RenderState = { notes: [], warnings: [], unmapped: new Set() }
    file.data.text = hastToSearchText({ type: 'root', children: render(tree, scratch, PLAINTEXT) })
    return { type: 'root', children: render(tree, file.data.teiState as RenderState) }
  }
}

/** The processor for one ODD; frozen, so a build creates it once. */
export function createProcessor(odd: Odd) {
  return unified()
    .use(xastParse)
    .use(wsTrim, { inline: odd.inlines, block: odd.blocks })
    .use(lineEndHyphens, odd.blocks)
    .use(noteRanges)
    .use(teiToHast, odd)
    .use(rehypeStringify)
    .freeze()
}

export function renderTei(xml: string, processor: ReturnType<typeof createProcessor>): RenderResult {
  const file = new VFile({ value: xml })
  const state: RenderState = { notes: [], warnings: [], unmapped: new Set() }
  file.data.teiState = state
  const hast = processor.runSync(processor.parse(file) as XastRoot, file) as HastRoot
  return {
    html: processor.stringify(hast, file),
    text: file.data.text as string,
    notes: state.notes.map(({ body, ...rest }) => ({
      ...rest,
      html: processor.stringify({ type: 'root', children: body } as HastRoot, file),
    })),
    warnings: state.warnings,
    unmapped: [...state.unmapped].sort(),
  }
}
