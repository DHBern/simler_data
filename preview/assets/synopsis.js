/**
 * The synopsis pages: what the reader can choose, and the keys; the overview's sort.
 *
 * A classic script, loaded only by `synopse-*.html`; `previewStore.js` comes first and
 * holds the one thing this shares with `preview.js`.
 */
(function () {
  'use strict'

  // Pointing at a variant marks the readings that answer it — the cross-witness
  // correspondence the alignment records as a shared apparatus id.

  var table = document.querySelector('.synopsis')
  if (table) {
    var marked = []
    table.addEventListener('mouseover', function (event) {
      var run = event.target.closest('.var')
      var group = run && run.dataset.group
      marked.forEach(function (el) { el.classList.remove('is-linked') })
      marked = group ? [].slice.call(table.querySelectorAll('[data-group="' + group + '"]')) : []
      marked.forEach(function (el) { el.classList.add('is-linked') })
    })
  }

  // What to show is kept across poems; which witnesses to show belongs to the
  // poem being read. Categories and filters are applied here, since both hide a
  // place; every other control writes one attribute and the stylesheet reacts.
  var synopsis = document.querySelector('[data-synopsis]')
  var controls = document.querySelector('[data-syn-controls]')
  if (synopsis && controls) {
    var hidden = []
    var all = function (selector, root) { return [].slice.call((root || synopsis).querySelectorAll(selector)) }
    var chips = all('[data-syn-cat]', controls)
    var filters = all('[data-syn-ignore]', controls)
    var places = all('.synopsis [data-cat], .syn-register li[data-cat]')
    var entries = all('.app-list [data-cat]') // one per place: what the counts count
    var rows = all('.synopsis tbody tr[id]')
    var columns = all('[data-syn-witness]', controls)
    var spans = {} // apparatus id → its marked readings, for comparing the columns shown
    all('.synopsis .var').forEach(function (s) { (spans[s.dataset.group] = spans[s.dataset.group] || []).push(s) })

    // The places whose readings agree among the witnesses shown: each column's
    // `data-alike` lists the columns reading as it does, and a witness that
    // reads nothing at the place has no mark, so it is in no such list.
    var shownColumns = function () {
      return columns.filter(function (c) { return c.checked }).map(function (c) { return c.dataset.synWitness })
    }
    var agreeing = function (shown) {
      var agree = {}
      if (shown.length === columns.length) return agree
      Object.keys(spans).forEach(function (group) {
        var row = spans[group][0].closest('tr')
        var present = all('td[data-w]:not(.gap)', row).map(function (td) { return td.dataset.w })
          .filter(function (w) { return shown.indexOf(w) >= 0 })
        var seen = spans[group].filter(function (s) { return shown.indexOf(s.closest('td').dataset.w) >= 0 })
        var alike = seen.length ? seen[0].dataset.alike.split(' ') : []
        agree[group] = present.length < 2 || !seen.length ||
          present.every(function (w) { return alike.indexOf(w) >= 0 })
      })
      return agree
    }

    // A model's types taken back: its places count as open again, as before it
    // was asked, in the chips, the colours and the apparatus.
    var model = controls.querySelector('[data-syn-model]')
    var machine = all('[data-by="model"][data-cat]')
    machine.forEach(function (el) { el.dataset.typed = el.dataset.cat + ' ' + (el.dataset.state || '') })
    var typed = function () {
      machine.forEach(function (el) {
        var was = el.dataset.typed.split(' ')
        el.dataset.cat = model.checked ? was[0] : 'open'
        if (was[1]) el.dataset.state = model.checked ? was[1] : 'open'
      })
      synopsis.toggleAttribute('data-no-model', !model.checked)
      previewStore.set('syn-model', model.checked ? 'on' : 'off')
    }

    // A place is shown when its category is chosen and the step of the rule
    // cascade that settles it (`data-step`) is not one the reader leaves out.
    var refresh = function () {
      var chosen = chips.filter(function (c) { return c.checked }).map(function (c) { return c.dataset.synCat })
      var ignored = filters.filter(function (f) { return f.checked }).map(function (f) { return f.dataset.synIgnore })
      var shown = shownColumns()
      var agree = agreeing(shown)
      // A whole line more or less counts while a witness shown has it and one shown has not.
      var some = function (list) { return list.split(' ').some(function (w) { return shown.indexOf(w) >= 0 }) }
      var gone = function (el) {
        if (el.dataset.missing) return !some(el.dataset.missing) || !some(el.dataset.present)
        return ignored.indexOf(el.dataset.step) >= 0 || agree[el.dataset.group] === true
      }
      places.forEach(function (el) { el.toggleAttribute('data-off', chosen.indexOf(el.dataset.cat) < 0 || gone(el)) })
      // A step only acts on its category: while that is not shown, the step is dimmed.
      all('[data-syn-steps]', controls).forEach(function (g) { g.toggleAttribute('data-off', chosen.indexOf(g.dataset.cat) < 0) })
      register()
      pairs(function (el) { return chosen.indexOf(el.dataset.cat) >= 0 && ignored.indexOf(el.dataset.step) < 0 })

      // Each count says what the filters leave of its category, chosen or not.
      chips.forEach(function (chip) {
        var n = entries.filter(function (e) { return e.dataset.cat === chip.dataset.synCat && !gone(e) }).length
        chip.parentNode.dataset.n = n
        chip.parentNode.querySelector('.n').textContent = n
      })

      // A row with nothing left to show is quiet, its whole line included.
      rows.forEach(function (row) {
        var line = row.querySelector('li[data-missing]:not([data-off])')
        row.classList.toggle('quiet', !row.querySelector('.var:not([data-off])') && !line)
        // Text only in witnesses not shown: nothing to read here.
        row.classList.toggle('unseen', !all('td[data-w]:not(.gap)', row).some(function (td) { return shown.indexOf(td.dataset.w) >= 0 }))
      })
      previewStore.set('syn-cats', chosen.join(' '))
      previewStore.set('syn-steps', ignored.join('|'))
      frame()
    }

    // The register follows the model and the filters: a set stands in the fold of
    // its category as it is now, the most frequent first, and a fold counts what is left.
    var folds = {}
    all('.syn-register .syn-cat').forEach(function (fold) { folds[fold.dataset.cat] = fold })
    var register = function () {
      all('.syn-register li[data-cat]').forEach(function (li) {
        var list = folds[li.dataset.cat] && folds[li.dataset.cat].querySelector('ol')
        if (!list || li.parentNode === list) return
        var before = [].slice.call(list.children).filter(function (o) { return +o.dataset.n < +li.dataset.n })[0]
        list.insertBefore(li, before || null)
      })
      Object.keys(folds).forEach(function (c) {
        folds[c].querySelector('.count').textContent = all('li:not([data-off])', folds[c]).length
      })
    }

    // Witness against witness, over the places the categories and steps chosen
    // leave; the columns shown do not matter here, every pair is in the table.
    var cells = all('[data-syn-pairs] td[data-pair]')
    var pairs = function (counts) {
      var n = {}
      entries.filter(counts).forEach(function (el) {
        var apart = el.dataset.apart ? el.dataset.apart.split(' ') : []
        if (el.dataset.missing) {
          el.dataset.missing.split(' ').forEach(function (a) {
            el.dataset.present.split(' ').forEach(function (b) { apart.push(Math.min(a, b) + '-' + Math.max(a, b)) })
          })
        }
        apart.forEach(function (pair) { n[pair] = (n[pair] || 0) + 1 })
      })
      var most = Math.max.apply(null, [1].concat(cells.map(function (td) { return n[td.dataset.pair] || 0 })))
      cells.forEach(function (td) {
        var k = n[td.dataset.pair] || 0
        td.textContent = k
        td.style.setProperty('--k', (k / most).toFixed(2))
        td.title = td.title.replace(/\d+ Stellen$/, k + ' Stellen')
      })
    }

    // The minimap: a frame over the rows on screen, and a click or a drag on it
    // goes to the row at that height. Its axis is the rows, hidden ones too.
    var map = synopsis.querySelector('[data-syn-map]')
    var area = map && map.querySelector('.syn-map')
    var box = map && map.querySelector('.syn-frame')
    var queued = false
    var frame = function () {
      if (!map || queued) return
      queued = true
      requestAnimationFrame(function () {
        queued = false
        var first = -1
        var last = -1
        for (var i = 0; i < rows.length; i++) {
          if (!rows[i].offsetParent) continue
          var r = rows[i].getBoundingClientRect()
          if (r.top > innerHeight) break
          if (r.bottom < 0) continue
          if (first < 0) first = i
          last = i
        }
        box.hidden = first < 0
        box.style.top = first / rows.length * 100 + '%'
        box.style.height = (last - first + 1) / rows.length * 100 + '%'
      })
    }
    if (map) {
      map.hidden = false
      var go = function (event) {
        var r = area.getBoundingClientRect()
        var i = Math.max(0, Math.min(rows.length - 1, Math.floor((event.clientY - r.top) / r.height * rows.length)))
        while (i < rows.length - 1 && !rows[i].offsetParent) i++
        rows[i].scrollIntoView({ block: 'start' })
      }
      area.addEventListener('pointerdown', function (event) { area.setPointerCapture(event.pointerId); go(event) })
      area.addEventListener('pointermove', function (event) { if (area.hasPointerCapture(event.pointerId)) go(event) })
      addEventListener('scroll', frame, { passive: true })
      addEventListener('resize', frame)
    }

    // On a narrow screen the controls start folded under *Ansicht*; on a wide one they are always open.
    var view = controls.querySelector('[data-syn-view]')
    var narrow = matchMedia('(max-width: 40rem)')
    var fit = function () { view.open = !narrow.matches }
    fit()
    narrow.addEventListener('change', fit)

    var key = function (name) { return 'syn-' + (name === 'colour' ? 'colouring' : name) }
    var apply = function (control) {
      var name = control.dataset.syn
      if (control.dataset.synWitness) {
        var column = control.dataset.synWitness
        hidden = hidden.filter(function (c) { return c !== column })
        if (!control.checked) hidden.push(column)
        synopsis.dataset.hide = hidden.join(' ')
      } else if (control.type === 'checkbox') {
        synopsis.toggleAttribute('data-' + name, control.checked)
        previewStore.set(key(name), control.checked ? 'on' : 'off')
      } else {
        synopsis.dataset[name] = control.value
        previewStore.set(key(name), control.value)
      }
    }

    // The places that vary, as the reader has just defined them: what the
    // counter counts and what n and p step through.
    var counter = controls.querySelector('[data-syn-count]')
    var differing = function () {
      return rows.filter(function (row) { return !row.classList.contains('quiet') && row.offsetParent !== null })
    }

    var tally = function (at, total) {
      counter.textContent = !total ? '' : '(' + (at ? at + ' von ' : '') + total + ')'
    }

    var changed = function () {
      tally(0, differing().length)
      frame()
    }

    var step = function (by) {
      var them = differing()
      if (!them.length) return
      var here = them.indexOf(synopsis.querySelector('tbody tr:target'))
      var at = here < 0 ? (by > 0 ? 0 : them.length - 1) : (here + by + them.length) % them.length
      location.hash = them[at].id
      them[at].scrollIntoView({ block: 'center' })
      tally(at + 1, them.length)
    }

    document.addEventListener('keydown', function (event) {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)) return
      if (event.key === 'n') step(1)
      else if (event.key === 'p') step(-1)
    })

    // The row number is a link to its segment; clicking it puts that link on
    // the clipboard too, which is what a reader wants for a handout or a mail.
    synopsis.addEventListener('click', function (event) {
      var link = event.target.closest('a[data-syn-link]')
      if (!link || !navigator.clipboard) return
      navigator.clipboard.writeText(link.href).then(function () {
        link.classList.add('copied')
        setTimeout(function () { link.classList.remove('copied') }, 1200)
      }, function () {})
    })

    var show = previewStore.get('syn-cats')
    var ignore = previewStore.get('syn-steps')
    if (show !== null) chips.forEach(function (c) { c.checked = show.split(' ').indexOf(c.dataset.synCat) >= 0 })
    if (ignore !== null) filters.forEach(function (f) { f.checked = ignore.split('|').indexOf(f.dataset.synIgnore) >= 0 })
    chips.concat(filters).forEach(function (control) {
      control.addEventListener('change', function () { refresh(); changed() })
    })
    if (model) {
      model.checked = previewStore.get('syn-model') !== 'off'
      typed()
      model.addEventListener('change', function () { typed(); refresh(); changed() })
    }
    // All, none, or as the page came: the boxes of the button's row.
    all('[data-syn-preset]', controls).forEach(function (button) {
      button.addEventListener('click', function () {
        var how = button.dataset.synPreset
        all('input', button.closest('.syn-row')).forEach(function (c) {
          c.checked = how === 'all' || (how === 'default' && c.defaultChecked)
        })
        refresh()
        changed()
      })
    })

    all('[data-syn], [data-syn-witness]', controls).forEach(function (control) {
      var value = control.dataset.syn && previewStore.get(key(control.dataset.syn))
      if (value) {
        if (control.type === 'checkbox') control.checked = value === 'on'
        // Against a column belongs to the poem: column 2 is another witness in the next.
        else if (!/^w/.test(value)) control.value = value
        if (control.value === '') control.selectedIndex = 0 // a mode this page does not have
      }
      apply(control)
      control.addEventListener('change', function () {
        apply(control)
        if (control.dataset.synWitness) refresh() // the marks follow the witnesses shown
        changed()
      })
    })
    refresh()
    tally(0, differing().length)
  }

  // The overview, sorted by any of its counts, the largest first; by poem, as built.
  var sort = document.querySelector('[data-syn-sort]')
  if (sort) {
    var body = document.querySelector('[data-syn-rows]')
    var built = [].slice.call(body.rows)
    sort.addEventListener('change', function () {
      var key = sort.value
      var order = built.slice()
      if (key) order.sort(function (a, b) { return b.getAttribute(key) - a.getAttribute(key) })
      order.forEach(function (row) { body.appendChild(row) })
    })
  }
})()
