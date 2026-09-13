/**
 * xast → xast transforms that run before the tree is converted to hast.
 */

import type { Plugin } from 'unified'

import type { Odd } from '../odd/odd'
import {
  attr,
  children,
  isElement,
  isText,
  type Element,
  type Nodes,
  type Root,
  type RootContent,
} from './xast'

/**
 * TEI-aware whitespace normalisation; `flow` from the ODD says which elements,
 * where they stand, render as blocks or inline.
 */
export const wsTrim: Plugin<[Odd['flow']], Root, Root> = function (flow) {

  /** Is this whitespace-only node the file's indentation rather than a space? */
  function isIndentation(node: Nodes, ancestors: Nodes[]): boolean {
    const parent = ancestors.at(-1)
    // Between the top-level nodes of the document there is no running text.
    if (!parent || !isElement(parent)) return true
    const up = ancestors.filter((a): a is Element => isElement(a))
    // Inside an inline element every space is the text's own.
    if (flow(parent, up.slice(0, -1)) === 'inline') return false

    const siblings = children(parent)
    const at = siblings.indexOf(node as RootContent)
    const isBlock = (n: RootContent | undefined) => n !== undefined && isElement(n) && flow(n, up) === 'block'
    const [before, after] = [siblings[at - 1], siblings[at + 1]]
    // At the edge of a block, or against one: indentation either way.
    return before === undefined || after === undefined || isBlock(before) || isBlock(after)
  }

  function walk(node: Nodes, ancestors: Nodes[]): Nodes | null {
    if (ancestors.some((a) => isElement(a) && attr(a, 'xml:space') === 'preserve')) return node

    if (isText(node)) {
      let value = node.value ?? ''
      if (/^\s+$/.test(value)) {
        if (isIndentation(node, ancestors)) return null
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
