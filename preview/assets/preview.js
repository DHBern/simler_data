/**
 * The preview's behaviour: the switches, and the two anchored panels.
 *
 * A classic script, not a module: an editor opening `dist/A_1648.html` from a
 * checkout is on `file://`, where the browser refuses modules. The page is
 * fully readable without any of this.
 */
;(function () {
  'use strict'

  var root = document.documentElement

  // ── Reading switches ─────────────────────────────────────────────────────
  // Each `[data-switch]` control — checkbox, slider or button — picks one of its
  // `data-values` for its attribute on <html>; the stylesheet does the rest.
  // The choice is kept across documents.

  var store = {
    get: function (key) {
      try { return localStorage.getItem('simler-preview:' + key) } catch (e) { return null }
    },
    set: function (key, value) {
      try { localStorage.setItem('simler-preview:' + key, value) } catch (e) { /* file:// */ }
    },
  }

  document.querySelectorAll('[data-switch]').forEach(function (control) {
    var name = control.dataset.switch
    var values = control.dataset.values.split(' ')
    var type = control.type

    /** The index on <html>; unset, the media query in `data-auto` decides. */
    function current() {
      var i = values.indexOf(root.getAttribute('data-' + name))
      return i >= 0 ? i : Number(!!control.dataset.auto && window.matchMedia(control.dataset.auto).matches)
    }

    function set(i) {
      root.setAttribute('data-' + name, values[i])
      if (type === 'checkbox') control.checked = i > 0
      else if (type === 'range') control.value = i
      else control.setAttribute('aria-pressed', String(i > 0))
    }

    var saved = values.indexOf(store.get(name))
    set(saved >= 0 ? saved : current())

    control.addEventListener(type === 'button' ? 'click' : 'input', function () {
      var i = type === 'checkbox' ? Number(control.checked)
        : type === 'range' ? Number(control.value)
        : (current() + 1) % values.length
      set(i)
      store.set(name, values[i])
    })
  })

  // ── One anchored panel, two users ────────────────────────────────────────
  // The note tooltip and the entity card differ only in what they put in the
  // panel, so anchoring, dismissal and focus live here once. Click, never
  // hover: a panel that vanishes when the pointer leaves the trigger is a panel
  // whose links cannot be reached.

  var MARGIN = 8
  var popovers = []

  document.addEventListener('click', function (event) {
    var target = event.target
    if (!target.closest) return
    for (var i = 0; i < popovers.length; i++) if (popovers[i].inside(target)) return
    // Every panel's first selector before any second: a marker or an entity before a commented range.
    for (var rank = 0; rank < 2; rank++) {
      for (var j = 0; j < popovers.length; j++) {
        var selector = popovers[j].selectors[rank]
        var trigger = selector && target.closest(selector)
        if (trigger && popovers[j].open(trigger)) {
          event.preventDefault()
          return
        }
      }
    }
  })

  /** `selectors` by rank; `fill` returns false to decline — the click is then not intercepted. */
  function createPopover(panel, selectors, fill, closed) {
    // Safari < 17 has no popover API: a plain `hidden` toggle, so no top layer
    // and no light dismiss, but the panel still opens, reads and closes.
    var native = typeof panel.showPopover === 'function'
    if (!native) panel.hidden = true
    var active = null

    var isOpen = function () { return native ? panel.matches(':popover-open') : !panel.hidden }

    /** Below the trigger, flipped above where there is no room, never off an edge. */
    function place(trigger) {
      var box = trigger.getBoundingClientRect()
      var below = box.bottom + MARGIN
      var above = box.top - panel.offsetHeight - MARGIN
      var top = below + panel.offsetHeight <= window.innerHeight || above < 0 ? below : above
      panel.style.position = 'fixed'
      panel.style.margin = '0'
      panel.style.top =
        Math.max(MARGIN, Math.min(top, window.innerHeight - panel.offsetHeight - MARGIN)) + 'px'
      panel.style.left =
        Math.min(
          Math.max(MARGIN, box.left),
          Math.max(MARGIN, window.innerWidth - panel.offsetWidth - MARGIN)
        ) + 'px'
    }

    function open(trigger) {
      if (!fill(trigger)) return false
      if (active && active !== trigger) active.setAttribute('aria-expanded', 'false')
      active = trigger
      if (native) { if (!isOpen()) panel.showPopover() } else { panel.hidden = false }
      place(trigger)
      trigger.setAttribute('aria-expanded', 'true')
      panel.focus({ preventScroll: true })
      return true
    }

    function reset() {
      if (active) active.setAttribute('aria-expanded', 'false')
      active = null
      if (closed) closed()
    }

    function close() {
      if (native) { if (isOpen()) panel.hidePopover() } else { panel.hidden = true }
      reset()
    }

    var popover = {
      selectors: selectors,
      open: open,
      /** A click in the panel is the panel's own. */
      inside: function (target) {
        if (!panel.contains(target)) return false
        if (target.closest('[data-popover-close]')) close()
        return true
      },
    }
    popovers.push(popover)

    // An open panel follows its trigger while the reader scrolls past.
    var follow = function () { if (active && isOpen()) place(active) }
    window.addEventListener('scroll', follow, { passive: true })
    window.addEventListener('resize', follow)
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen()) close() })
    // Light dismiss bypasses `close()`, so the trigger is reset here too.
    panel.addEventListener('toggle', function (e) {
      if (e.newState === 'closed' && active) reset()
    })

    return popover
  }

  // ── The Stellenkommentar tooltip ─────────────────────────────────────────

  // A marker and its commented range share `data-note`: either one opens the note.
  var MARKER = 'a.note-marker[data-note]'
  var RANGE = '.note-range[data-note]'
  var notePanel = document.getElementById('note-popover')
  var markers = [].slice.call(document.querySelectorAll(MARKER))
  if (notePanel && markers.length) {
    var title = notePanel.querySelector('[data-note-title]')
    var body = notePanel.querySelector('[data-note-body]')
    var jump = notePanel.querySelector('[data-note-jump]')
    /** The marker of the note shown. */
    var shown = null
    var lit = null

    /** The marker and range of one note light up together. */
    function light(key) {
      if (key === lit) return
      document.querySelectorAll('.is-linked').forEach(function (el) { el.classList.remove('is-linked') })
      if (key) document.querySelectorAll('[data-note="' + key + '"]').forEach(function (el) { el.classList.add('is-linked') })
      lit = key
    }
    function point(event) {
      var at = event.target.closest && (event.target.closest(MARKER) || event.target.closest(RANGE))
      light(at ? at.dataset.note : shown && shown.dataset.note)
    }
    document.addEventListener('mouseover', point)
    document.addEventListener('focusin', point)

    var notes = createPopover(notePanel, [MARKER, RANGE], function (trigger) {
      if (root.getAttribute('data-notes') === 'off') return false
      var marker = markers.find(function (m) { return m.dataset.note === trigger.dataset.note })
      var note = marker && document.getElementById(marker.dataset.note)
      var source = note && note.querySelector('.endnote-body')
      if (!source) return false // no endnote to read from: leave the marker its link
      var at = markers.indexOf(marker)
      title.textContent =
        'Anmerkung ' + (marker.textContent || '').trim() +
        (markers.length > 1 ? ' von ' + markers.length : '')
      body.replaceChildren.apply(body, source.cloneNode(true).childNodes)
      jump.href = '#' + marker.dataset.note
      notePanel.querySelectorAll('[data-note-step]').forEach(function (button) {
        var to = at + Number(button.dataset.noteStep)
        button.disabled = to < 0 || to >= markers.length
        button.hidden = markers.length < 2
      })
      shown = marker
      light(marker.dataset.note)
      return true
    }, function () {
      shown = null
      light(null)
    })

    notePanel.addEventListener('click', function (event) {
      var step = event.target.closest('[data-note-step]')
      if (!step || !shown) return
      // Bring the marker into view first: the panel is placed against it.
      var next = markers[markers.indexOf(shown) + Number(step.dataset.noteStep)]
      if (!next) return
      next.scrollIntoView({ block: 'center' })
      notes.open(next)
    })
  }

  // ── The entity card ──────────────────────────────────────────────────────

  var cardPanel = document.getElementById('entity-card')
  var island = document.querySelector('script[data-entity-data]')
  if (cardPanel && island) {
    var entities = JSON.parse(island.textContent || '{}')
    var field = function (name) { return cardPanel.querySelector('[data-card-' + name + ']') }
    var kind = field('kind')
    var label = field('label')
    var detail = field('detail')
    var note = field('note')
    var meta = field('meta')

    /** An empty line is removed, not left as a blank gap in the card. */
    var line = function (element, value) {
      element.textContent = value || ''
      element.hidden = !value
    }

    createPopover(cardPanel, ['.tei-rs[data-key]'], function (trigger) {
      var entity = entities[trigger.dataset.key]
      if (!entity) return false // no register entry: nothing to show
      kind.textContent = entity.kind
      label.textContent = entity.label
      line(detail, entity.detail)
      line(note, entity.note)

      meta.replaceChildren()
      var count = document.createElement('span')
      count.textContent = entity.count === 1 ? '1 Nennung' : entity.count + ' Nennungen'
      meta.append(count)
      entity.links.forEach(function (link) {
        var a = document.createElement('a')
        a.href = link.href
        a.rel = 'noreferrer'
        a.target = '_blank'
        a.textContent = (link.authority + ' ' + link.id + ' ↗').replace(/\s+/g, ' ')
        meta.append(a)
      })
      return true
    })
  }
})()
