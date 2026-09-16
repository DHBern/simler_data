/**
 * The Processing Model's behaviours, as data: the HTML element a behaviour wraps
 * its content in, and whether it renders as a block or inline.
 *
 * A behaviour with a tag does nothing but wrap, so the walker builds it from this
 * table; the others are written out in `teiToHast`. The flow decides where the
 * source's indentation is insignificant and where a line break is already
 * implied, which is asked before anything is rendered — hence a table both the
 * ODD and the walker read, rather than a second list of block-level behaviours.
 */

export type Flow = 'block' | 'inline'

export interface BehaviourSpec {
  /** The HTML element, for a behaviour that only wraps its content. */
  tag?: string
  /** Neither, for the behaviours that render nothing. */
  flow?: Flow
}

export const BEHAVIOURS: Record<string, BehaviourSpec> = {
  document: { tag: 'article', flow: 'block' },
  body: { tag: 'div', flow: 'block' },
  section: { tag: 'section', flow: 'block' },
  block: { tag: 'div', flow: 'block' },
  paragraph: { tag: 'p', flow: 'block' },
  list: { tag: 'ul', flow: 'block' },
  listItem: { tag: 'li', flow: 'block' },
  cit: { tag: 'blockquote', flow: 'block' },
  table: { tag: 'table', flow: 'block' },
  row: { tag: 'tr', flow: 'block' },
  cell: { tag: 'td', flow: 'block' },
  inline: { tag: 'span', flow: 'inline' },
  title: { tag: 'span', flow: 'inline' },
  glyph: { tag: 'span', flow: 'inline' },
  heading: { flow: 'block' },
  text: { flow: 'block' },
  note: { flow: 'inline' },
  alternate: { flow: 'inline' },
  break: { flow: 'inline' },
  anchor: { flow: 'inline' },
  link: { flow: 'inline' },
  graphic: { flow: 'inline' },
  metadata: {},
  omit: {},
}
