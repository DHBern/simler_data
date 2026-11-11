/**
 * hast → HTML. The renderer makes every tree itself, so this covers what it makes:
 * elements and text, and properties named as their attributes but for the few in NAMES.
 */

import type { Properties, Root, RootContent } from 'hast'

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'])

/** hast's names for the attributes the renderer writes that differ from HTML's. */
const NAMES: Record<string, string> = { className: 'class', colSpan: 'colspan', rowSpan: 'rowspan' }

const reference = (c: string) => `&#x${c.codePointAt(0)!.toString(16).toUpperCase()};`

function attributes(properties: Properties = {}): string {
  return Object.entries(properties)
    .filter(([, v]) => v != null && v !== false)
    .map(([k, v]) => {
      const name = NAMES[k] ?? k
      if (v === true) return ` ${name}`
      const value = Array.isArray(v) ? v.join(' ') : String(v)
      return ` ${name}="${value.replace(/[\0"&'`]/g, reference)}"`
    })
    .join('')
}

export function toHtml(node: Root | RootContent): string {
  if (node.type === 'text') return node.value.replace(/[<&]/g, reference)
  if (node.type === 'root') return node.children.map(toHtml).join('')
  if (node.type !== 'element') return ''
  const open = `<${node.tagName}${attributes(node.properties)}>`
  return VOID.has(node.tagName) ? open : `${open}${node.children.map(toHtml).join('')}</${node.tagName}>`
}
