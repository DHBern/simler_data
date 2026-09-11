/**
 * The XPath of Processing-Model predicates and params — a subset, compiled once
 * to closures over xast. Anything outside it throws when the ODD is read.
 *
 * Paths: `.`, `..`, `@name`, `name`, `*`, `node()`, the axes in AXES, `/` and
 * `[predicate]`. Operators: or, and, = != < <= > >=, + -, mod. Sequences
 * `(a, b)`, string and number literals, and the functions in FUNCTIONS.
 */

import { elementChildren, localName, textOf, type Element } from '../tei/xast'

/** An element and its ancestors, outermost first. */
export interface Pos {
  node: Element
  up: Element[]
}
type Item = Pos | string | number
export type Value = Item[] | string | number | boolean
export type XPath = (pos: Pos) => Value

const isPos = (item: unknown): item is Pos => typeof item === 'object' && item !== null && 'node' in item
const atom = (item: Item): string | number => (isPos(item) ? textOf(item.node) : item)
const seq = (v: Value): Item[] => (Array.isArray(v) ? v : [v as Item])
const num = (v: Value): number => (typeof v === 'number' ? v : Number(str(v)))

export const bool = (v: Value): boolean =>
  Array.isArray(v) ? v.length > 0 : typeof v === 'number' ? v !== 0 && !Number.isNaN(v) : Boolean(v)
export const str = (v: Value): string => (Array.isArray(v) ? (v.length ? String(atom(v[0])) : '') : String(v))

const COMPARE: Record<string, (a: string | number | boolean, b: string | number | boolean) => boolean> = {
  '=': (a, b) => a === b,
  '!=': (a, b) => a !== b,
  '<': (a, b) => a < b,
  '<=': (a, b) => a <= b,
  '>': (a, b) => a > b,
  '>=': (a, b) => a >= b,
}

/** General comparison: true if any pair of items compares. */
function compare(op: string, a: Value, b: Value): boolean {
  if (typeof a === 'boolean' || typeof b === 'boolean') return COMPARE[op](bool(a), bool(b))
  return seq(a).some((x) =>
    seq(b).some((y) => {
      const [p, q] = [atom(x), atom(y)]
      const numeric = typeof p === 'number' || typeof q === 'number' || (op !== '=' && op !== '!=')
      return numeric ? COMPARE[op](Number(p), Number(q)) : COMPARE[op](p, q)
    }),
  )
}

const kids = (p: Pos): Pos[] => {
  const up = [...p.up, p.node]
  return elementChildren(p.node).map((node) => ({ node, up }))
}
const parent = (p: Pos): Pos[] => (p.up.length ? [{ node: p.up.at(-1)!, up: p.up.slice(0, -1) }] : [])
const siblings = (p: Pos, after: boolean): Pos[] => {
  const all = parent(p).flatMap(kids)
  const i = all.findIndex((s) => s.node === p.node)
  return after ? all.slice(i + 1) : all.slice(0, i).reverse()
}
const descendants = (p: Pos): Pos[] => kids(p).flatMap((k) => [k, ...descendants(k)])

/** Element axes, each in proximity order. */
const AXES: Record<string, (p: Pos) => Pos[]> = {
  self: (p) => [p],
  child: kids,
  parent,
  ancestor: (p) => p.up.map((node, i) => ({ node, up: p.up.slice(0, i) })).reverse(),
  descendant: descendants,
  'preceding-sibling': (p) => siblings(p, false),
  'following-sibling': (p) => siblings(p, true),
}

const FUNCTIONS: Record<string, (...args: Value[]) => Value> = {
  not: (v) => !bool(v),
  count: (v) => seq(v).length,
  concat: (...vs) => vs.map(str).join(''),
  contains: (a, b) => str(a).includes(str(b)),
  'contains-token': (a, t) => seq(a).some((i) => String(atom(i)).split(/\s+/).includes(str(t).trim())),
  'starts-with': (a, b) => str(a).startsWith(str(b)),
  'normalize-space': (a) => str(a).replace(/\s+/g, ' ').trim(),
  string: (a) => str(a),
  true: () => true,
  false: () => false,
}

const TOKEN = /\s*(?:'([^']*)'|"([^"]*)"|(\d+(?:\.\d+)?)|(::|\.\.|!=|<=|>=|[=<>()[\],@/.*+|-])|([A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?))/y

type Tok = { t: 'str' | 'num' | 'op' | 'name'; v: string }
type Fn = (p: Pos) => Value

export function compileXPath(expr: string): XPath {
  const fail = (why: string): never => {
    throw new Error(`XPath "${expr}": ${why}`)
  }

  const toks: Tok[] = []
  for (let at = 0; at < expr.length; ) {
    TOKEN.lastIndex = at
    const m = TOKEN.exec(expr)
    if (!m) {
      if (expr.slice(at).trim()) fail(`cannot read "${expr.slice(at).trim()}"`)
      break
    }
    at = TOKEN.lastIndex
    if (m[1] !== undefined || m[2] !== undefined) toks.push({ t: 'str', v: m[1] ?? m[2] })
    else if (m[3]) toks.push({ t: 'num', v: m[3] })
    else if (m[4]) toks.push({ t: 'op', v: m[4] })
    else toks.push({ t: 'name', v: m[5] })
  }

  let i = 0
  const is = (v: string, t = 'op') => toks[i]?.t === t && toks[i].v === v
  const eat = (v: string, t = 'op') => (is(v, t) ? (i++, true) : false)
  const expect = (v: string) => eat(v) || fail(`expected "${v}"`)
  const name = () => (toks[i]?.t === 'name' ? toks[i++].v : fail('expected a name'))

  /** Keep the items a predicate admits: a number is a position, anything else a test. */
  const filter = (items: Item[], preds: Fn[], outer: Pos): Item[] =>
    preds.reduce<Item[]>(
      (list, pred) =>
        list.filter((item, k) => {
          const v = pred(isPos(item) ? item : outer)
          return typeof v === 'number' ? v === k + 1 : bool(v)
        }),
      items,
    )
  const predicates = (): Fn[] => {
    const preds: Fn[] = []
    while (eat('[')) {
      preds.push(or())
      expect(']')
    }
    return preds
  }

  function or(): Fn {
    let left = and()
    while (eat('or', 'name')) {
      const [a, b] = [left, and()]
      left = (p) => bool(a(p)) || bool(b(p))
    }
    return left
  }
  function and(): Fn {
    let left = comparison()
    while (eat('and', 'name')) {
      const [a, b] = [left, comparison()]
      left = (p) => bool(a(p)) && bool(b(p))
    }
    return left
  }
  function comparison(): Fn {
    const left = additive()
    const op = Object.keys(COMPARE).find((o) => is(o))
    if (!op) return left
    i++
    const right = additive()
    return (p) => compare(op, left(p), right(p))
  }
  function additive(): Fn {
    let left = multiplicative()
    for (let op; (op = ['+', '-'].find((o) => is(o))); ) {
      i++
      const [a, b] = [left, multiplicative()]
      left = op === '+' ? (p) => num(a(p)) + num(b(p)) : (p) => num(a(p)) - num(b(p))
    }
    return left
  }
  function multiplicative(): Fn {
    let left = primary()
    while (eat('mod', 'name')) {
      const [a, b] = [left, primary()]
      left = (p) => num(a(p)) % num(b(p))
    }
    return left
  }

  /** A literal, a parenthesised sequence, a function call — or a location path. */
  function primary(): Fn {
    const tok = toks[i] ?? fail('unexpected end')
    let base: Fn | undefined
    if (tok.t === 'str' || tok.t === 'num') {
      i++
      const v = tok.t === 'num' ? Number(tok.v) : tok.v
      base = () => v
    } else if (eat('(')) {
      const items: Fn[] = []
      if (!is(')')) do items.push(or()); while (eat(','))
      expect(')')
      base = items.length === 1 ? items[0] : (p) => items.flatMap((f) => seq(f(p)))
    } else if (tok.t === 'name' && toks[i + 1]?.v === '(' && tok.v !== 'node') {
      const f = FUNCTIONS[tok.v] ?? fail(`unknown function ${tok.v}()`)
      i += 2
      const args: Fn[] = []
      if (!is(')')) do args.push(or()); while (eat(','))
      expect(')')
      base = (p) => f(...args.map((a) => a(p)))
    }
    if (!base) return path()
    const [inner, preds] = [base, predicates()]
    return preds.length ? (p) => filter(seq(inner(p)), preds, p) : inner
  }

  function path(): Fn {
    const steps = [step()]
    while (eat('/')) steps.push(step())
    return (p) => steps.reduce<Item[]>((ctx, s) => ctx.flatMap((c) => (isPos(c) ? s(c) : [])), [p])
  }

  function step(): (p: Pos) => Item[] {
    if (eat('.')) return (p) => [p]
    if (eat('..')) return parent
    if (eat('@')) {
      const attr = name()
      return (p) => {
        const v = p.node.attributes?.[attr]
        return v == null ? [] : [v]
      }
    }
    let axis = 'child'
    if (toks[i]?.t === 'name' && toks[i + 1]?.v === '::') {
      axis = name()
      i++
    }
    const move = AXES[axis] ?? fail(`unsupported axis ${axis}`)
    let test = '*'
    if (!eat('*')) {
      test = name()
      if (test === 'node' && eat('(')) (expect(')'), (test = '*'))
    }
    const local = localName(test)
    const preds = predicates()
    return (p) =>
      filter(
        move(p).filter((q) => local === '*' || localName(q.node.name) === local),
        preds,
        p,
      )
  }

  const root = or()
  if (i < toks.length) fail(`unexpected "${toks[i].v}"`)
  return root
}
