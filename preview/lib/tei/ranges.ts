/**
 * Commented ranges, resolved on the rendered output.
 *
 * An element carrying `data-range` (a note's marker) is one end of a range; the
 * element with that id (an anchor) is the other. Every text between the two is
 * wrapped, across any element boundary, so what the ODD rendered stays as it is:
 *
 *     Jch wil/ von <anchor xml:id="a1"/>L<note targetEnd="a1">…</note>ieb ſingen;
 *
 * Text an output leaves out (`skip`, e.g. forme work) is part of a range only when
 * the range starts or ends within it.
 */

import type { Element, Root, Text } from 'hast'

import { h } from './teiToHast'

type Parent = Root | Element

/** Wraps the ranges of each tree on its own; returns the findings for what did not resolve. */
export function resolveRanges(trees: Parent[], anchors: string[], skip: string): string[] {
  const unresolved: string[] = []
  const referenced = new Set<string>()

  for (const tree of trees) {
    // `within`: the skipped element a text or range end lies in.
    const leaves: { node: Text; parent: Parent; within?: Element }[] = []
    const starts = new Map<string, { at: number; within?: Element }>()
    const ends: { id: string; note: string; at: number; within?: Element }[] = []

    const walk = (parent: Parent, within?: Element) => {
      for (const node of parent.children) {
        if (node.type === 'text') leaves.push({ node, parent, within })
        if (node.type !== 'element') continue
        const { id, className, 'data-range': range, 'data-note': note } = node.properties
        if (id != null) starts.set(String(id), { at: leaves.length, within })
        if (range != null) ends.push({ id: String(range), note: String(note), at: leaves.length, within })
        else walk(node, within ?? (Array.isArray(className) && className.includes(skip) ? node : undefined))
      }
    }
    walk(tree)

    for (const end of ends) {
      referenced.add(end.id)
      const start = starts.get(end.id)
      if (start === undefined) {
        unresolved.push(end.id)
        continue
      }
      const between = leaves.slice(Math.min(start.at, end.at), Math.max(start.at, end.at))
      for (const leaf of between.filter((l) => !l.within || l.within === start.within || l.within === end.within)) {
        const range = h('span', { className: ['note-range'], 'data-note': end.note }, [leaf.node])
        leaf.parent.children[leaf.parent.children.indexOf(leaf.node)] = range
        leaf.parent = range
      }
    }
  }

  const orphans = anchors.filter((id) => !referenced.has(id))
  return [
    ...(unresolved.length ? [`Kommentierter Bereich ohne Anfangspunkt: ${unresolved.join(', ')}`] : []),
    ...(orphans.length ? [`Anker, auf den keine Anmerkung zeigt: ${orphans.join(', ')}`] : []),
  ]
}
