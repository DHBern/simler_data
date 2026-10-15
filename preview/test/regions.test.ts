/**
 * A region between two milestones, as a column set: what stands between moves into the
 * start, across element boundaries.
 *
 *     node --import tsx --test test/regions.test.ts
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { Root } from 'hast'
import rehypeStringify from 'rehype-stringify'
import { unified } from 'unified'

import { resolveRegions } from '../lib/tei/regions.ts'
import { h, text } from '../lib/tei/teiToHast.ts'

const toHtml = (tree: Root) => unified().use(rehypeStringify).stringify(tree)
const mark = (region: string) => h('span', { className: ['tei-cb'], 'data-region': region })

test('a region ending deeper than it starts splits what lies between', () => {
  const tree: Root = { type: 'root', children: [
    h('div', {}, [h('p', {}, [text('a')]), mark('start'), h('div', { id: 'lg' }, [text('b'), mark('end'), text('c')])]),
  ] }
  assert.deepEqual(resolveRegions(tree), [])
  assert.equal(toHtml(tree),
    '<div><p>a</p><div class="tei-cb" data-region="start"><div id="lg">b</div></div><div>c</div></div>')
})

test('a marker without its partner is a finding', () => {
  const tree: Root = { type: 'root', children: [mark('start'), text('x')] }
  assert.equal(resolveRegions(tree).length, 1)
})
