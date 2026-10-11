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

  // Each control writes one attribute on the table and the stylesheet reacts.
  // What to show of the variants is kept across poems; which witnesses to show,
  // and which is the base, belong to the poem being read.
  var synopsis = document.querySelector('[data-synopsis]')
  var controls = document.querySelector('[data-syn-controls]')
  if (synopsis && controls) {
    var hidden = []

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
      } else if (control.value) {
        synopsis.dataset[name] = control.value
        previewStore.set('syn-' + name, control.value)
        if (name === 'base') markRowsWithoutBase(control.value)
      } else {
        synopsis.removeAttribute('data-' + name)
        previewStore.set('syn-' + name, '')
      }
    }

    // Where the base witness itself reads nothing, there is nothing to depart
    // from, so the other witnesses keep their full text in that row.
    var markRowsWithoutBase = function (base) {
      synopsis.querySelectorAll('tbody tr').forEach(function (row) {
        var cell = base && row.querySelector('td[data-w="' + base + '"]')
        row.classList.toggle('no-base', !!cell && cell.classList.contains('gap'))
      })
    }

    // The places that vary, as the reader has just defined them: what the
    // counter counts and what n and p step through.
    var counter = controls.querySelector('[data-syn-count]')
    var places = function () {
      return [].slice.call(synopsis.querySelectorAll('tbody tr[data-varies]')).filter(function (row) {
        return !row.classList.contains('app') && row.dataset.varies !== 'none' &&
          row.offsetParent !== null &&
          !(synopsis.dataset.variants === 'words' && row.dataset.varies === 'spelling')
      })
    }

    var tally = function (at, total) {
      counter.textContent = !total ? '' : at ? at + ' von ' + total + ' Abweichungen'
        : total + (total === 1 ? ' Abweichung' : ' Abweichungen')
    }

    var step = function (by) {
      var all = places()
      if (!all.length) return
      var here = all.indexOf(synopsis.querySelector('tbody tr:target'))
      var at = here < 0 ? (by > 0 ? 0 : all.length - 1) : (here + by + all.length) % all.length
      location.hash = all[at].id
      all[at].scrollIntoView({ block: 'center' })
      tally(at + 1, all.length)
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

    controls.querySelectorAll('[data-syn], [data-syn-witness]').forEach(function (control) {
      var kept = control.dataset.syn && previewStore.get('syn-' + control.dataset.syn)
      if (kept !== null && kept !== undefined && !control.dataset.synWitness) {
        if (control.type === 'checkbox') control.checked = kept === 'on'
        else if (control.dataset.syn !== 'base') control.value = kept // the base is per poem
      }
      apply(control)
      control.addEventListener('change', function () {
        apply(control)
        tally(0, places().length)
        dispatchEvent(new Event('synchange'))
      })
    })
    tally(0, places().length)
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
