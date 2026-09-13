/**
 * The ODD, read once per build. Its Processing Model becomes the element map;
 * its `<tagsDecl>` and `<outputRendition>`s become the stylesheet.
 *
 * CSS selectors: a spec's only model (or model group) styles `.tei-<ident>`;
 * otherwise each styled model gets its `@cssClass`, or `<ident>-<n>`. Models
 * with `@output` style a view, scoped to `[data-<output>='on']`; an `omit` there
 * hides the element in that view.
 */

import { fromXml } from 'xast-util-from-xml'

import { attr, elementChildren, findFirst, localName, textOf, type Element } from '../tei/xast'
import { bool, compileXPath, type Pos, type XPath } from './xpath'

export interface Model {
  behaviour: string
  predicate?: XPath
  /** The view this model restyles; undefined for the base rendering. */
  output?: string
  params: Record<string, XPath>
  /** Classes the rendered element carries for this model's CSS. */
  classes: string[]
}

export interface Odd {
  models: Record<string, Model[]>
  /** Whether an element, where it stands, renders as a block or inline: by the base model it takes. */
  flow: (node: Element, up: Element[]) => 'block' | 'inline' | undefined
  /** Suggested and closed values, by element and attribute. */
  values: Record<string, Record<string, Set<string>>>
  /** Rendition ids declared in `<tagsDecl>`. */
  renditions: Set<string>
  css: string
}

const BLOCK = new Set(['block', 'section', 'paragraph', 'heading', 'list', 'listItem', 'cit', 'text'])
const INLINE = new Set(['inline', 'note', 'anchor', 'break', 'alternate'])

/** The first model of `output` (unset: the base models) whose predicate holds. */
export const select = (models: Model[], pos: Pos, output?: string) =>
  models.find((m) => m.output === output && (!m.predicate || bool(m.predicate(pos))))

const tokens = (el: Element | undefined, name: string) => (el ? attr(el, name) ?? '' : '').split(/\s+/).filter(Boolean)

/** A `<rendition>` or `<outputRendition>` as a CSS rule; `@scope` is a pseudo-element. */
const rule = (selector: string, r: Element) =>
  `${selector}${attr(r, 'scope') ? `::${attr(r, 'scope')}` : ''} { ${textOf(r).trim()} }`
const rules = (el: Element, selector: string) => elementChildren(el, 'outputRendition').map((r) => rule(selector, r))

export function readOdd(xml: string): Odd {
  const tree = fromXml(xml)
  const odd: Odd = {
    models: {},
    flow: (node, up) => {
      const behaviour = select(odd.models[localName(node.name)] ?? [], { node, up })?.behaviour ?? ''
      return BLOCK.has(behaviour) ? 'block' : INLINE.has(behaviour) ? 'inline' : undefined
    },
    values: {},
    renditions: new Set(),
    css: '',
  }
  const css = [
    '.pm-block { display: block; }', // a block set inside phrasing content renders as a span
    '.pm-alternate { display: none; }',
  ]
  const views = new Set<string>()

  for (const r of elementChildren(findFirst(tree, 'tagsDecl'), 'rendition')) {
    const id = attr(r, 'xml:id')!
    odd.renditions.add(id)
    css.push(rule(`.r-${id}`, r))
  }

  for (const spec of elementChildren(findFirst(tree, 'schemaSpec'), 'elementSpec')) {
    const ident = attr(spec, 'ident')!
    const entries = elementChildren(spec).filter((e) => /^model(Grp|Sequence)?$/.test(localName(e.name)))
    const models: Model[] = []
    const view: string[] = []

    entries.forEach((entry, g) => {
      const kind = localName(entry.name)
      if (kind === 'modelSequence') throw new Error(`${ident}: modelSequence is not supported`)
      const group = kind === 'modelGrp' ? entry : undefined
      const sole = entries.length === 1
      const groupClass = group && !sole ? tokens(group, 'cssClass')[0] ?? `${ident}-g${g + 1}` : undefined
      if (group) css.push(...rules(group, sole ? `.tei-${ident}` : `.${groupClass}`))

      for (const m of group ? elementChildren(group, 'model') : [entry]) {
        const where = `${ident}, model ${models.length + 1}`
        const compile = (expr: string) => {
          try {
            return compileXPath(expr)
          } catch (error) {
            throw new Error(`${where}: ${(error as Error).message}`)
          }
        }
        const predicate = attr(m, 'predicate')
        const output = attr(m, 'output') ?? (group && attr(group, 'output'))
        const own = tokens(m, 'cssClass')
        const styled = elementChildren(m, 'outputRendition').length > 0
        const bare = sole && !group && !predicate && !output
        const cls = styled && !bare ? own[0] ?? `${ident}-${models.length + 1}` : undefined
        if (styled) {
          const selector = bare ? `.tei-${ident}` : `.${cls}`
          ;(output ? view : css).push(...rules(m, output ? `[data-${output}='on'] ${selector}` : selector))
        }
        if (output) views.add(output)
        models.push({
          behaviour: attr(m, 'behaviour') ?? fail(`${where}: no @behaviour`),
          predicate: predicate ? compile(predicate) : undefined,
          output: output || undefined,
          params: Object.fromEntries(elementChildren(m, 'param').map((p) => [attr(p, 'name')!, compile(attr(p, 'value') ?? "''")])),
          classes: [...new Set([...(groupClass ? [groupClass] : []), ...own, ...(cls ? [cls] : [])])],
        })
      }
    })
    css.push(...view)

    if (models.length) odd.models[ident] = models

    for (const def of elementChildren(elementChildren(spec, 'attList')[0], 'attDef')) {
      const items = elementChildren(findFirst(def, 'valList'), 'valItem').map((v) => attr(v, 'ident')!)
      if (items.length) (odd.values[ident] ??= {})[attr(def, 'ident')!] = new Set(items)
    }
  }

  for (const v of views) {
    css.push(
      `[data-${v}='on'] .${v}-omit { display: none; }`,
      `[data-${v}='on'] .pm-alt.${v}-default { display: inline; }`,
      `[data-${v}='on'] .pm-alt.${v}-alternate { display: none; }`,
    )
  }
  odd.css = `/* Generated from tei_simler.odd — edit the ODD, not this file. */\n${css.join('\n')}\n`
  return odd
}

function fail(message: string): never {
  throw new Error(message)
}
