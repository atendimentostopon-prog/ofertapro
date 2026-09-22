import fs from 'node:fs';
const file = 'review-stage/src/pages/Offers.tsx';
let s = fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
s = s.replace('setSearchParams({ q: val });', 'setSearchParams({ q: val }, { replace: true });').replace('setSearchParams({});', 'setSearchParams({}, { replace: true });');
s = s.replace('onClick={() => setStatusFilter(s)}', 'onClick={() => setStatusFilter(s)}\n                    aria-pressed={statusFilter === s}');
const start = s.indexOf('          {/* Category Filter */}');
const end = s.indexOf('\n        </div>\n      </Card>', start);
if (start < 0 || end < 0) throw new Error('Filter boundaries missing');
s = s.slice(0, start) + `          <select
            aria-label="Filtrar por categoria"
            value={categoryFilter}
            onChange={event => setCategoryFilter(event.target.value)}
            className="max-w-full rounded-md border border-line bg-surface-0 px-3 py-2 text-xs text-ink focus-visible:shadow-focus"
          >
            {CATEGORIES.map(category => <option key={category} value={category}>{category === 'Todos' ? 'Todas as categorias' : category}</option>)}
          </select>` + s.slice(end);
s = s.replaceAll("search || marketplaceFilter !== 'all' || categoryFilter !== 'Todos'", "search || statusFilter !== 'all' || marketplaceFilter !== 'all' || categoryFilter !== 'Todos'");
s = s.replace('Minhas Ofertas', 'Minhas ofertas').replaceAll('Nova Oferta', 'Nova oferta').replace('Excluir Todas', 'Excluir ofertas filtradas');
s = s.replace('Essa ação é irreversível.', 'Essa ação é irreversível.');
fs.writeFileSync(file, s);
const newOffer = 'review-stage/src/pages/NewOfferPage.tsx';
s = fs.readFileSync(newOffer, 'utf8').replace('O sistema tenta extrair dados via Open Graph sem fazer scraping agressivo. Se não encontrar, você preenche manualmente na próxima etapa.', 'Se não conseguirmos preencher os dados do produto, você poderá adicioná-los na próxima etapa.');
fs.writeFileSync(newOffer, s);
