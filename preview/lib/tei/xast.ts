/** The xast (XML AST) the pipeline works on, and small helpers over it. */

import { parseXml, XmlElement, XmlText, type XmlNode } from '@rgrove/parse-xml'
import type { Element, ElementContent, Nodes, Parents, Root, RootContent, Text } from 'xast'

export type { Element, ElementContent, Nodes, Parents, Root, RootContent, Text }

declare module 'xast' {
  interface TextData {
    /** The text as encoded, where a transform changed what renders. */
    source?: string
  }
}

/**
 * XML → xast: elements and text, all the pipeline reads. Without source positions,
 * which cost `xast-util-from-xml` more than the rest of a build. Attribute values
 * are tokens and pointers, so a line break in one is not part of it.
 */
export function parse(xml: string): Root {
  const tokens = (attributes: Record<string, string>) =>
    Object.fromEntries(Object.entries(attributes).map(([k, v]) => [k, v.replace(/\s+/g, ' ').trim()]))
  const convert = (node: XmlNode): ElementContent[] =>
    node instanceof XmlElement
      ? [{ type: 'element', name: node.name, attributes: tokens(node.attributes), children: node.children.flatMap(convert) }]
      : node instanceof XmlText
        ? [{ type: 'text', value: node.text }]
        : []
  return { type: 'root', children: parseXml(xml).children.flatMap(convert) }
}

/** Strip a namespace prefix: `tei:head` → `head`. */
export function localName(qname: string | null | undefined): string {
  if (!qname) return ''
  const colon = qname.indexOf(':')
  return colon === -1 ? qname : qname.slice(colon + 1)
}

export function isElement(node: unknown, name?: string): node is Element {
  const n = node as Nodes | undefined
  if (n?.type !== 'element') return false
  return !name || localName(n.name) === name
}

export function isText(node: unknown): node is Text {
  return (node as Nodes | undefined)?.type === 'text'
}

export function children(node: unknown): RootContent[] {
  const n = node as Parents | undefined
  return n && 'children' in n && Array.isArray(n.children) ? (n.children as RootContent[]) : []
}

export function attr(node: Element, name: string): string | undefined {
  const value = node.attributes?.[name]
  return value ?? undefined
}

/** Element children with the given local name. */
export function elementChildren(node: unknown, name?: string): Element[] {
  return children(node).filter((c): c is Element => isElement(c, name))
}

/** All descendant elements with the given local name, in document order. */
export function findAll(node: unknown, name: string, acc: Element[] = []): Element[] {
  for (const child of children(node)) {
    if (isElement(child, name)) acc.push(child)
    findAll(child, name, acc)
  }
  return acc
}

/** First descendant element with the given local name. */
export function findFirst(node: unknown, name: string): Element | undefined {
  for (const child of children(node)) {
    if (isElement(child, name)) return child
    const hit = findFirst(child, name)
    if (hit) return hit
  }
  return undefined
}

/** Flattened text content of a subtree, as encoded. */
export function textOf(node: unknown): string {
  if (!node) return ''
  if (isText(node)) return node.data?.source ?? node.value ?? ''
  return children(node).map(textOf).join('')
}

/** Flattened text content, whitespace collapsed and trimmed. */
export function plainText(node: unknown): string {
  return textOf(node).replace(/\s+/g, ' ').trim()
}
