#!/usr/bin/env bash
# Gera os dois pacotes da extensão do Mercado Livre. Rode sempre que mudar algo em
# browser-extension/mercadolivre/.
#  1) public/extensions/aflyo-mercadolivre-extension.zip -> download manual em
#     /automatizacao-mercadolivre (pasta aflyo-mercadolivre/ dentro do zip).
#  2) browser-extension/store/aflyo-mercadolivre-chrome-web-store.zip -> upload na Chrome
#     Web Store, que exige o manifest.json na RAIZ do zip.
set -euo pipefail
cd "$(dirname "$0")/.."

python3 - <<'PY'
import os, zipfile
src = "browser-extension/mercadolivre"
def build(out, prefix):
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for root, _, files in os.walk(src):
            for f in sorted(files):
                full = os.path.join(root, f)
                rel = os.path.relpath(full, src)
                z.write(full, os.path.join(prefix, rel) if prefix else rel)
    print("gerado:", out)
build("public/extensions/aflyo-mercadolivre-extension.zip", "aflyo-mercadolivre")
build("browser-extension/store/aflyo-mercadolivre-chrome-web-store.zip", "")
PY
