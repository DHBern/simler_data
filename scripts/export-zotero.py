#!/usr/bin/env python3
"""Fetch the Simler Zotero group library and write CSL-JSON and TEI exports.

Only top-level bibliographic items (i.e. no child notes/attachments, no
items in the trash) are exported, paginating through the Zotero API as
needed. Output files are only (re)written after a full, successful fetch
with a plausible (non-empty) result, so a failed or partial run cannot
overwrite good data already committed to the repository.
"""
import datetime
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

GROUP_ID = os.environ.get("ZOTERO_GROUP_ID", "6591765")
BASE_URL = f"https://api.zotero.org/groups/{GROUP_ID}/items/top"
PAGE_LIMIT = 100
MAX_RETRIES = 5
USER_AGENT = "simler_data-zotero-export (+https://github.com/DHBern/simler_data)"

CSL_JSON_OUT = os.path.join("zotero", "csl-json", "library.json")
TEI_OUT = os.path.join("zotero", "tei", "library.xml")

TEI_NS = "http://www.tei-c.org/ns/1.0"
LINK_RE = re.compile(r'<([^>]+)>\s*;\s*rel="([^"]+)"')


def request_with_retries(url):
    headers = {
        "Accept": "*/*",
        "User-Agent": USER_AGENT,
        "Zotero-API-Version": "3",
    }

    last_error = None
    for attempt in range(1, MAX_RETRIES + 1):
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return resp.read(), resp.headers
        except urllib.error.HTTPError as e:
            last_error = e
            if e.code == 429 or e.code >= 500:
                retry_after = e.headers.get("Retry-After") or e.headers.get("Backoff")
                wait = float(retry_after) if retry_after else min(2**attempt, 30)
                print(f"  {url} -> HTTP {e.code}; retrying in {wait:.0f}s...", file=sys.stderr)
                time.sleep(wait)
                continue
            raise RuntimeError(f"Zotero API request failed ({e.code}) for {url}: {e.reason}")
        except urllib.error.URLError as e:
            last_error = e
            wait = min(2**attempt, 30)
            print(f"  {url} -> {e}; retrying in {wait:.0f}s...", file=sys.stderr)
            time.sleep(wait)
    raise RuntimeError(f"Giving up on {url} after {MAX_RETRIES} attempts: {last_error}")


def parse_next_link(link_header):
    if not link_header:
        return None
    for url, rel in LINK_RE.findall(link_header):
        if rel == "next":
            return url
    return None


def fetch_all_pages(fmt):
    url = f"{BASE_URL}?format={fmt}&limit={PAGE_LIMIT}&sort=title"
    pages = []
    while url:
        print(f"Fetching {url}")
        body, headers = request_with_retries(url)
        pages.append(body)
        backoff = headers.get("Backoff")
        if backoff:
            time.sleep(float(backoff))
        url = parse_next_link(headers.get("Link"))
    return pages


def build_csl_json():
    items = []
    for page in fetch_all_pages("csljson"):
        data = json.loads(page)
        items.extend(data["items"] if isinstance(data, dict) else data)

    if not items:
        raise RuntimeError("CSL-JSON fetch returned zero items; refusing to overwrite existing export.")

    return json.dumps(items, ensure_ascii=False, indent=2) + "\n"


def build_tei():
    ET.register_namespace("", TEI_NS)
    list_bibl = ET.Element(f"{{{TEI_NS}}}listBibl")
    for page in fetch_all_pages("tei"):
        root = ET.fromstring(page)
        list_bibl.extend(list(root))

    if len(list_bibl) == 0:
        raise RuntimeError("TEI fetch returned zero entries; refusing to overwrite existing export.")

    today = datetime.datetime.now(datetime.timezone.utc).date().isoformat()
    tei = ET.Element(f"{{{TEI_NS}}}TEI")
    header = ET.SubElement(tei, f"{{{TEI_NS}}}teiHeader")
    file_desc = ET.SubElement(header, f"{{{TEI_NS}}}fileDesc")
    title_stmt = ET.SubElement(file_desc, f"{{{TEI_NS}}}titleStmt")
    ET.SubElement(title_stmt, f"{{{TEI_NS}}}title").text = "Simler Zotero group library (TEI export)"
    pub_stmt = ET.SubElement(file_desc, f"{{{TEI_NS}}}publicationStmt")
    pub_p = ET.SubElement(pub_stmt, f"{{{TEI_NS}}}p")
    pub_p.text = (
        "Automatically exported from the Zotero group library "
        f"https://www.zotero.org/groups/{GROUP_ID}/simler on "
    )
    ET.SubElement(pub_p, f"{{{TEI_NS}}}date", {"when": today}).text = today
    source_desc = ET.SubElement(file_desc, f"{{{TEI_NS}}}sourceDesc")
    ET.SubElement(source_desc, f"{{{TEI_NS}}}p").text = "Zotero API (items/top, format=tei)"
    text = ET.SubElement(tei, f"{{{TEI_NS}}}text")
    body = ET.SubElement(text, f"{{{TEI_NS}}}body")
    body.append(list_bibl)

    ET.indent(tei, space="  ")
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(tei, encoding="unicode") + "\n"


def write_output(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)
    print(f"Wrote {path} ({len(content)} chars)")


def main():
    csl_json = build_csl_json()
    tei_xml = build_tei()
    write_output(CSL_JSON_OUT, csl_json)
    write_output(TEI_OUT, tei_xml)


if __name__ == "__main__":
    main()
