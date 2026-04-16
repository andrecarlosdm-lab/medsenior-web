# Frontend MedSenior

Arquivos:
- index.html
- vercel.json
- config.example.js

## Publicar na Vercel
1. Crie um repositório no GitHub.
2. Envie o conteúdo desta pasta `frontend`.
3. Na Vercel, importe o repositório.
4. Depois do deploy, abra o arquivo `index.html` e troque o valor padrão da API para a URL real do backend, ou crie um `config.js` baseado em `config.example.js` e inclua antes dos scripts principais.

## API
O HTML usa por padrão:
- `window.API_URL`
- ou `window.MEDSENIOR_API_URL`
- ou `http://localhost:3000`

Em produção, use a URL do Render.
