# Backend MedSenior PRO

## Variáveis obrigatórias
- DATABASE_URL
- JWT_SECRET
- CORS_ORIGIN
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY

## Variáveis opcionais
- SUPABASE_STORAGE_BUCKET=medsenior-anexos
- ATTACHMENT_SIGNED_URL_TTL=3600
- JWT_EXPIRES_IN=12h
- SEED_ON_START=false

## Rodar localmente
```bash
npm install
cp .env.example .env
npm start
```

## Upload de anexos
O upload usa Supabase Storage com bucket privado. O backend envia os arquivos usando a service role key e devolve links assinados para visualização.

## Rotas principais
- POST /auth/login
- GET/POST/PUT /users
- GET/POST/PUT /providers
- GET/POST/PUT /records
- GET/POST /records/:id/messages
- GET/POST /records/:id/info
- GET /records/:id/attachments
- POST /records/:id/attachments
- GET /records/:id/attachments/:attachmentId/url
- DELETE /records/:id/attachments/:attachmentId
- GET /dashboard/leadership
