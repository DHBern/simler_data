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
    var places = all('.synopsis [data-cat], .syn-register [data-cat]')
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

      // Each count says what the filters leave of its category, chosen or not.
      chips.forEach(function (chip) {
        var n = entries.filter(function (e) { return e.dataset.cat === chip.dataset.synCat && !gone(e) }).length
        chip.parentNode.dataset.n = n
        chip.parentNode.querySelector('.n').textContent = n
      })

      // A row with nothing left to show is quiet, its whole line included; an
      // apparatus row with nothing left goes.
      rows.forEach(function (row) {
        var app = row.nextElementSibling
        var isApp = app && app.classList.contains('app')
        var line = isApp && app.querySelector('li[data-missing]:not([data-off])')
        row.classList.toggle('quiet', !row.querySelector('.var:not([data-off])') && !line)
        if (isApp) app.classList.toggle('quiet', !app.querySelector('li:not([data-off])'))
      })
      previewStore.set('syn-cats', chosen.join(' '))
      previewStore.set('syn-steps', ignored.join('|'))
    }

    var apply = function (control) {
      var name = control.dataset.syn
      if (control.dataset.synWitness) {
        var column = control.dataset.synWitness
        hidden = hidden.filter(function (c) { return c !== column })
        if (!control.checked) hidden.push(column)
        synopsis.dataset.hide = hidden.join(' ')
      } else if (control.type === 'checkbox') {
        synopsis.toggleAttribute('data-' + name, control.checked)
        previewStore.set('syn-' + name, control.checked ? 'on' : 'off')
      } else {
        synopsis.dataset[name] = control.value
        previewStore.set('syn-' + name, control.value)
      }
    }

    // The places that vary, as the reader has just defined them: what the
    // counter counts and what n and p step through.
    var counter = controls.querySelector('[data-syn-count]')
    var differing = function () {
      return rows.filter(function (row) { return !row.classList.contains('quiet') && row.offsetParent !== null })
    }

    var tally = function (at, total) {
      counter.textContent = !total ? '' : at ? at + ' von ' + total + ' Abweichungen'
        : total + (total === 1 ? ' Abweichung' : ' Abweichungen')
    }

    var changed = function () {
      tally(0, differing().length)
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
    all('[data-syn-preset]', controls).forEach(function (button) {
      button.addEventListener('click', function () {
        var chosen = button.dataset.synPreset.split(' ')
        chips.forEach(function (c) { c.checked = chosen.indexOf(c.dataset.synCat) >= 0 })
        refresh()
        changed()
      })
    })

    all('[data-syn], [data-syn-witness]', controls).forEach(function (control) {
      var value = control.dataset.syn && previewStore.get('syn-' + control.dataset.syn)
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
