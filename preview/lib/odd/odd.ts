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

import { BEHAVIOURS } from '../tei/behaviours.ts'
import { attr, elementChildren, findFirst, localName, parse, textOf, type Element } from '../tei/xast.ts'
import { bool, compileXPath, type Pos, type XPath } from './xpath.ts'

export interface Model {
  /** `<ident>-<n>`, by the model's place among its element's: what reports and records name it by. */
  id: string
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
  /** What is wrong in the ODD itself, each once: unreadable expressions, and what the checks below found. */
  findings: Set<string>
  /** What the rendering reached, filled as it runs: the models that fired, and the elements walked. */
  reached: { models: Set<string>; elements: Set<string>; unmodelled: Set<string> }
  /** The outputs laid over the page, each named by the first `<desc>` of its models: the reading switches. */
  views: View[]
}

export interface View {
  output: string
  label: string
  /** A second `<desc>`, where the ODD explains the view. */
  title?: string
}

/** A param a behaviour does not read is a typo — unless it is a custom property or an attribute. */
const readsParam = (behaviour: string, name: string) =>
  behaviour === 'metadata' ||
  name === 'content' ||
  /^(--|data-)/.test(name) ||
  (BEHAVIOURS[behaviour]?.params ?? []).includes(name)

/** The name of the page's own output: a model may mark itself for it, or leave `@output` off. */
const WEB = 'web'
/** Outputs that render on their own, rather than as a view over the page. */
const ALONE = [WEB, 'page', 'plain']

/** Where a view is on: the page says so, or its switch is checked — which needs no script. */
const on = (output: string) => `:is([data-${output}='on'], :root:has(#view-${output}:checked))`

/** The first model of `output` (unset: the models without one) whose predicate holds. */
export const select = (models: Model[], pos: Pos, output?: string) =>
  models.find((m) => m.output === output && (!m.predicate || bool(m.predicate(pos))))

/** What renders in `output`, the page when unset: that output's models, else the models without one. */
export const selectOutput = (models: Model[], pos: Pos, output = WEB) =>
  select(models, pos, output) ?? select(models, pos)

const tokens = (el: Element | undefined, name: string) => (el ? attr(el, name) ?? '' : '').split(/\s+/).filter(Boolean)

/** A `<rendition>` or `<outputRendition>` as a CSS rule; `@scope` is a pseudo-element. */
const rule = (selector: string, r: Element) =>
  `${selector}${attr(r, 'scope') ? `::${attr(r, 'scope')}` : ''} { ${textOf(r).trim()} }`
const rules = (el: Element, selector: string) => elementChildren(el, 'outputRendition').map((r) => rule(selector, r))

export function readOdd(xml: string, tokensCss = ''): Odd {
  const tree = parse(xml)
  /** An element's answer, once: where it stands does not change. */
  const cached = new WeakMap<Element, ReturnType<Odd['flow']>>()
  const odd: Odd = {
    models: {},
    flow: (node, up) => {
      if (cached.has(node)) return cached.get(node)
      const m = selectOutput(odd.models[localName(node.name)] ?? [], { node, up })
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
    findings: new Set(),
    reached: { models: new Set(), elements: new Set(), unmodelled: new Set() },
    views: [],
  }
  /** Custom properties the models set, which the ODD's CSS may then read. */
  const properties = new Set<string>()
  const css = [
    '.pm-block { display: block; }', // a block set inside phrasing content renders as a span
    '.pm-alternate { display: none; }',
  ]
  /** Each output over the page, and the `<desc>`s of the first of its models that has any. */
  const views = new Map<string, string[]>()

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
        const id = `${ident}-${models.length + 1}`
        const where = `Modell ${id}`
        /**
         * An expression that cannot be read, or that fails where it is evaluated, counts as empty —
         * what a failed evaluation gives anyway: the predicate is false, the param has no value.
         * One document renders without it, rather than none at all.
         */
        const compile = (expr: string, what: string): XPath => {
          const empty = (error: unknown) => {
            odd.findings.add(`${where}: ${what} nicht auswertbar, gilt als leer — ${(error as Error).message}`)
            return []
          }
          let evaluate: XPath
          try {
            evaluate = compileXPath(expr)
          } catch (error) {
            return () => empty(error)
          }
          return (pos) => {
            try {
              return evaluate(pos)
            } catch (error) {
              return empty(error)
            }
          }
        }
        const inherited = (name: string) => attr(m, name) ?? (outer && attr(outer, name)) ?? (group && attr(group, name))
        const predicate = attr(m, 'predicate')
        const output = inherited('output')
        const own = tokens(m, 'cssClass')
        const styled = elementChildren(m, 'outputRendition').length > 0
        const bare = sole && !group && !outer && !predicate && !output
        const cls = styled && !bare ? own[0] ?? fail(`${where}: ein gestaltetes Modell unter mehreren braucht @cssClass`) : undefined
        // A `web` model belongs to the page itself, so its CSS is the page's, not a view's.
        const overlay = output && !ALONE.includes(output) ? output : undefined
        if (styled) {
          const selector = bare ? `.tei-${ident}` : `.${cls}`
          ;(overlay ? view : css).push(...rules(m, overlay ? `${on(overlay)} ${selector}` : selector))
        }
        if (output && output !== WEB) {
          const descs = elementChildren(m, 'desc').map((d) => textOf(d).replace(/\s+/g, ' ').trim())
          if (!views.get(output)?.length) views.set(output, descs)
        }
        const sequence = localName(m.name) === 'modelSequence' ? elementChildren(m, 'model').map((part) => read(part, m)) : undefined
        const behaviour = sequence ? 'modelSequence' : attr(m, 'behaviour') ?? fail(`${where}: kein @behaviour`)
        const params = elementChildren(m, 'param').map((p) => ({ name: attr(p, 'name')!, value: attr(p, 'value') ?? "''" }))
        for (const { name } of params) {
          if (name.startsWith('--')) properties.add(name)
          if (!readsParam(behaviour, name)) odd.findings.add(`${where}: "${behaviour}" liest den Parameter "${name}" nicht`)
        }
        return {
          id,
          behaviour,
          predicate: predicate ? compile(predicate, 'Prädikat') : undefined,
          output: output || undefined,
          params: Object.fromEntries(params.map(({ name, value }) => [name, compile(value, `Parameter "${name}"`)])),
          classes: [...new Set([...(groupClass ? [groupClass] : []), ...own, ...(cls ? [cls] : [])])],
          useSourceRendition: inherited('useSourceRendition') === 'true',
          sequence,
        }
      }
      const members = group ? elementChildren(group).filter((e) => /^model(Sequence)?$/.test(localName(e.name))) : [entry]
      for (const m of members) models.push(read(m))
    })
    css.push(...view)

    // A model is only reached while every earlier one of its output has a predicate.
    const decides = new Map<string, string>()
    for (const m of models) {
      const output = m.output ?? ''
      const earlier = decides.get(output)
      if (earlier) odd.findings.add(`Modell ${m.id}: nie erreichbar, ${earlier} entscheidet schon`)
      else if (!m.predicate) decides.set(output, m.id)
    }

    if (models.length) odd.models[ident] = models

    for (const def of elementChildren(elementChildren(spec, 'attList')[0], 'attDef')) {
      const items = elementChildren(findFirst(def, 'valList'), 'valItem').map((v) => attr(v, 'ident')!)
      if (items.length) (odd.values[ident] ??= {})[attr(def, 'ident')!] = new Set(items)
    }
  }

  for (const v of views.keys()) {
    css.push(
      `${on(v)} .${v}-omit { display: none; }`,
      `${on(v)} .pm-alt.${v}-default { display: inline; }`,
      `${on(v)} .pm-alt.${v}-alternate { display: none; }`,
    )
  }
  odd.views = [...views]
    .filter(([output]) => !ALONE.includes(output))
    .map(([output, [label, title]]) => ({ output, label: label || output, title }))
  odd.css = `/* Generated from the ODD — edit the ODD, not this file. */\n${css.join('\n')}\n`

  // A custom property the CSS reads is defined by the design tokens, by the CSS itself, or by a param.
  const defined = new Set([...`${tokensCss}\n${odd.css}`.matchAll(/(--[\w-]+)\s*:/g)].map(([, name]) => name))
  for (const [, name] of odd.css.matchAll(/var\((--[\w-]+)/g)) {
    if (!defined.has(name) && !properties.has(name)) odd.findings.add(`CSS: ${name} ist nirgends definiert`)
  }
  return odd
}

function fail(message: string): never {
  throw new Error(message)
}

/**
 * What the ODD says that never ran, and what the corpus holds that it never handled —
 * read off what the rendering reached. Over every output at once: a model that fires
 * in the search text earns its place as much as one that fires on the page.
 */
export function coverage(odd: Odd): string[] {
  const { models, elements, unmodelled } = odd.reached
  const out: string[] = []
  for (const [ident, list] of Object.entries(odd.models)) {
    if (!elements.has(ident)) out.push(`<${ident}>: im Korpus nicht vorgekommen, ${list.length} Modell(e) ungenutzt`)
    else for (const m of list) if (!models.has(m.id)) out.push(`Modell ${m.id}: greift nie`)
  }
  for (const name of unmodelled) {
    out.push(
      odd.models[name]
        ? `<${name}>: Modelle vorhanden, keines trifft zu`
        : `<${name}>: kein Modell in der ODD`,
    )
  }
  return out.sort((a, b) => a.localeCompare(b, 'de'))
}
