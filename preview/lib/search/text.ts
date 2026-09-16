/**
 * The search text: the ODD's `plain` rendering, flattened. What the index
 * leaves out is the ODD's to say; here only word boundaries are decided.
 */

import type { ElementContent, Root as HastRoot } from 'hast'

/** Stands for a word boundary while the text is assembled; the text itself has no newline. */
const BREAK = '\n'

/** Only phrasing markup continues a word — not a block the renderer set as a span. */
function breaksWord(node: ElementContent): boolean {
  if (node.type !== 'element') return false
  const className = node.properties?.className
  const pmBlock = Array.isArray(className) && className.includes('pm-block')
  return pmBlock || (node.tagName !== 'span' && node.tagName !== 'a')
}

export function hastToSearchText(tree: HastRoot | ElementContent): string {
  const parts: string[] = []

  const walk = (node: HastRoot | ElementContent): void => {
    if (node.type === 'text') parts.push(node.value)
    const boundary = node.type !== 'root' && breaksWord(node)
    if (boundary) parts.push(BREAK)
    if ('children' in node) for (const child of node.children) walk(child as ElementContent)
    if (boundary) parts.push(BREAK)
  }

  walk(tree)
  // A hyphen at a line end stays: the tree has said whether the word continues — a joined
  // line end leaves neither hyphen nor boundary behind, any other one leaves both.
  return parts.join('').replace(/\s+/g, ' ').trim()
}
