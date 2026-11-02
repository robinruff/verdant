#!/usr/bin/env python3
"""Enrich a Verdant schema-2 backup's plant types with Pl@ntNet genus/family.

Only exact species matches are used. Names are never split/inferred. Everything
other than data.json stays intact; images are streamed in 256 KiB chunks.
The original backup is NEVER edited.

Usage:
    PLANTNET_API_KEY=... python3 scripts/enrich_backup_taxonomy.py garden.zip
    python3 scripts/enrich_backup_taxonomy.py garden.zip --output garden-reviewed.zip
    python3 scripts/enrich_backup_taxonomy.py garden.zip --report-only

Also accepts Verdant schema-2 JSON exports (format & data.plantTypes).
Python 3.9+ standard library only. Internet is needed for the Pl@ntNet calls.
"""
from __future__ import annotations

import argparse
import copy
import getpass
import json
import os
from pathlib import Path
import shutil
import struct
import sys
import tempfile
import time
import unicodedata
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, quote
from urllib.request import Request, urlopen
import zipfile

MAX_ZIP32 = 0xFFFFFFFF
CHUNK = 256 * 1024
API_ROOT = 'https://my-api.plantnet.org'


def plain(value):
    return unicodedata.normalize('NFKC', ' '.join(str(value or '').strip().split())).casefold()


def taxon(value):
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, dict):
        return str(value.get('scientificNameWithoutAuthor') or value.get('scientificName') or '').strip()
    return ''


def extract_list(data):
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ('results', 'species'):
            if isinstance(data.get(key), list):
                return data[key]
    return []


def find_exact(candidates, species_name):
    """Return (genus, family, status) or no values for unmatched/ambiguous.

    Never guess from the words in species_name. Different taxonomy classifications
    for the *same* matched scientific species are flagged as ambiguous.
    """
    exact = []
    for item in candidates:
        if not isinstance(item, dict):
            continue
        record = item.get('species') if isinstance(item.get('species'), dict) else item
        aliases = [record.get('scientificNameWithoutAuthor'), record.get('scientificName')]
        if plain(species_name) not in {plain(n) for n in aliases if isinstance(n, str) and n.strip()}:
            continue
        genus, family = taxon(record.get('genus')), taxon(record.get('family'))
        if genus or family:
            exact.append((genus, family))
    if not exact:
        return ('', '', 'no_exact_match')
    different = {(plain(a), plain(b)) for a, b in exact}
    if len(different) > 1:
        return ('', '', 'ambiguous')
    return (*exact[0], 'matched')


def search_plantnet(scientific_name, api_key, project, *, opener=urlopen, max_pages=3, page_size=100):
    """Fetch project-specific species list, returning fields only on exact match.

    Default project k-world-flora is deliberately not the global route: since
    May 2025 project-specific lists include both family and genus.
    """
    endpoint = API_ROOT + '/v2/projects/' + quote(project, safe='') + '/species'
    all_candidates = []
    for page in range(1, max_pages + 1):
        url = endpoint + '?' + urlencode({
            'prefix': scientific_name, 'pageSize': page_size, 'page': page,
            'lang': 'en', 'api-key': api_key,
        })
        req = Request(url, headers={'Accept': 'application/json', 'User-Agent': 'VerdantTaxonomyEnricher/1.5.5'})
        with opener(req, timeout=25) as response:
            items = extract_list(json.load(response))
        all_candidates.extend(items)
        # We can stop as soon as we've inspected a full page and found an exact
        # candidate, but scan whole page to catch contradictory taxonomic records.
        if len(items) < page_size or not items:
            break
        if find_exact(all_candidates, scientific_name)[2] == 'matched':
            break
    return find_exact(all_candidates, scientific_name)


def validate_backup(backup):
    if not isinstance(backup, dict) or backup.get('format') != 'verdant-garden-backup' or backup.get('schemaVersion') != 2:
        raise ValueError('Expected a Verdant schema-2 backup; no changes made')
    data = backup.get('data')
    if not isinstance(data, dict) or not isinstance(data.get('plantTypes'), list):
        raise ValueError('Missing data.plantTypes; no changes made')
    if not all(isinstance(t, dict) and isinstance(t.get('id'), str) for t in data['plantTypes']):
        raise ValueError('Invalid plantTypes array; no changes made')
    if len({t['id'] for t in data['plantTypes']}) != len(data['plantTypes']):
        raise ValueError('Duplicate type IDs; no changes made')
    return data['plantTypes']


def enrich(backup, api_key, project, *, lookup=search_plantnet, replace_existing=False, delay=0.35, log=print):
    types = validate_backup(backup)
    report = []
    cache = {}
    for i, record in enumerate(types, start=1):
        name = str(record.get('scientificName') or record.get('species') or '').strip()
        missing = [field for field in ('genus', 'family') if replace_existing or not str(record.get(field) or '').strip()]
        row = {'id': record['id'], 'scientificName': name, 'status': '', 'genus': '', 'family': ''}
        if not missing:
            row['status'] = 'already_filled'
        elif not name:
            row['status'] = 'no_scientific_name'
        else:
            key = plain(name)
            try:
                if key not in cache:
                    if cache and delay:
                        time.sleep(delay)
                    cache[key] = lookup(name, api_key, project)
                genus, family, status = cache[key]
                row.update(genus=genus, family=family, status=status)
                if status == 'matched':
                    changed = 0
                    for field, value in (('genus', genus), ('family', family)):
                        if value and field in missing and record.get(field) != value:
                            record[field] = value
                            changed += 1
                    row['status'] = 'updated' if changed else 'matched_no_new_fields'
            except (HTTPError, URLError, TimeoutError, ValueError, OSError) as exc:
                # Never conceal failure or replace fields with speculative data.
                row['status'] = 'api_error'
                row['error'] = f'{type(exc).__name__}: {getattr(exc, "code", str(exc))}'
        report.append(row)
        log(f'[{i}/{len(types)}] {name or "(unnamed)"}: {row["status"]}' + (f' ({row["error"]})' if 'error' in row else ''))
    return report


def patch_utf8_flags(path):
    """Python's ZIP writer omits UTF-8 flags for ASCII names.

    Verdant's ZIP32 reader requires UTF-8 flag bit 11 on EVERY entry. Patch
    just the local & central header flags in-place, without touching file data.
    """
    with zipfile.ZipFile(path, 'r') as archive:
        info = archive.infolist()
        end = archive.start_dir
    with open(path, 'r+b') as output:
        for entry in info:
            output.seek(entry.header_offset + 6)
            flags = struct.unpack('<H', output.read(2))[0]
            output.seek(entry.header_offset + 6)
            output.write(struct.pack('<H', flags | 0x0800))
        output.seek(end)
        for entry in info:
            beginning = output.tell()
            header = output.read(46)
            if len(header) != 46 or header[:4] != b'PK\x01\x02':
                raise ValueError('ZIP central directory is invalid')
            name_size, extra_size, comment_size = struct.unpack_from('<HHH', header, 28)
            flags = struct.unpack_from('<H', header, 8)[0]
            output.seek(beginning + 8)
            output.write(struct.pack('<H', flags | 0x0800))
            output.seek(beginning + 46 + name_size + extra_size + comment_size)


def read_input(path):
    if path.suffix.lower() == '.json':
        return json.loads(path.read_text(encoding='utf-8')), False
    with zipfile.ZipFile(path, 'r') as source:
        names = source.namelist()
        if not names or names[0] != 'data.json' or len(names) != len(set(names)):
            raise ValueError('Invalid ZIP: data.json must be first, without duplicate paths')
        if source.getinfo('data.json').file_size > 24 * 1024 * 1024:
            raise ValueError('data.json exceeds 24 MiB Verdant limit')
        backup = json.loads(source.read('data.json'))
        validate_backup(backup)
        expected = ['data.json'] + [meta['path'] for meta in backup['data'].get('images', [])]
        if names != expected or any(not str(p).startswith('images/') for p in names[1:]):
            raise ValueError('ZIP image paths disagree with data.json manifest')
        if any(p.compress_type != zipfile.ZIP_STORED for p in source.infolist()):
            raise ValueError('Input ZIP must be uncompressed as required by Verdant')
    return backup, True


def write_output(input_path, output_path, backup, is_zip):
    encoded = json.dumps(backup, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    if len(encoded) > 24 * 1024 * 1024:
        raise ValueError('data.json too large for Verdant')
    if output_path.resolve() == input_path.resolve():
        raise ValueError('Refusing to overwrite original backup')
    if output_path.exists():
        raise FileExistsError(f'Output already exists: {output_path}')
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temp_name = None
    try:
        with tempfile.NamedTemporaryFile(prefix='.verdant-enrich-', suffix=output_path.suffix, dir=output_path.parent, delete=False) as tmp:
            temp_name = Path(tmp.name)
        if not is_zip:
            temp_name.write_bytes(encoded)
        else:
            with zipfile.ZipFile(input_path, 'r') as original, zipfile.ZipFile(temp_name, 'w', compression=zipfile.ZIP_STORED, allowZip64=False) as dest:
                dest.writestr('data.json', encoded, compress_type=zipfile.ZIP_STORED)
                for entry in original.infolist()[1:]:
                    # Streaming prevents large photo archives being held in RAM.
                    with original.open(entry, 'r') as reader, dest.open(entry.filename, 'w', force_zip64=False) as writer:
                        shutil.copyfileobj(reader, writer, CHUNK)
            if temp_name.stat().st_size > MAX_ZIP32:
                raise ValueError('Backup exceeds Verdant ZIP32 limit (4 GiB)')
            patch_utf8_flags(temp_name)
            with zipfile.ZipFile(temp_name) as check:
                assert check.testzip() is None, 'CRC check failed'
                assert len(check.namelist()) == len(original_names(input_path)), 'Entry count changed'
        temp_name.replace(output_path)
    except Exception:
        if temp_name and temp_name.exists():
            temp_name.unlink()
        raise


def original_names(path):
    with zipfile.ZipFile(path) as z:
        return z.namelist()


def main(argv=None):
    parser = argparse.ArgumentParser(description='Enrich a Verdant exported backup with verified Pl@ntNet family/genus (no inference).')
    parser.add_argument('backup', type=Path, help='Original Verdant schema-2 .zip or .json')
    parser.add_argument('--output', type=Path, help='New filename; default: <original>.taxonomy-enriched.<ext>')
    parser.add_argument('--project', default='k-world-flora', help='Pl@ntNet flora project (default: k-world-flora)')
    parser.add_argument('--report-only', action='store_true', help='Look up names and report, but do not write an enriched backup')
    parser.add_argument('--replace-existing', action='store_true', help='Explicitly permit replacing existing genus/family with matched Pl@ntNet values')
    parser.add_argument('--delay', type=float, default=0.35, help='Seconds between distinct API requests (default: 0.35)')
    args = parser.parse_args(argv)
    if args.delay < 0 or args.delay > 60:
        parser.error('--delay must be between 0 and 60 seconds')
    if not args.backup.exists():
        parser.error('Backup file does not exist')
    output = args.output or args.backup.with_name(args.backup.stem + '.taxonomy-enriched' + args.backup.suffix)
    if not args.report_only and (output.resolve() == args.backup.resolve() or output.exists()):
        parser.error('Output exists or equals the input; original backup cannot be overwritten')
    backup, is_zip = read_input(args.backup)
    # No personal API key is included in Verdant backups. Keep it out of files.
    key = os.environ.get('PLANTNET_API_KEY', '').strip() or getpass.getpass('Pl@ntNet API key (hidden): ').strip()
    if not key:
        parser.error('API key required')
    report = enrich(backup, key, args.project, replace_existing=args.replace_existing, delay=args.delay)
    totals = {}
    for item in report:
        totals[item['status']] = totals.get(item['status'], 0) + 1
    print('Summary: ' + ', '.join(f'{name}={count}' for name, count in sorted(totals.items())))
    if not args.report_only:
        write_output(args.backup, output, backup, is_zip)
        print(f'New backup: {output}')
        print('Original unchanged. Verify the new ZIP and review genus/family BEFORE any restore.')
    if totals.get('api_error'):
        print('WARNING: Some online lookups failed. Those records were left unchanged.', file=sys.stderr)
    if totals.get('ambiguous'):
        print('WARNING: Ambiguous taxonomy: those records were left unchanged.', file=sys.stderr)
    return 0


if __name__ == '__main__':
    sys.exit(main())
