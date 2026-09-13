/**
 * The XPath of Processing-Model predicates and params — a subset, compiled once
 * to closures over xast. Anything outside it throws when the ODD is read.
 *
 * Paths: `.`, `..`, `@name`, `name`, `*`, `node()`, `text()`, the axes in AXES,
 * `/`, `//`, absolute paths and `[predicate]`. Operators: or, and,
 * = != < <= > >=, + -, mod, `if (…) then … else …`. Sequences `(a, b)`, string
 * and number literals, and the functions in FUNCTIONS.
 */

import { children, isElement, isText, localName, textOf, type Element, type Text } from '../tei/xast'

/** A node and its ancestor elements, outermost first. */
export interface Pos {
  node: Element | Text
  up: Element[]
}
export type Item = Pos | string | number
export type Value = Item[] | string | number | boolean
export type XPath = (pos: Pos) => Value

export const isPos = (item: unknown): item is Pos => typeof item === 'object' && item !== null && 'node' in item
const atom = (item: Item): string | number => (isPos(item) ? textOf(item.node) : item)
export const seq = (v: Value): Item[] => (Array.isArray(v) ? v : [v as Item])
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
  const up = [...p.up, p.node as Element]
  return children(p.node)
    .filter((node): node is Element | Text => isElement(node) || isText(node))
    .map((node) => ({ node, up }))
}
const parent = (p: Pos): Pos[] => (p.up.length ? [{ node: p.up.at(-1)!, up: p.up.slice(0, -1) }] : [])
const siblings = (p: Pos, after: boolean): Pos[] => {
  const all = parent(p).flatMap(kids)
  const i = all.findIndex((s) => s.node === p.node)
  return after ? all.slice(i + 1) : all.slice(0, i).reverse()
}
const descendants = (p: Pos): Pos[] => kids(p).flatMap((k) => [k, ...descendants(k)])
const ancestors = (p: Pos): Pos[] => p.up.map((node, i) => ({ node, up: p.up.slice(0, i) })).reverse()
/** The document node above the outermost element, where an absolute path starts. */
const documentOf = (p: Pos): Pos => ({ node: { type: 'root', children: [p.up[0] ?? p.node] } as unknown as Element, up: [] })

/** The axes, each in proximity order. */
const AXES: Record<string, (p: Pos) => Pos[]> = {
  self: (p) => [p],
  child: kids,
  parent,
  ancestor: ancestors,
  'ancestor-or-self': (p) => [p, ...ancestors(p)],
  descendant: descendants,
  'descendant-or-self': (p) => [p, ...descendants(p)],
  'preceding-sibling': (p) => siblings(p, false),
  'following-sibling': (p) => siblings(p, true),
  preceding: (p) => [p, ...ancestors(p)].flatMap((a) => siblings(a, false).flatMap((s) => [...descendants(s).reverse(), s])),
  following: (p) => [p, ...ancestors(p)].flatMap((a) => siblings(a, true).flatMap((s) => [s, ...descendants(s)])),
}

/** Position and size of the context in the predicate being evaluated. */
let focus = { position: 1, size: 1 }

/** Called without arguments, a function gets the context item. */
const FUNCTIONS: Record<string, (...args: Value[]) => Value> = {
  position: () => focus.position,
  last: () => focus.size,
  exists: (v) => seq(v).length > 0,
  empty: (v) => seq(v).length === 0,
  'local-name': (v) => {
    const [item] = seq(v)
    return isPos(item) && isElement(item.node) ? localName(item.node.name) : ''
  },
  'string-length': (a) => [...str(a)].length,
  'ends-with': (a, b) => str(a).endsWith(str(b)),
  matches: (a, re, flags) => new RegExp(str(re), flags === undefined ? '' : str(flags)).test(str(a)),
  not: (v) => !bool(v),
  count: (v) => seq(v).length,
  concat: (...vs) => vs.map(str).join(''),
  contains: (a, b) => str(a).includes(str(b)),
  'contains-token': (a, t) => seq(a).some((i) => String(atom(i)).split(/\s+/).includes(str(t).trim())),
  'starts-with': (a, b) => str(a).startsWith(str(b)),
  'normalize-space': (a) => str(a).replace(/\s+/g, ' ').trim(),
  translate: (a, from, to) =>
    [...str(a)].map((c) => { const i = [...str(from)].indexOf(c); return i < 0 ? c : [...str(to)][i] ?? '' }).join(''),
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
    preds.reduce<Item[]>((list, pred) => {
      const saved = focus
      const kept = list.filter((item, k) => {
        focus = { position: k + 1, size: list.length }
        const v = pred(isPos(item) ? item : outer)
        return typeof v === 'number' ? v === k + 1 : bool(v)
      })
      focus = saved
      return kept
    }, items)
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

  /** A literal, a parenthesised sequence, a conditional, a function call — or a location path. */
  function primary(): Fn {
    const tok = toks[i] ?? fail('unexpected end')
    const call = tok.t === 'name' && toks[i + 1]?.v === '(' && tok.v !== 'node' && tok.v !== 'text'
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
    } else if (call && tok.v === 'if') {
      i += 2
      const test = or()
      expect(')')
      if (!eat('then', 'name')) fail('expected "then"')
      const yes = or()
      if (!eat('else', 'name')) fail('expected "else"')
      const no = or()
      base = (p) => (bool(test(p)) ? yes(p) : no(p))
    } else if (call) {
      const f = FUNCTIONS[tok.v] ?? fail(`unknown function ${tok.v}()`)
      i += 2
      const args: Fn[] = []
      if (!is(')')) do args.push(or()); while (eat(','))
      expect(')')
      base = (p) => f(...(args.length ? args.map((a) => a(p)) : [[p]]))
    }
    if (!base) return path()
    const [inner, preds] = [base, predicates()]
    return preds.length ? (p) => filter(seq(inner(p)), preds, p) : inner
  }

  /** Steps joined by `/`; `//` is `/descendant-or-self::node()/`, a leading `/` the document. */
  function path(): Fn {
    const absolute = is('/')
    const steps: ((p: Pos) => Item[])[] = absolute ? [] : [step()]
    while (eat('/')) {
      if (eat('/')) steps.push(AXES['descendant-or-self'])
      steps.push(step())
    }
    return (p) =>
      steps.reduce<Item[]>((ctx, s) => ctx.flatMap((c) => (isPos(c) ? s(c) : [])), [absolute ? documentOf(p) : p])
  }

  function step(): (p: Pos) => Item[] {
    if (eat('.')) return (p) => [p]
    if (eat('..')) return parent
    if (eat('@')) {
      const attr = name()
      return (p) => {
        const v = isElement(p.node) ? p.node.attributes?.[attr] : undefined
        return v == null ? [] : [v]
      }
    }
    let axis = 'child'
    if (toks[i]?.t === 'name' && toks[i + 1]?.v === '::') {
      axis = name()
      i++
    }
    const move = AXES[axis] ?? fail(`unsupported axis ${axis}`)
    let test = (q: Pos['node']): boolean => isElement(q)
    if (!eat('*')) {
      const n = name()
      const local = localName(n)
      if ((n === 'node' || n === 'text') && eat('(')) {
        expect(')')
        test = n === 'node' ? () => true : (q) => isText(q)
      } else test = (q) => isElement(q) && localName(q.name) === local
    }
    const preds = predicates()
    return (p) => filter(move(p).filter((q) => test(q.node)), preds, p)
  }

  const root = or()
  if (i < toks.length) fail(`unexpected "${toks[i].v}"`)
  return root
}
