/**
 * The hyphen at a printed line end.  (DTA-Basisformat, `lb/@break="no"`.)
 *
 * A joined line end, as the ODD has it (`odd.joins`), says the word continues across
 * the line end. The reading text joins the word, so an encoded hyphen must go; the
 * diplomatic view restores the break and needs exactly one hyphen, never none, never
 * two. CSS can neither hide nor supply a hyphen inside a text node, so it is removed
 * from what renders; the ODD's predicates still see the text as encoded, and the
 * break's `label` sets the print's hyphen. A hyphen at any other line end stays: the
 * ODD's Schematron asks about it.
 *
 * **The hyphen need not touch the break.**
 *
 * **Only a hyphen that is actually joined is removed.**
 *
 * **Neither side of a joined break is a space**, however the source is indented.
 */

import type { Plugin } from 'unified'

import type { Odd } from '../odd/odd.ts'
import {
  children,
  isElement,
  isText,
  type Element,
  type ElementContent,
  type Nodes,
  type Root,
  type Text,
} from './xast.ts'

/** Hyphen, soft hyphen, not sign, hyphen, non-breaking hyphen, double oblique. */
const HYPHEN = /[-­¬‐‑⸗][ \t]*$/

interface LineEdge {
  /** The text node the line ends (or starts) in. */
  text: Text
  /** Whitespace-only nodes standing between it and the `<lb/>`. */
  gap: Text[]
}

/** unified plugin: normalise the hyphen at every joined line end; `flow` and `joins` from the ODD. */
export const lineEndHyphens: Plugin<[Pick<Odd, 'flow' | 'joins'>], Root, Root> = function ({ flow, joins }) {
  /**
   * Where the printed line ends before `from` (`step` -1), or the next one starts
   * after it (`step` 1) — `null` where a block is in between, and so where nothing
   * is joined. Inline elements are looked into: the corpus has
   * `<hi>ge-</hi><lb break="no"/>` as well as bare text.
   */
  function lineEdge(list: ElementContent[], from: number, step: 1 | -1, up: Element[], gap: Text[] = []): LineEdge | null {
    for (let i = from + step; i >= 0 && i < list.length; i += step) {
      const node = list[i]
      if (isText(node)) {
        if (!node.value?.trim()) {
          gap.push(node) // indentation left over from the source
          continue
        }
        return { text: node, gap }
      }
      if (isElement(node)) {
        if (flow(node, up) === 'block') return null
        const kids = children(node) as ElementContent[]
        const inner = lineEdge(kids, step > 0 ? -1 : kids.length, step, [...up, node], gap)
        if (inner) return inner
      }
    }
    return null
  }

  return function transformer(tree: Root): Root {
    function walk(node: Nodes, up: Element[]): void {
      if (!('children' in node) || !Array.isArray(node.children)) return
      const list = node.children as ElementContent[]
      const inner = isElement(node) ? [...up, node] : up

      for (const [i, child] of list.entries()) {
        if (!isElement(child) || !joins(child, inner)) continue
        const end = lineEdge(list, i, -1, inner)
        const start = lineEdge(list, i, 1, inner)
        if (end && HYPHEN.test(end.text.value ?? '')) {
          end.text.data = { ...end.text.data, source: end.text.value }
          end.text.value = end.text.value.replace(HYPHEN, '')
        }
        if (end) end.text.value = end.text.value.trimEnd()
        if (start) start.text.value = start.text.value.trimStart()
        for (const space of [...(end?.gap ?? []), ...(start?.gap ?? [])]) space.value = ''
      }

      for (const child of children(node)) walk(child as Nodes, inner)
    }
    walk(tree, [])
    return tree
  }
}
