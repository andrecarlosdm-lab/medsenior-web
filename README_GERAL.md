# MedSenior PRO - pacote web completo com anexos no Supabase Storage

## Conteúdo
- frontend/ -> publicar na Vercel
- backend/ -> publicar no Render
- backend/sql/01_medsenior_schema.sql -> rodar no SQL Editor do Supabase

## Ordem de publicação
1. No Supabase, abra o projeto.
2. Vá em SQL Editor > New query.
3. Rode `backend/sql/01_medsenior_schema.sql`.
4. No Render, publique a pasta `backend`.
5. Configure no Render:
   - DATABASE_URL
   - JWT_SECRET
   - CORS_ORIGIN
   - SUPABASE_URL
   - SUPABASE_SERVICE_ROLE_KEY
   - SUPABASE_STORAGE_BUCKET=medsenior-anexos
6. Na Vercel, publique a pasta `frontend`.
7. Defina a URL da API no frontend.

## Upload de anexos
- Os anexos agora sobem para o Supabase Storage em bucket privado.
- O backend faz upload e gera URL assinada para visualização.
- Tipos aceitos no bucket: PDF, JPG, PNG, WEBP e GIF.
- Limite configurado no bucket: 10 MB por arquivo.

## Rotas de anexos
- GET /records/:id/attachments
- POST /records/:id/attachments
- GET /records/:id/attachments/:attachmentId/url
- DELETE /records/:id/attachments/:attachmentId
