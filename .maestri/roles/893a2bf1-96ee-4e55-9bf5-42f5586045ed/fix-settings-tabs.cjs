const fs = require('node:fs');
const path = 'D:/ofertapro/src/pages/Settings.tsx';
let source = fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const before = '    const ro = new ResizeObserver(updateTabsScrollState);';
const after = `    const ro = new ResizeObserver(() => {
      const selected = tablistRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]');
      if (selected && el.clientWidth < el.scrollWidth) {
        el.scrollLeft = selected.offsetLeft - (el.clientWidth - selected.offsetWidth) / 2;
      }
      updateTabsScrollState();
    });`;
if (!source.includes(before)) throw new Error('Expected source missing');
source = source.replace(before, after);
fs.writeFileSync(path, source);
