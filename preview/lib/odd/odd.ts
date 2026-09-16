/**
 * The ODD, read once per build. Its Processing Model becomes the element map;
 * its `<tagsDecl>` and `<outputRendition>`s become the stylesheet.
 *
 * CSS selectors: a spec's only model (or model group) styles `.tei-<ident>`;
 * otherwise a model group styles `.<ident>-group`, and a styled model its
 * `@cssClass`, which it must have: a class the frontend can rely on. Models
 * with `@output` style a view, scoped to `[data-<output>='on']`; an `omit` there
 * hides the element in that view.
 */

import { BEHAVIOURS } from '../tei/behaviours'
import { attr, elementChildren, findFirst, localName, parse, textOf, type Element } from '../tei/xast'
import { bool, compileXPath, type Pos, type XPath } from './xpath'

export interface Model {
  behaviour: string
  predicate?: XPath
  /** The view this model restyles; undefined for the base rendering. */
  output?: string
  params: Record<string, XPath>
  /** Classes the rendered element carries for this model's CSS. */
  classes: string[]
  /** Whether the element's `@rendition` styles it too. */
  useSourceRendition: boolean
  /** A `modelSequence`'s models: each whose predicate holds renders, one after the other. */
  sequence?: Model[]
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

/** The first model of `output` (unset: the base models) whose predicate holds. */
export const select = (models: Model[], pos: Pos, output?: string) =>
  models.find((m) => m.output === output && (!m.predicate || bool(m.predicate(pos))))

const tokens = (el: Element | undefined, name: string) => (el ? attr(el, name) ?? '' : '').split(/\s+/).filter(Boolean)

/** A `<rendition>` or `<outputRendition>` as a CSS rule; `@scope` is a pseudo-element. */
const rule = (selector: string, r: Element) =>
  `${selector}${attr(r, 'scope') ? `::${attr(r, 'scope')}` : ''} { ${textOf(r).trim()} }`
const rules = (el: Element, selector: string) => elementChildren(el, 'outputRendition').map((r) => rule(selector, r))

export function readOdd(xml: string): Odd {
  const tree = parse(xml)
  /** An element's answer, once: where it stands does not change. */
  const cached = new WeakMap<Element, ReturnType<Odd['flow']>>()
  const odd: Odd = {
    models: {},
    flow: (node, up) => {
      if (cached.has(node)) return cached.get(node)
      const m = select(odd.models[localName(node.name)] ?? [], { node, up })
      // Within a sequence, `text` is literal content, not a container.
      const kinds = m?.sequence?.map((p) => p.behaviour).filter((b) => b !== 'text') ?? [m?.behaviour ?? '']
      const flows = kinds.map((b) => BEHAVIOURS[b]?.flow)
      const flow = flows.includes('block') ? 'block' : flows.every((f) => f === 'inline') ? 'inline' : undefined
      cached.set(node, flow)
      return flow
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
      const group = localName(entry.name) === 'modelGrp' ? entry : undefined
      const sole = entries.length === 1
      const earlier = entries.slice(0, g).filter((e) => localName(e.name) === 'modelGrp').length
      const groupClass = group && !sole ? `${ident}-group${earlier ? earlier + 1 : ''}` : undefined
      if (group) css.push(...rules(group, sole ? `.tei-${ident}` : `.${groupClass}`))

      /** A model, or a sequence of them; `outer` is the sequence a model belongs to. */
      const read = (m: Element, outer?: Element): Model => {
        const where = `${ident}, model ${models.length + 1}`
        const compile = (expr: string) => {
          try {
            return compileXPath(expr)
          } catch (error) {
            throw new Error(`${where}: ${(error as Error).message}`)
          }
        }
        const inherited = (name: string) => attr(m, name) ?? (outer && attr(outer, name)) ?? (group && attr(group, name))
        const predicate = attr(m, 'predicate')
        const output = inherited('output')
        const own = tokens(m, 'cssClass')
        const styled = elementChildren(m, 'outputRendition').length > 0
        const bare = sole && !group && !outer && !predicate && !output
        const cls = styled && !bare ? own[0] ?? fail(`${where}: a styled model among others needs @cssClass`) : undefined
        if (styled) {
          const selector = bare ? `.tei-${ident}` : `.${cls}`
          ;(output ? view : css).push(...rules(m, output ? `[data-${output}='on'] ${selector}` : selector))
        }
        if (output) views.add(output)
        const sequence = localName(m.name) === 'modelSequence' ? elementChildren(m, 'model').map((part) => read(part, m)) : undefined
        return {
          behaviour: sequence ? 'modelSequence' : attr(m, 'behaviour') ?? fail(`${where}: no @behaviour`),
          predicate: predicate ? compile(predicate) : undefined,
          output: output || undefined,
          params: Object.fromEntries(elementChildren(m, 'param').map((p) => [attr(p, 'name')!, compile(attr(p, 'value') ?? "''")])),
          classes: [...new Set([...(groupClass ? [groupClass] : []), ...own, ...(cls ? [cls] : [])])],
          useSourceRendition: inherited('useSourceRendition') === 'true',
          sequence,
        }
      }
      const members = group ? elementChildren(group).filter((e) => /^model(Sequence)?$/.test(localName(e.name))) : [entry]
      for (const m of members) models.push(read(m))
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
