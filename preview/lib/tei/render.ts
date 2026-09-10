/**
 * The content pipeline: TEI in, HTML out, at build time.
 *
 *     unified()
 *       .use(xastParse)     string → xast     (xast-util-from-xml)
 *       .use(dropHeader)    xast   → xast     metadata is not running text
 *       .use(wsTrim)        xast   → xast     TEI indentation is not text
 *       .use(lineEndHyphens) xast  → xast     the hyphen at a joined line end
 *       .use(noteRanges)    xast   → xast     <anchor>…<note @targetEnd> → <noteRange>
 *       .use(teiToHastPlugin) xast → hast     the element map in handlers.ts
 *       .use(rehypeStringify) hast → string
 *
 * The processor is frozen once and reused; what a single render collects —
 * notes, page breaks, warnings — lives on the VFile, which is what `file.data`
 * is for.
 */

import rehypeStringify from 'rehype-stringify'
import { unified, type Plugin, type Processor } from 'unified'
import { VFile } from 'vfile'
import { fromXml } from 'xast-util-from-xml'
import type { Root as HastRoot } from 'hast'

import { hastToSearchText } from '../search/text'
import { handlers as defaultHandlers } from './handlers'
import { lineEndHyphens } from './hyphens'
import { noteRanges } from './noteRanges'
import { resolveTeiOptions, type TeiOptions } from './options'
import { dropHeader, wsTrim, wsTrimOptionsFrom } from './plugins'
import {
  emptyState,
  teiToHast,
  type CollectedNote,
  type HandlerMap,
  type RenderState,
} from './teiToHast'
import type { Element, Root as XastRoot } from './xast'

/** What one render produces. */
export interface RenderResult {
  /** The unit's HTML, ready for `set:html`. */
  html: string
  /**
   * The same text as plain characters, for the search index.
   *
   * Taken from the hast tree rather than from the HTML string, so the apparatus
   * — note markers above all — can be left out before it corrupts a word. Not
   * yet normalised; that is the indexer's job.
   */
  text: string
  /** Note bodies, already rendered to HTML, in marker order. */
  notes: RenderedNote[]
  /** `pb/@facs` values encountered, in document order. */
  pages: string[]
  warnings: string[]
}

export interface RenderedNote extends Omit<CollectedNote, 'body'> {
  html: string
}

/** unified parser: XML text → xast. */
const xastParse: Plugin<[], XastRoot> = function () {
  const self = this as unknown as { parser: (doc: string) => XastRoot }
  self.parser = (doc: string) => fromXml(doc)
}

interface TeiToHastPluginOptions {
  handlers: HandlerMap
  teiOptions: TeiOptions
}

/** unified transformer: xast → hast, collecting state on the file. */
const teiToHastPlugin: Plugin<[TeiToHastPluginOptions], XastRoot, HastRoot> = function (options) {
  return function transformer(tree: XastRoot, file: VFile): HastRoot {
    const state = (file.data.teiState as RenderState | undefined) ?? emptyState()
    const { children } = teiToHast(tree, {
      ...options.teiOptions,
      handlers: options.handlers,
      state,
    })
    file.data.teiState = state
    return { type: 'root', children }
  }
}

export interface CreateProcessorOptions extends Partial<TeiOptions> {
  handlers?: HandlerMap
}

export function createProcessor(options: CreateProcessorOptions = {}) {
  const teiOptions = resolveTeiOptions(options)
  return unified()
    .use(xastParse)
    .use(dropHeader)
    .use(wsTrim, wsTrimOptionsFrom(teiOptions))
    .use(lineEndHyphens)
    .use(noteRanges)
    .use(teiToHastPlugin, { handlers: options.handlers ?? defaultHandlers, teiOptions })
    .use(rehypeStringify)
    .freeze()
}

/** The shared, frozen processor. Per-render state lives on the VFile, not here. */
const processor = createProcessor()

type AnyProcessor = Processor<any, any, any, any, string>

export interface RenderOptions {
  /** Display labels for page breaks, keyed by `pb/@facs`. */
  pageLabels?: Record<string, string>
  /** Register targets for entity references, keyed by `rs/@key`. */
  entityRefs?: RenderState['entityRefs']
  /** Override the shared processor — used to render with a different handler map. */
  processor?: AnyProcessor
}

function startFile(options: RenderOptions, value?: string): VFile {
  const file = value === undefined ? new VFile() : new VFile({ value })
  file.data.teiState = {
    ...emptyState(),
    pageLabels: options.pageLabels,
    entityRefs: options.entityRefs,
  }
  return file
}

function finish(hast: HastRoot, file: VFile, proc: AnyProcessor): RenderResult {
  const state = (file.data.teiState as RenderState | undefined) ?? emptyState()
  const notes: RenderedNote[] = state.notes.map(({ body, ...rest }) => ({
    ...rest,
    html: proc.stringify({ type: 'root', children: body } as HastRoot, file),
  }))
  return {
    html: proc.stringify(hast, file),
    text: hastToSearchText(hast),
    notes,
    pages: state.pages,
    warnings: state.warnings,
  }
}

/** Render a whole TEI document. */
export function renderTei(xml: string, options: RenderOptions = {}): RenderResult {
  const proc = options.processor ?? processor
  const file = startFile(options, xml)
  const hast = proc.runSync(proc.parse(file), file) as HastRoot
  return finish(hast, file, proc)
}

/**
 * Render one subtree — a reading unit sliced out of a document parsed once. The
 * node is deep-cloned first: `noteRanges` rewrites in place, and the caller's
 * parsed document is shared across every unit of the same file.
 */
export function renderNode(node: Element, options: RenderOptions = {}): RenderResult {
  const proc = options.processor ?? processor
  const file = startFile(options)
  const root: XastRoot = { type: 'root', children: [structuredClone(node)] }
  const hast = proc.runSync(root, file) as HastRoot
  return finish(hast, file, proc)
}
