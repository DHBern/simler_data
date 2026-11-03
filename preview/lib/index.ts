/**
 * A TEI Processing Model interpreter: read an ODD, and render TEI by it at build time.
 *
 *     const odd = readOdd(await readFile(oddPath, 'utf8'), { tokensCss })
 *     const result = renderTei(parse(xml), createProcessor(odd))
 *
 * `result` carries the page, as HTML and as hast, the `plain` text the search index is built from, the
 * notes for the apparatus, the `page` model's params, and the findings. What the ODD
 * itself says wrong is on `odd.findings`, what the rendering reached on `odd.reached`,
 * which `coverage` reads back.
 *
 * Published compiled (`npm pack` builds `dist/`). Its own imports name the file they
 * mean (`./odd/odd.ts`), so the source also runs as it is, under a TypeScript loader.
 */

// The ODD: the Processing Model, the stylesheet it compiles to, and what is wrong in it.
export { coverage, readOdd, select, selectOutput } from './odd/odd.ts'
export type { Model, Odd, ReadOddOptions, View } from './odd/odd.ts'

// The XPath subset predicates and params are written in.
export { bool, compileXPath, isPos, seq, str } from './odd/xpath.ts'
export type { Item, Pos, Value, XPath } from './odd/xpath.ts'

// TEI in, HTML out.
export { createProcessor, renderTei } from './tei/render.ts'
export type { Processor, RenderResult, RenderedNote } from './tei/render.ts'
export { toHtml } from './tei/html.ts'
export { BEHAVIOURS } from './tei/behaviours.ts'
export type { BehaviourSpec, Flow } from './tei/behaviours.ts'
export { h, text } from './tei/teiToHast.ts'
export type { Behaviour, BehaviourContext, CollectedNote, Decision, RenderState } from './tei/teiToHast.ts'

// What is reported, as data.
export { finding } from './findings.ts'
export type { Finding, FindingCode, Severity } from './findings.ts'

// The document itself: parsing, and what no XML tool would accept in it.
export { attr, children, findAll, findFirst, idFindings, isElement, isText, localName, parse, plainText, textOf } from './tei/xast.ts'
export type { Element, Root } from './tei/xast.ts'

// The search text.
export { hastToSearchText } from './search/text.ts'
