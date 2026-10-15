/**
 * Regions between two milestones, resolved on the rendered output.
 *
 * An element whose `data-region` is `start` opens a region, the next whose `data-region`
 * is `end` closes it, as `<cb type="start"/>` … `<cb type="end"/>` bracket a column set.
 * What stands between moves into the start, which becomes a `div` and keeps its classes,
 * so the ODD styles the region; the end goes. Where the two stand at different depths,
 * each element between a marker and their common ancestor is split at the marker, the
 * part after it a copy without the id.
 */

import type { Element, ElementContent, Root } from 'hast'

type Parent = Root | Element

/** The path from the root to each element with a `data-region`, in document order. */
function markers(tree: Root): Element[][] {
  const found: Element[][] = []
  const walk = (node: Parent, path: Element[]) => {
    for (const child of node.children) {
      if (child.type !== 'element') continue
      if (child.properties['data-region'] != null) found.push([...path, child])
      walk(child, [...path, child])
    }
  }
  walk(tree, [])
  return found
}

const pathTo = (tree: Root, node: Element) => markers(tree).find((p) => p.at(-1) === node)!

/** Moves the marker at the end of `path` up into `path[depth]`, splitting each element between. */
function lift(tree: Root, path: Element[], depth: number) {
  const node = path.at(-1)!
  for (let i = path.length - 2; i > depth; i--) {
    const p = path[i]
    const up: Parent = i ? path[i - 1] : tree
    const at = p.children.indexOf(node)
    const after = p.children.slice(at + 1)
    const rest: ElementContent[] = after.length ? [{ ...p, properties: { ...p.properties, id: undefined }, children: after }] : []
    p.children = p.children.slice(0, at)
    up.children.splice(up.children.indexOf(p) + (at ? 1 : 0), at ? 0 : 1, node, ...rest)
    if (!at && rest.length) (rest[0] as Element).properties.id = p.properties.id
  }
}

/** Wraps each region; returns the findings for markers without a partner. */
export function resolveRegions(tree: Root): string[] {
  const all = markers(tree).map((p) => p.at(-1)!)
  let unpaired = 0
  for (let i = 0; i < all.length; i++) {
    const [start, end] = [all[i], all[i + 1]]
    if (start.properties['data-region'] !== 'start' || end?.properties['data-region'] !== 'end') {
      unpaired++
      continue
    }
    i++
    const [a, b] = [pathTo(tree, start), pathTo(tree, end)]
    let depth = 0
    while (a[depth] === b[depth] && depth < Math.min(a.length, b.length) - 1) depth++
    depth--
    lift(tree, a, depth)
    lift(tree, pathTo(tree, end), depth)
    const parent: Parent = depth < 0 ? tree : pathTo(tree, start)[depth]
    const s = parent.children.indexOf(start)
    const e = parent.children.indexOf(end)
    start.tagName = 'div'
    start.children = parent.children.splice(s + 1, e - s - 1) as ElementContent[]
    parent.children.splice(parent.children.indexOf(end), 1)
  }
  return unpaired ? [`Bereichsmarke ohne Gegenstück (${unpaired}×)`] : []
}
