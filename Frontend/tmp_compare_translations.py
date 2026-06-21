import re
from pathlib import Path
path = Path('app.js')
code = path.read_text(encoding='utf-8')
used = sorted({m.group(1) for m in re.finditer(r'trans\.([A-Za-z0-9_]+)', code)})
print('used keys:')
print(', '.join(used))
start = code.index('const uiTranslations')
brace_start = code.index('{', start)

depth = 0
for i, ch in enumerate(code[brace_start:], start=brace_start):
    if ch == '{':
        depth += 1
    elif ch == '}':
        depth -= 1
    if depth == 0:
        ui_text = code[brace_start:i+1]
        break
else:
    raise SystemExit('Could not parse uiTranslations object')

lang_pattern = re.compile(r'([A-Za-z0-9_]+)\s*:\s*\{')
langs = {}
for match in lang_pattern.finditer(ui_text):
    lang = match.group(1)
    start_idx = match.end()
    depth2 = 1
    j = start_idx
    while j < len(ui_text) and depth2 > 0:
        if ui_text[j] == '{':
            depth2 += 1
        elif ui_text[j] == '}':
            depth2 -= 1
        j += 1
    body = ui_text[start_idx:j-1]
    keys = sorted({m2.group(1) for m2 in re.finditer(r'([A-Za-z0-9_]+)\s*:', body)})
    langs[lang] = keys

for lang, keys in langs.items():
    missing = [k for k in used if k not in keys]
    extra = [k for k in keys if k not in used]
    print(f'LANG {lang}')
    print(' missing:', ', '.join(missing) if missing else '(none)')
    print(' extra:', ', '.join(extra) if extra else '(none)')
