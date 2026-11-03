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

import { finding, type Finding, type FindingCode } from '../findings.ts'
import { BEHAVIOURS, type BehaviourSpec } from '../tei/behaviours.ts'
import { attr, elementChildren, findAll, findFirst, localName, parse, plainText, textOf, type Element } from '../tei/xast.ts'
import { bool, compileXPath, str, type Pos, type XPath } from './xpath.ts'

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
  /** The `modelGrp` the model belongs to, by the group's place in its spec. */
  group?: number
}

export interface Odd {
  models: Record<string, Model[]>
  /** Whether an element, where it stands, renders as a block or inline: by the base model it takes. */
  flow: (node: Element, up: Element[]) => 'block' | 'inline' | undefined
  /** At a joined line end, the last characters of its text that go: the param `join` of the element's base model; else undefined. */
  joins: (node: Element, up: Element[]) => string | undefined
  /** Whether the `plain` output, the search text, leaves the element out: page furniture, the apparatus. */
  silent: (node: Element, up: Element[]) => boolean
  /** Suggested and closed values, by element and attribute. */
  values: Record<string, Record<string, Set<string>>>
  /** Rendition ids declared in `<tagsDecl>`. */
  renditions: Set<string>
  css: string
  /** What is wrong in the ODD itself, each once: unreadable expressions, and what the checks below found. */
  findings: Finding[]
  /** The behaviours its models may name: the Processing Model's, and the project's own. */
  behaviours: Record<string, BehaviourSpec>
  /** What the rendering reached, filled as it runs: the models that fired, and the elements walked. */
  reached: { models: Set<string>; elements: Set<string>; unmodelled: Set<string> }
  /** The outputs laid over the page, each named by the first `<desc>` of its models: the reading switches. */
  views: View[]
  /** The header's `<availability>`: the terms of the ODD, and so of everything generated from it. */
  availability?: { text: string; licence?: string }
}

export interface ReadOddOptions {
  /** The stylesheet the ODD's CSS reads its custom properties from, for checking them. */
  tokensCss?: string
  /** Behaviours to add, or to replace those of the Processing Model. */
  behaviours?: Record<string, BehaviourSpec>
}

export interface View {
  output: string
  label: string
  /** A second `<desc>`, where the ODD explains the view. */
  title?: string
}

/** A param a behaviour does not read is a typo — unless it is a custom property or an attribute. */
const readsParam = (behaviours: Odd['behaviours'], behaviour: string, name: string) =>
  behaviour === 'metadata' ||
  name === 'content' ||
  name === 'join' ||
  /^(--|data-)/.test(name) ||
  (behaviours[behaviour]?.params ?? []).includes(name)

/** The name of the page's own output: a model may mark itself for it, or leave `@output` off. */
const WEB = 'web'
/** Outputs that render on their own, rather than as a view over the page. */
const PLAIN = 'plain'
const ALONE = [WEB, 'page', PLAIN]

/** Where a view is on: the page says so, or its switch is checked — which needs no script. */
const on = (output: string) => `:is([data-${output}='on'], :root:has(#view-${output}:checked))`

/**
 * The first model of `output` (unset: the models without one) whose predicate holds. A `modelGrp`
 * has no predicate, so once reached it decides: when none of its models holds, nothing does.
 */
export function select(models: Model[], pos: Pos, output?: string): Model | undefined {
  let group: number | undefined
  for (const m of models) {
    if (m.output !== output) continue
    if (group !== undefined && m.group !== group) return undefined
    if (!m.predicate || bool(m.predicate(pos))) return m
    group = m.group
  }
}

/** What renders in `output`, the page when unset: that output's models, else the models without one. */
export const selectOutput = (models: Model[], pos: Pos, output = WEB) =>
  select(models, pos, output) ?? select(models, pos)

const tokens = (el: Element | undefined, name: string) => (el ? attr(el, name) ?? '' : '').split(/\s+/).filter(Boolean)

/** A `<rendition>` or `<outputRendition>` as a CSS rule; `@scope` is a pseudo-element. */
const rule = (selector: string, r: Element) =>
  `${selector}${attr(r, 'scope') ? `::${attr(r, 'scope')}` : ''} { ${textOf(r).trim()} }`
const rules = (el: Element, selector: string) => elementChildren(el, 'outputRendition').map((r) => rule(selector, r))

export function readOdd(xml: string, { tokensCss = '', behaviours = {} }: ReadOddOptions = {}): Odd {
  const tree = parse(xml)
  /** An element's base model, once: where it stands does not change. */
  const cached = new WeakMap<Element, Model | undefined>()
  const base = (node: Element, up: Element[]) => {
    if (!cached.has(node)) cached.set(node, selectOutput(odd.models[localName(node.name)] ?? [], { node, up }))
    return cached.get(node)
  }
  const odd: Odd = {
    models: {},
    flow: (node, up) => {
      const m = base(node, up)
      // Within a sequence, `text` is literal content, not a container.
      const kinds = m?.sequence?.map((p) => p.behaviour).filter((b) => b !== 'text') ?? [m?.behaviour ?? '']
      const flows = kinds.map((b) => odd.behaviours[b]?.flow)
      return flows.includes('block') ? 'block' : flows.every((f) => f === 'inline') ? 'inline' : undefined
    },
    joins: (node, up) => {
      const m = base(node, up)
      return m && 'join' in m.params ? str(m.params.join({ node, up })) : undefined
    },
    silent: (node, up) => select(odd.models[localName(node.name)] ?? [], { node, up }, PLAIN)?.behaviour === 'omit',
    values: {},
    renditions: new Set(),
    css: '',
    findings: [],
    behaviours: { ...BEHAVIOURS, ...behaviours },
    reached: { models: new Set(), elements: new Set(), unmodelled: new Set() },
    views: [],
  }
  /** Each finding once: an expression that fails, fails wherever it is evaluated. */
  const reported = new Set<string>()
  const report = (code: FindingCode, args: Record<string, string>) => {
    const found = finding(code, args)
    if (reported.has(found.message)) return
    reported.add(found.message)
    odd.findings.push(found)
  }
  /** Custom properties the models set, which the ODD's CSS may then read. */
  const properties = new Set<string>()
  const css = [
    '.pm-block { display: block; }', // a block set inside phrasing content renders as a span
    '.pm-alternate { display: none; }',
  ]
  /** Each output over the page, and the `<desc>`s of the first of its models that has any. */
  const views = new Map<string, string[]>()

  // Neither is read, and nothing in the rendering would show what that cost.
  const [schema, ...others] = findAll(tree, 'schemaSpec')
  const source = schema && attr(schema, 'source')
  if (source) report('chain-not-followed', { ident: attr(schema, 'ident') ?? '', source })
  for (const other of others) report('schema-spec-ignored', { ident: attr(other, 'ident') ?? '' })

  for (const r of elementChildren(findFirst(tree, 'tagsDecl'), 'rendition')) {
    const id = attr(r, 'xml:id')!
    odd.renditions.add(id)
    css.push(rule(`.r-${id}`, r))
  }

  for (const spec of elementChildren(schema, 'elementSpec')) {
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
        /**
         * An expression that cannot be read, or that fails where it is evaluated, counts as empty —
         * what a failed evaluation gives anyway: the predicate is false, the param has no value.
         * One document renders without it, rather than none at all.
         */
        const compile = (expr: string, code: FindingCode, args: Record<string, string> = {}): XPath => {
          const empty = (error: unknown) => {
            report(code, { model: id, ...args, error: (error as Error).message })
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
        const cls = styled && !bare ? own[0] ?? (report('css-class-missing', { model: id }), id) : undefined
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
        const named = attr(m, 'behaviour')
        const known = !!sequence || (named !== undefined && Object.hasOwn(odd.behaviours, named))
        if (!sequence && !named) report('behaviour-missing', { model: id })
        else if (!known) report('behaviour-unknown', { model: id, behaviour: named! })
        // An element whose behaviour is not known still shows its text, as an unreadable expression leaves the rest.
        const behaviour = sequence ? 'modelSequence' : known ? named! : 'inline'
        const params = elementChildren(m, 'param').map((p) => ({ name: attr(p, 'name')!, value: attr(p, 'value') ?? "''" }))
        for (const { name } of params) {
          if (name.startsWith('--')) properties.add(name)
          if (known && !readsParam(odd.behaviours, behaviour, name)) report('param-unread', { model: id, behaviour, param: name })
        }
        return {
          id,
          behaviour,
          predicate: predicate ? compile(predicate, 'predicate-unreadable') : undefined,
          output: output || undefined,
          params: Object.fromEntries(params.map(({ name, value }) => [name, compile(value, 'param-unreadable', { param: name })])),
          classes: [...new Set([...(groupClass ? [groupClass] : []), ...own, ...(cls ? [cls] : [])])],
          useSourceRendition: inherited('useSourceRendition') === 'true',
          sequence,
          group: group && g,
        }
      }
      const members = group ? elementChildren(group).filter((e) => /^model(Sequence)?$/.test(localName(e.name))) : [entry]
      for (const m of members) models.push(read(m))
    })
    css.push(...view)

    // A model is only reached while every earlier one of its output has a predicate, and no group
    // but its own comes before it.
    const decides = new Map<string, { by: string; group?: number }>()
    for (const m of models) {
      const output = m.output ?? ''
      const earlier = decides.get(output)
      if (earlier && (earlier.group === undefined || earlier.group !== m.group)) {
        report(earlier.group === undefined ? 'model-unreachable' : 'model-unreachable-group', { model: m.id, by: earlier.by })
      } else if (!m.predicate) decides.set(output, { by: m.id })
      else if (m.group !== undefined && !earlier) decides.set(output, { by: m.id, group: m.group })
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
  const availability = findFirst(findFirst(tree, 'teiHeader'), 'availability')
  const licence = findFirst(availability, 'licence')
  if (availability) odd.availability = { text: plainText(availability), licence: licence && attr(licence, 'target') }
  // A generated file travels without the ODD, so it carries the ODD's terms along.
  const terms = [odd.availability?.text, odd.availability?.licence].filter(Boolean).join(' ').replaceAll('*/', '* /')
  odd.css = `/* Generated from the ODD — edit the ODD, not this file.${terms && `\n   ${terms}`} */\n${css.join('\n')}\n`

  // A custom property the CSS reads is defined by the design tokens, by the CSS itself, or by a param.
  const defined = new Set([...`${tokensCss}\n${odd.css}`.matchAll(/(--[\w-]+)\s*:/g)].map(([, name]) => name))
  for (const [, name] of odd.css.matchAll(/var\((--[\w-]+)/g)) {
    if (!defined.has(name) && !properties.has(name)) report('css-property-undefined', { property: name })
  }
  return odd
}

/**
 * What the ODD says that never ran, and what the corpus holds that it never handled —
 * read off what the rendering reached. Over every output at once: a model that fires
 * in the search text earns its place as much as one that fires on the page.
 */
export function coverage(odd: Odd): Finding[] {
  const { models, elements, unmodelled } = odd.reached
  const out: Finding[] = []
  for (const [ident, list] of Object.entries(odd.models)) {
    if (!elements.has(ident)) out.push(finding('element-absent', { element: ident, count: String(list.length) }))
    else for (const m of list) if (!models.has(m.id)) out.push(finding('model-unused', { model: m.id }))
  }
  for (const name of unmodelled) {
    out.push(finding(odd.models[name] ? 'element-no-match' : 'element-no-model', { element: name }))
  }
  return out.sort((a, b) => a.message.localeCompare(b.message))
}
