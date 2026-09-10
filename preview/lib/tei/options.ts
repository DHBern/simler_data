/**
 * Configuration surface for the TEI pipeline.
 */

/** Canonical TEI P5 namespace URI. */
export const TEI_NS = 'http://www.tei-c.org/ns/1.0'

/**
 * Elements that appear inline in the text flow.
 */
export const INLINE_ELEMENTS = [
  'abbr', 'add', 'anchor', 'bibl', 'choice', 'corr', 'date', 'del', 'emph',
  'expan', 'foreign', 'gap', 'hi', 'lb', 'mentioned', 'milestone', 'name',
  'note', 'num', 'orig', 'orgName', 'pc', 'persName', 'placeName', 'ptr', 'q',
  'ref', 'reg', 'roleName', 'rs', 'seg', 'sic', 'supplied', 'term', 'title',
  'unclear',
] as const

/**
 * Elements whose output is block-level.
 */
export const BLOCK_ELEMENTS = [
  'body', 'closer', 'div', 'figure', 'front', 'fw', 'head', 'item', 'l', 'lg',
  'list', 'p', 'postscript', 'signed', 'salute', 'dateline', 'titlePage',
  'titlePart', 'docTitle', 'docImprint', 'text', 'trailer', 'epigraph', 'byline',
] as const

/** The six `rs/@type` values the ODD admits. */
export const ENTITY_TYPES = ['person', 'place', 'org', 'institution', 'work', 'bibl'] as const
export type EntityType = (typeof ENTITY_TYPES)[number]

export interface TeiOptions {
  /** Namespace URI treated as TEI. */
  teiNamespace: string
  /** Extra inline element local-names, merged into {@link INLINE_ELEMENTS}. */
  inlineElements: string[]
  /** Drop whitespace-only text nodes that are direct children of block elements. */
  removeWhitespaceOnlyText: boolean
  /** Collapse runs of spaces/tabs to a single space and normalise edges. */
  collapseWhitespace: boolean
  /** Render `<head>` as `<h1>`–`<h6>` from `<div>` nesting, or as a plain block. */
  headingLevels: boolean
  /** Heading level of the outermost `<head>`; deeper divisions step down from it. */
  headingBase: number
}

export const defaultTeiOptions: TeiOptions = {
  teiNamespace: TEI_NS,
  inlineElements: [],
  removeWhitespaceOnlyText: true,
  collapseWhitespace: true,
  headingLevels: true,
  headingBase: 2,
}

export function resolveTeiOptions(user: Partial<TeiOptions> = {}): TeiOptions {
  return { ...defaultTeiOptions, ...user }
}
