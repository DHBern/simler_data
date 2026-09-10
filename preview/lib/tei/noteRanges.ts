/**
 * Resolve TEI standoff note ranges.
 *
 * Simler anchors a note to a *span* of text with a pair: an empty `<anchor>`
 * opens the range, a `<note @targetEnd>` pointing back at it closes it.
 *
 *     Jch wil/ von <anchor xml:id="a1"/>L<note targetEnd="a1">…</note>ieb ſingen;
 *
 * The split falls **inside the word** *Lieb* — which is why the search index has
 * to strip anchors before tokenising, and why the range cannot be modelled as a
 * nested element in the source. Each pair is rewritten into one synthetic
 * `<noteRange>` around the ranged content, the `<note>` staying in place for
 * `teiToHast` to turn into a marker. Notes with no `@targetEnd` are
 * Überblickskommentare: they stay where they are and render as a block.
 */

import type { Plugin } from 'unified'

import {
  attr,
  children,
  isElement,
  type Element,
  type ElementContent,
  type Nodes,
  type Root,
} from './xast'

/** Local name of the synthetic element this transform introduces. */
export const NOTE_RANGE = 'noteRange'

export interface NoteRangeReport {
  /** `@targetEnd` values whose `<anchor>` was not found among the note's siblings. */
  unresolved: string[]
  /** Ranges successfully wrapped. */
  resolved: number
}

function makeRange(id: string, content: ElementContent[]): Element {
  return {
    type: 'element',
    name: NOTE_RANGE,
    attributes: { 'data-note': id },
    children: content,
  }
}

/**
 * Rewrite anchor/note pairs within one parent's child list.
 *
 * Both members must be siblings — that is how the corpus encodes them, and a
 * range crossing an element boundary could not be wrapped in one element anyway.
 * Pairs that do not resolve are reported and left alone: the note still renders,
 * just without an underlined range.
 */
function rewriteSiblings(list: ElementContent[], report: NoteRangeReport): ElementContent[] {
  // Right to left, so a splice never disturbs an index still to be examined.
  let i = list.length - 1
  while (i >= 0) {
    const note = list[i]
    if (!isElement(note, 'note')) {
      i--
      continue
    }
    const targetEnd = attr(note, 'targetEnd')
    if (!targetEnd) {
      i--
      continue
    }

    const id = targetEnd.replace(/^#/, '')
    let anchorIndex = -1
    for (let j = i - 1; j >= 0; j--) {
      const candidate = list[j]
      if (isElement(candidate, 'anchor') && attr(candidate, 'xml:id') === id) {
        anchorIndex = j
        break
      }
    }
    if (anchorIndex === -1) {
      report.unresolved.push(targetEnd)
      i--
      continue
    }

    // Replace [anchor, …ranged…, note] with [noteRange(…ranged…), note].
    const ranged = list.slice(anchorIndex + 1, i)
    list.splice(anchorIndex, i - anchorIndex, makeRange(id, ranged))
    report.resolved++
    // The note now sits at anchorIndex + 1 and is done; resume before the range.
    i = anchorIndex - 1
  }
  return list
}

/** unified plugin: rewrite anchor/note pairs into `<noteRange>` wrappers. */
export const noteRanges: Plugin<[], Root, Root> = function () {
  return function transformer(tree: Root, file?: { data?: Record<string, unknown> }): Root {
    const report: NoteRangeReport = { unresolved: [], resolved: 0 }

    function walk(node: Nodes): void {
      if (!('children' in node) || !Array.isArray(node.children)) return
      node.children = rewriteSiblings(node.children as ElementContent[], report)
      for (const child of children(node)) walk(child as Nodes)
    }
    walk(tree)

    if (file) file.data = { ...file.data, noteRanges: report }
    return tree
  }
}
