# Moz CRM — Contexto do Projecto

Lê este ficheiro no início de cada sessão e usa este contexto em todas as respostas.

---

## O que é este projecto

CRM interno da agência Moz, desenvolvido à medida. Serve para gerir leads e clientes, registar interacções e acompanhar o pipeline comercial.

---

## Stack técnico

| Camada | Tecnologia |
|---|---|
| Backend | Node.js 20 + Express 4 |
| Base de dados | PostgreSQL |
| Autenticação | JWT (jsonwebtoken) + bcryptjs |
| Frontend | HTML + CSS + JavaScript puro (sem framework) |
| IA | Anthropic Claude API (`@anthropic-ai/sdk`) |
| Servidor web | NGINX (reverse proxy) |
| Processo | PM2 |
| Deploy | VPS Hostinger (Ubuntu 22.04) |

---

## Estrutura de pastas

```
crm-moz/
├── src/
│   ├── app.js              # Entry point do servidor Express
│   ├── routes/
│   │   ├── auth.js         # Autenticação (login, JWT)
│   │   ├── contacts.js     # CRUD de leads/contactos
│   │   ├── claude.js       # Integração com a API Claude
│   │   └── index.js        # Agrupador de rotas
│   ├── db/
│   │   ├── index.js        # Ligação ao PostgreSQL (pool)
│   │   └── schema.sql      # Schema da base de dados
│   └── middleware/         # Middlewares Express (ex: autenticação)
├── public/
│   ├── index.html          # Página de login
│   ├── crm.html            # Dashboard principal
│   ├── assets/
│   │   ├── css/            # Folhas de estilo
│   │   └── js/             # Scripts do frontend
│   ├── leads/              # Páginas/templates de leads por cliente
│   │   ├── auto-sog/
│   │   ├── miraldino/
│   │   └── moz/
│   └── templates/          # Templates HTML reutilizáveis
├── nginx.conf              # Configuração NGINX
├── package.json
├── INSTALL.md              # Guia de instalação no servidor
└── CLAUDE.md               # Este ficheiro
```

---

## Base de dados

Três tabelas principais:

- **users** — utilizadores do CRM (roles: admin, editor, viewer)
- **contacts** — leads e clientes com campos como empresa, sector, localização, responsável, status, prioridade, valor estimado, canal de origem, follow-up
- **interactions** — histórico de interacções por contacto (nota, email, chamada, reunião, diagnóstico)

Status possíveis de um contacto: `lead | contactado | proposta | cliente | perdido`

Prioridade: `hot | media | cold`

---

## API Routes

| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/auth/login` | Login e geração de JWT |
| GET/POST | `/api/leads` | Listar e criar contactos |
| GET/PUT/DELETE | `/api/leads/:id` | Detalhe, editar e apagar contacto |
| POST | `/api/claude` | Pedidos à API Claude |
| GET | `/api/health` | Health check do servidor |

---

## Ambientes

| | Desenvolvimento | Produção |
|---|---|---|
| URL | `http://localhost:3000` | `https://crm.happymoz.com` |
| Pasta | `/Users/cristina/Documents/Claude/Projects/crm-moz` | `/var/www/crm-moz` |
| Servidor | — | VPS Hostinger (Ubuntu 22.04) |
| Processo | `npm run dev` (nodemon) | PM2 (`pm2 start src/app.js --name "moz-crm"`) |

---

## Repositório

**GitHub:** https://github.com/mozptagencia/crm-moz

Workflow de deploy:
1. Fazer commit e push para `main`
2. No servidor: `git pull && npm install --production && pm2 restart moz-crm`

---

## Variáveis de ambiente (.env)

O ficheiro `.env` não está no repositório. Contém:

- `PORT` — porta do servidor (padrão: 3000)
- `NODE_ENV` — `development` ou `production`
- `DATABASE_URL` — string de ligação ao PostgreSQL
- `JWT_SECRET` — chave secreta para assinar tokens
- `ANTHROPIC_API_KEY` — chave da API Claude
- `ALLOWED_ORIGINS` — origens permitidas pelo CORS

---

## Utilizador admin inicial

- Email: `hello@moz.pt`
- Password inicial: `moz2026` (mudar após primeiro login)
