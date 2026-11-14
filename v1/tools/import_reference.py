"""Import the saved server HTML, preserving recovered CSS and local asset mappings.

Run deliberately after updating tools/live-reference.html. Never edits the base.
"""
from pathlib import Path
from html.parser import HTMLParser
import hashlib, html, json, re, unicodedata

ROOT = Path(__file__).resolve().parents[1]
manifest_path = ROOT / 'assets/manifest.json'
manifest = json.loads(manifest_path.read_text())
source_path = ROOT / 'tools/live-reference.html'
source = source_path.read_text()
for url in sorted(manifest['assets'], key=len, reverse=True):
    target = manifest['assets'][url]
    source = source.replace(html.escape(url, quote=True), target).replace(url, target)

css_count = js_count = 0
early_scripts = []

def extract_style(match):
    global css_count
    css_count += 1
    attrs, content = match.group(1), match.group(2)
    ident = re.search(r'\bid=[\'\"]([^\'\"]+)', attrs)
    name = ident.group(1) if ident else f'inline-{css_count:02}'
    relative = f'assets/css/project/{css_count:02}-{name}.css'
    content = re.sub(r'url\(([\'\"]?)(assets/[^)\'\"]+)[\'\"]?\)', r'url(\1../../../\2\1)', content)
    (ROOT / relative).write_text(content.strip() + '\n')
    media = re.search(r'\bmedia=([\'\"])(.*?)\1', attrs)
    return f'<link rel="stylesheet" href="{relative}"' + (f' media="{media.group(2)}"' if media else '') + '>'

source = re.sub(r'<style\b([^>]*)>(.*?)</style>', extract_style, source, flags=re.S | re.I)

def extract_script(match):
    global js_count
    attrs, content = match.group(1), match.group(2)
    if re.search(r'\bsrc\s*=', attrs) or not content.strip(): return match.group(0)
    typ = re.search(r'\btype=[\'\"]([^\'\"]+)', attrs)
    if typ and typ.group(1) not in ('text/javascript', 'application/javascript', 'module'): return match.group(0)
    js_count += 1
    ident = re.search(r'\bid=[\'\"]([^\'\"]+)', attrs)
    name = ident.group(1) if ident else f'bootstrap-{js_count:02}'
    digest = hashlib.sha256(content.encode()).hexdigest()[:10]
    relative = f'assets/js/project/{js_count:02}-{name}-{digest}.js'
    (ROOT / relative).write_text(content.strip() + '\n')
    tag = f'<script{attrs} src="{relative}"></script>'
    if re.search(r'var wpforms_(settings|conditional_logic)\s*=', content):
        early_scripts.append(tag)
        return ''
    return tag

source = re.sub(r'<script\b([^>]*)>(.*?)</script>', extract_script, source, flags=re.S | re.I)
source = source.replace('</head>', '\n'.join(early_scripts) + '\n</head>')
# The original Inicio URL is a WordPress route, not a static file.
source = source.replace('href="/inicio"', 'href="./"').replace("href='/inicio'", "href='./'")
parts = re.split(r'(<main\b[^>]*>|</main>)', source, maxsplit=2)
main = ''.join(parts[1:4])

class Sections(HTMLParser):
    def __init__(self, text):
        super().__init__(convert_charrefs=False)
        self.level = 0; self.start = None; self.parts = []; self.offsets = [0]
        for match in re.finditer('\n', text): self.offsets.append(match.end())
    def pos(self):
        line, col = self.getpos(); return self.offsets[line-1] + col
    def handle_starttag(self, tag, attrs):
        if tag == 'section':
            if self.level == 0: self.start = self.pos()
            self.level += 1
    def handle_endtag(self, tag):
        if tag == 'section':
            self.level -= 1
            if self.level == 0 and self.start is not None: self.parts.append((self.start, self.pos()+len('</section>')))

parser = Sections(main); parser.feed(main)
templates = ROOT / 'src/templates'
for i, (start, end) in reversed(list(enumerate(parser.parts, 1))):
    content = main[start:end]
    heading = re.search(r'<h[1-6][^>]*>(.*?)</h[1-6]>', content, re.S)
    label = re.sub('<[^>]+>', '', heading.group(1)).strip() if heading else 'section'
    label = unicodedata.normalize('NFKD', label).encode('ascii','ignore').decode().lower()
    label = re.sub('[^a-z0-9]+','-', label).strip('-')[:55] or 'section'
    name = f'{i:02}-{label}.html'
    (templates / 'sections' / name).write_text(content)
    main = main[:start] + f'<!-- @include templates/sections/{name} -->' + main[end:]
for name, content in [('document-start', parts[0]), ('main', main), ('document-end', parts[4])]:
    (templates / f'{name}.html').write_text(content)
manifest['reference_sha256'] = hashlib.sha256(source_path.read_bytes()).hexdigest()
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
print(f'Imported clean server HTML: {len(parser.parts)} sections, {css_count} styles, {js_count} scripts.')
