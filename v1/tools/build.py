"""Compile HTML templates without third-party dependencies."""
from pathlib import Path
import re
ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'src'
INCLUDE = re.compile(r'<!-- @include ([\w/.-]+) -->')

def render(path, stack=()):
    path = path.resolve()
    if not path.is_relative_to(SOURCE.resolve()):
        raise ValueError(f'Include outside src: {path}')
    if path in stack:
        raise ValueError(f'Circular include: {path}')
    return INCLUDE.sub(lambda m: render(SOURCE / m.group(1), (*stack, path)), path.read_text())

if __name__ == '__main__':
    output = ROOT / 'index.html'
    output.write_text(render(SOURCE / 'index.html'))
    print(f'Built {output}')
