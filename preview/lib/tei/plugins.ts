/**
 * xast → xast transforms that run before the tree is converted to hast.
 */

import type { Plugin } from 'unified'

import {
  attr,
  children,
  isElement,
  isText,
  localName,
  type Nodes,
  type Root,
  type RootContent,
} from './xast'

export interface WsTrimOptions {
  /** Elements the ODD renders inline, and as blocks. */
  inline: Set<string>
  block: Set<string>
}

/**
 * TEI-aware whitespace normalisation.
 */
export const wsTrim: Plugin<[WsTrimOptions], Root, Root> = function ({ inline, block }) {

  const isBlock = (node: RootContent | undefined): boolean =>
    node !== undefined && isElement(node) && block.has(localName(node.name))

  /** Is this whitespace-only node the file's indentation rather than a space? */
  function isIndentation(node: Nodes, parent: Nodes | undefined): boolean {
    // Between the top-level nodes of the document there is no running text.
    if (!parent || !isElement(parent)) return true
    // Inside an inline element every space is the text's own.
    if (inline.has(localName(parent.name))) return false

    const siblings = children(parent)
    const at = siblings.indexOf(node as RootContent)
    const before = at > 0 ? siblings[at - 1] : undefined
    const after = at >= 0 ? siblings[at + 1] : undefined
    // At the edge of a block, or against one: indentation either way.
    return before === undefined || after === undefined || isBlock(before) || isBlock(after)
  }

  function walk(node: Nodes, ancestors: Nodes[]): Nodes | null {
    if (ancestors.some((a) => isElement(a) && attr(a, 'xml:space') === 'preserve')) return node

    if (isText(node)) {
      let value = node.value ?? ''
      if (/^\s+$/.test(value)) {
        if (isIndentation(node, ancestors.at(-1))) return null
      }
      value = value.replace(/\s+/g, ' ')
      return { ...node, value }
    }

    if ('children' in node && Array.isArray(node.children)) {
      const next = [...ancestors, node]
      const kept = node.children
        .map((child) => walk(child as Nodes, next))
        .filter((child): child is RootContent => child !== null)
      return { ...node, children: kept } as Nodes
    }

    return node
  }

  return function transformer(tree: Root): Root {
    return (walk(tree, []) as Root | null) ?? tree
  }
}
