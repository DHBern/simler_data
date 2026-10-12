/**
 * The synopsis pages: what the reader can choose, the strip, the keys.
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
    var lines = {}
    all('[data-syn-strip] i').forEach(function (line) { lines['seg-' + line.dataset.row] = line })

    // A place is shown when its category is chosen and its readings still differ
    // under the filters: bit m of `data-gone` says they agree under filter set m.
    var refresh = function () {
      var shown = chips.filter(function (c) { return c.checked }).map(function (c) { return c.dataset.synCat })
      var mask = filters.reduce(function (m, f) { return f.checked ? m | 1 << f.dataset.synIgnore : m }, 0)
      var gone = function (el) { return (el.dataset.gone >> mask & 1) === 1 }
      places.forEach(function (el) { el.toggleAttribute('data-off', shown.indexOf(el.dataset.cat) < 0 || gone(el)) })

      // Each count says what the filters leave of its category, chosen or not.
      chips.forEach(function (chip) {
        var n = entries.filter(function (e) { return e.dataset.cat === chip.dataset.synCat && !gone(e) }).length
        chip.parentNode.dataset.n = n
        chip.parentNode.querySelector('.n').textContent = n
      })

      // A row with nothing left to show is quiet, unless a witness has no text
      // in it and omissions are shown; an apparatus row with nothing left goes.
      var gaps = shown.indexOf('omission') >= 0
      rows.forEach(function (row) {
        var quiet = !row.querySelector('.var:not([data-off])') && !(gaps && row.querySelector('td.gap'))
        row.classList.toggle('quiet', quiet)
        if (lines[row.id]) lines[row.id].classList.toggle('quiet', quiet)
        var app = row.nextElementSibling
        if (app && app.classList.contains('app')) app.classList.toggle('quiet', !app.querySelector('li:not([data-off])'))
      })
      previewStore.set('syn-show', shown.join(' '))
      previewStore.set('syn-ignore', filters.filter(function (f) { return f.checked })
        .map(function (f) { return f.dataset.synIgnore }).join(' '))
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
      dispatchEvent(new Event('synchange'))
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

    var show = previewStore.get('syn-show')
    var ignore = previewStore.get('syn-ignore')
    if (show !== null) chips.forEach(function (c) { c.checked = show.split(' ').indexOf(c.dataset.synCat) >= 0 })
    if (ignore !== null) filters.forEach(function (f) { f.checked = ignore.split(' ').indexOf(f.dataset.synIgnore) >= 0 })
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
        changed()
      })
    })
    refresh()
    tally(0, differing().length)
  }

  // The strip beside the table: each line sits where its row does, a marker
  // shows what is on screen, and a click or a drag moves there. A row the
  // filter hides loses its line, so the strip always maps the table as shown.
  var strip = document.querySelector('[data-syn-strip]')
  if (strip && table) {
    var here = strip.querySelector('.syn-here')
    var lines = [].slice.call(strip.querySelectorAll('i'))

    var follow = function () {
      var top = table.getBoundingClientRect().top + window.scrollY
      var height = table.offsetHeight || 1
      var from = Math.min(1, Math.max(0, (window.scrollY - top) / height))
      var to = Math.min(1, Math.max(0, (window.scrollY + window.innerHeight - top) / height))
      here.style.top = from * 100 + '%'
      here.style.height = Math.max(to - from, 0.01) * 100 + '%'
    }

    // Rects, not offsetTop: a row and the table are positioned against
    // different ancestors, so their offsets are not comparable.
    var place = function () {
      var base = table.getBoundingClientRect().top
      var height = table.offsetHeight || 1
      lines.forEach(function (line) {
        var row = document.getElementById('seg-' + line.dataset.row)
        var shown = row && row.offsetParent !== null
        line.style.display = shown ? '' : 'none'
        if (shown) line.style.top = ((row.getBoundingClientRect().top - base) / height * 100) + '%'
      })
      follow()
    }

    var goTo = function (event) {
      var box = strip.getBoundingClientRect()
      var at = (event.clientY - box.top) / box.height
      var top = table.getBoundingClientRect().top + window.scrollY
      window.scrollTo({ top: top + at * table.offsetHeight - window.innerHeight / 2 })
    }

    strip.addEventListener('pointerdown', function (event) {
      strip.setPointerCapture(event.pointerId)
      goTo(event)
    })
    strip.addEventListener('pointermove', function (event) {
      if (event.buttons === 1) goTo(event)
    })
    addEventListener('scroll', follow, { passive: true })
    addEventListener('resize', place)
    addEventListener('synchange', place) // a reading option changed what is shown
    place()
  }
})()
