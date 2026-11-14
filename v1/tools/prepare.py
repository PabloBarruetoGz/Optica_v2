"""Recreate v1 from its saved reference, never from the base folder."""
from pathlib import Path
import hashlib, json, runpy
ROOT = Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT / 'assets/manifest.json').read_text())
base = ROOT.parent / 'Base del Proyecto/index.html'
assert hashlib.sha256(base.read_bytes()).hexdigest() == manifest['source_sha256'], 'Base changed since initial import.'
runpy.run_path(str(ROOT / 'tools/import_reference.py'), run_name='__main__')
runpy.run_path(str(ROOT / 'tools/build.py'), run_name='__main__')
assert hashlib.sha256(base.read_bytes()).hexdigest() == manifest['source_sha256']
