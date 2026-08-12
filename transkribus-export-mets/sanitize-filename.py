#!/usr/bin/env python3
"""Turn a Transkribus document title into the base name used for the export.

Reads the title from stdin, writes the base name to stdout. Kept in sync with
local:sanitize() in refine-tei.xsl, which does the same thing for local runs.
"""

import re
import sys
import unicodedata


def repair_mojibake(title):
    """Undo a UTF-8 title that was decoded as CP1252 somewhere upstream.

    At least one Transkribus title holds a decomposed "u" + combining diaeresis
    (UTF-8 CC 88) that arrived as "Ìˆ"; encoding back to CP1252 and decoding as
    UTF-8 reverses that. A healthy title does not survive the round trip -- a
    precomposed "ü" encodes to the single byte FC, which is not valid UTF-8 --
    so a failing conversion is the normal case and means "leave the title be".
    """
    try:
        repaired = title.encode('cp1252').decode('utf-8')
    except (UnicodeEncodeError, UnicodeDecodeError):
        return title
    if repaired != title:
        print('repaired mis-encoded title: %r -> %r' % (title, repaired),
              file=sys.stderr)
    return repaired


def sanitize(title):
    title = repair_mojibake(title)
    # Compose before dropping characters, so that "u" + combining diaeresis
    # becomes a single "ü" instead of losing the diaeresis as a combining mark.
    title = unicodedata.normalize('NFC', title.strip())
    name = re.sub(r'\s+', '_', title)
    # \w keeps unicode letters and digits, so umlauts survive; everything the
    # shell, the file system or an xml:id (NCName) chokes on is dropped.
    name = re.sub(r'[^\w.-]', '', name)
    name = re.sub(r'_+', '_', name)
    return name.strip('_.-')


if __name__ == '__main__':
    # Read and write bytes, so the result never depends on the runner's locale.
    title = sys.stdin.buffer.read().decode('utf-8')
    sys.stdout.buffer.write(sanitize(title).encode('utf-8'))
