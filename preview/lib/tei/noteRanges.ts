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
import type { VFile } from 'vfile'

import type { RenderState } from './teiToHast'
import {
  attr,
  children,
  findAll,
  isElement,
  type Element,
  type ElementContent,
  type Nodes,
  type Root,
} from './xast'

/** Local name of the synthetic element this transform introduces. */
export const NOTE_RANGE = 'noteRange'

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
function rewriteSiblings(list: ElementContent[], unresolved: string[]): ElementContent[] {
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
      unresolved.push(id)
      i--
      continue
    }

    // Replace [anchor, …ranged…, note] with [noteRange(…ranged…), note]. Where several
    // notes comment on one range, it ends before the first of them.
    const first = list.findIndex(
      (n, k) => k > anchorIndex && isElement(n, 'note') && attr(n, 'targetEnd')?.replace(/^#/, '') === id,
    )
    list.splice(anchorIndex, first - anchorIndex, makeRange(id, list.slice(anchorIndex + 1, first)))
    // Its notes now follow the range and are done; resume before the range.
    i = anchorIndex - 1
  }
  return list
}

/** unified plugin: rewrite anchor/note pairs into `<noteRange>` wrappers. */
export const noteRanges: Plugin<[], Root, Root> = function () {
  return function transformer(tree: Root, file?: VFile): Root {
    const unresolved: string[] = []

    function walk(node: Nodes): void {
      if (!('children' in node) || !Array.isArray(node.children)) return
      node.children = rewriteSiblings(node.children as ElementContent[], unresolved)
      for (const child of children(node)) walk(child as Nodes)
    }
    walk(tree)

    // What is left of the anchors after the walk is what no range consumed.
    const targets = new Set(findAll(tree, 'note').map((n) => (attr(n, 'targetEnd') ?? '').replace(/^#/, '')))
    const orphans = findAll(tree, 'anchor').flatMap((a) => attr(a, 'xml:id') ?? []).filter((id) => !targets.has(id))
    const state = file?.data.teiState as RenderState | undefined
    if (state && unresolved.length) {
      state.warnings.push(`note/@targetEnd ohne <anchor> davor im selben Element: ${unresolved.join(', ')}`)
    }
    if (state && orphans.length) state.warnings.push(`<anchor> ohne <note targetEnd>: ${orphans.join(', ')}`)
    return tree
  }
}
