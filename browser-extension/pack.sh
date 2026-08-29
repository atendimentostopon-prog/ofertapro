#!/usr/bin/env bash
# Gera o .zip da extensão do Mercado Livre servido em /automatizacao-mercadolivre.
# Rode sempre que mudar algo em browser-extension/mercadolivre/.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT="public/extensions/aflyo-mercadolivre-extension.zip"
mkdir -p "$(dirname "$OUT")"

python3 - "$OUT" <<'PY'
import os, sys, zipfile
out = sys.argv[1]
src = "browser-extension/mercadolivre"
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk(src):
        for f in sorted(files):
            full = os.path.join(root, f)
            rel = os.path.join("aflyo-mercadolivre", os.path.relpath(full, src))
            z.write(full, rel)
print("gerado:", out)
PY
