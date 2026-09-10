/**
 * The hyphen at a printed line end.  (DTA-Basisformat, `lb/@break="no"`.)
 *
 * `@break="no"` says the word continues across the line end. The reading text joins the
 * word, so an encoded hyphen must go; the diplomatic view restores the break and
 * needs exactly one hyphen, never none, never two. CSS can neither hide nor
 * supply a hyphen inside a text node, so it is removed here and the `<lb/>`
 * records that the print had one.
 *
 * **The hyphen need not touch the break.**
 *
 * **Only a hyphen that is actually joined is removed.**
 * 
 */

import type { Plugin } from 'unified'
import type { VFile } from 'vfile'

import type { RenderState } from './teiToHast'
import {
  attr,
  children,
  isElement,
  isText,
  localName,
  type ElementContent,
  type Nodes,
  type Root,
  type Text,
} from './xast'

/** Hyphen, soft hyphen, not sign, hyphen, non-breaking hyphen, double oblique. */
const HYPHEN = /[-­¬‐‑⸗][ \t]*$/

interface LineEnd {
  /** The text node the line ends in. */
  text: Text
  /** Whitespace-only nodes standing between it and the `<lb/>`. */
  gap: Text[]
}

/**
 * Where the printed line ends — `null` where a block ended it, and so where
 * nothing is joined. Inline elements are looked into: the corpus has
 * `<hi>ge-</hi><lb break="no"/>` as well as bare text.
 */
function lineEnd(list: ElementContent[], before: number, block: Set<string>, gap: Text[] = []): LineEnd | null {
  for (let i = before - 1; i >= 0; i--) {
    const node = list[i]
    if (isText(node)) {
      if (!node.value?.trim()) {
        gap.push(node) // indentation left over from the source
        continue
      }
      return { text: node, gap }
    }
    if (isElement(node)) {
      if (block.has(localName(node.name))) return null
      const kids = children(node) as ElementContent[]
      const inner = lineEnd(kids, kids.length, block, gap)
      if (inner) return inner
    }
  }
  return null
}

/** unified plugin: normalise the hyphen at every joined line end; `block` from the ODD. */
export const lineEndHyphens: Plugin<[Set<string>], Root, Root> = function (block) {
  return function transformer(tree: Root, file?: VFile): Root {
    /** `<lb/>` with no `@break`, but a hyphen before it: `@break="no"` is missing. */
    let unmarked = 0

    function walk(node: Nodes): void {
      if (!('children' in node) || !Array.isArray(node.children)) return
      const list = node.children as ElementContent[]

      for (const [i, child] of list.entries()) {
        if (!isElement(child, 'lb')) continue
        const end = lineEnd(list, i, block)
        if (!end || !HYPHEN.test(end.text.value ?? '')) continue

        if (attr(child, 'break') !== 'no') {
          unmarked++ // an editorial finding, not something to guess at
          continue
        }
        end.text.value = end.text.value.replace(HYPHEN, '')
        for (const space of end.gap) space.value = ''
        // Not an editorial addition, then: the stylesheet sets the hyphen in ink
        // rather than in the muted colour it uses for one it supplies itself.
        child.attributes = { ...child.attributes, 'data-hyphen': 'source' }
      }

      for (const child of children(node)) walk(child as Nodes)
    }
    walk(tree)

    // The word is left broken in two rather than joined on a guess: only
    // `@break="no"` says the print meant it to continue.
    const state = file?.data.teiState as RenderState | undefined
    if (state && unmarked > 0) {
      state.warnings.push(
        `${unmarked}× Trennstrich am Zeilenende ohne <lb break="no"/> — das Wort bleibt getrennt`,
      )
    }
    return tree
  }
}
