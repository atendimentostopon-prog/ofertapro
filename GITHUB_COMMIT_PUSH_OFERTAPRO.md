# Commit e Push — OfertaPro

Este documento formaliza as auditorias de segurança, revisões de configuração e o envio do código-fonte do OfertaPro ao repositório remoto conectado no GitHub.

## 1. Repositório conectado
- **Remote Origin:** `https://github.com/atendimentostopon-prog/ofertapro.git`

## 2. Branch usada
- **Branch Atual:** `main` (rastreando `origin/main`)

## 3. .gitignore revisado
O arquivo `.gitignore` foi auditado e atualizado para cobrir de forma abrangente todas as pastas geradas, arquivos de ambiente locais e logs. 
Garante que os seguintes diretórios e padrões permaneçam estritamente fora do controle de versão:
- Pastas de dependências: `node_modules/`
- Pastas de build: `dist/`, `build/`
- Arquivos de configuração local de ambiente: `.env`, `.env.local`, `.env.production`, `.env.*.local`, `.env.*` (liberando apenas o template `.env.example`)
- Pastas temporárias do ecossistema e deploy: `.vercel/`, `.netlify/`
- Pastas locais do Supabase: `supabase/.branches`, `supabase/.temp`

## 4. .env.example revisado
O arquivo `.env.example` foi higienizado. Todas as chaves e a URL do Supabase foram substituídas por campos em branco seguros:
- `VITE_SUPABASE_URL=`
- `VITE_SUPABASE_ANON_KEY=`
- `VITE_EVOLUTION_URL=`
- `VITE_EVOLUTION_API_KEY=`

## 5. Auditoria de secrets
Foi executada uma busca estática detalhada no codebase por padrões comuns de vazamento (ex: `service_role`, `DISCORD_WEBHOOK`, `TELEGRAM_BOT_TOKEN`, senhas e tokens reais).
- **Resultados:** Nenhuma credencial ativa ou URL de webhook real foi encontrada em arquivos do código-fonte ou em relatórios markdown.
- **Tratamento:** As referências a tokens de canais são limitadas a placeholders e a strings de máscara visual (`••••••••`) no painel de controle. Os tokens reais de Telegram e Discord Webhooks são armazenados criptografados diretamente na base de dados (`channels.metadata`) e nunca são hardcoded nas fontes.

## 6. Arquivos commitados
Uma pasta inteira de novos recursos de estabilização do MVP do OfertaPro foi consolidada, totalizando 127 arquivos modificados, adicionados ou deletados, incluindo:
- Ajustes de responsividade
- Normalização de extensões de arquivos de imagem e logos
- Componentes reutilizáveis em `src/components/ui/` e hooks customizados
- Scripts de migração SQL (`supabase_*.sql`) para fácil provisionamento de banco de dados
- Arquivo de configuração de SPA para a Vercel (`vercel.json`)

## 7. Mensagem do commit
- **Mensagem:** `feat: estabiliza OfertaPro para deploy beta`
- **Hash do Commit Local:** `5a27538`

## 8. Resultado do push
- **Status:** Sucesso completo.
- **Log:**
  ```text
  To https://github.com/atendimentostopon-prog/ofertapro.git
     07a1ff1..5a27538  main -> main
  branch 'main' set up to track 'origin/main'.
  ```

## 9. URL do GitHub
- **Repositório:** [https://github.com/atendimentostopon-prog/ofertapro](https://github.com/atendimentostopon-prog/ofertapro)

## 10. Próximos passos para Vercel
Para concluir o deploy de produção na Vercel:
1. Acesse o painel da Vercel e importe o projeto `ofertapro`.
2. Configure as seguintes **Environment Variables** no projeto da Vercel:
   - `VITE_SUPABASE_URL` = (URL de produção do seu projeto Supabase Cloud)
   - `VITE_SUPABASE_ANON_KEY` = (Anon Key pública do seu projeto Supabase Cloud)
   - `VITE_EVOLUTION_URL` = (Deixe em branco no beta para desativar a integração de WhatsApp, ou configure se usar gateway)
   - `VITE_EVOLUTION_API_KEY` = (Deixe em branco no beta)
3. O deploy será executado automaticamente a partir de agora a cada push na branch `main`. A configuração de redirecionamento SPA já está embutida no `vercel.json` no repositório.
