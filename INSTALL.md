# Moz CRM · Guia de Instalação no Servidor

## Pré-requisitos
VPS Ubuntu 22.04+ com acesso root via SSH.

---

## 1. Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v && npm -v
```

---

## 2. PostgreSQL

```bash
sudo apt-get install -y postgresql postgresql-contrib

# Arrancar e activar no boot
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Criar base de dados e utilizador
sudo -u postgres psql << SQL
CREATE USER moz_crm WITH PASSWORD 'PASSWORD_AQUI';
CREATE DATABASE moz_crm OWNER moz_crm;
GRANT ALL PRIVILEGES ON DATABASE moz_crm TO moz_crm;
SQL

# Executar o schema
sudo -u postgres psql -d moz_crm -f /var/www/moz-crm/src/db/schema.sql
```

---

## 3. NGINX

```bash
sudo apt-get install -y nginx

# Copiar a configuração
sudo cp nginx.conf /etc/nginx/sites-available/crm.moz.pt
sudo ln -s /etc/nginx/sites-available/crm.moz.pt /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

---

## 4. SSL com Certbot

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d crm.moz.pt
# O Certbot actualiza o nginx.conf automaticamente
sudo systemctl reload nginx
```

---

## 5. PM2 (manter o Node.js a correr)

```bash
sudo npm install -g pm2

# Arrancar a aplicação
cd /var/www/moz-crm
pm2 start src/app.js --name "moz-crm"

# Guardar para reiniciar com o servidor
pm2 save
pm2 startup   # seguir as instruções que aparecem
```

---

## 6. Deploy do projecto

```bash
# Criar pasta
sudo mkdir -p /var/www/moz-crm
sudo chown $USER:$USER /var/www/moz-crm

# Copiar ficheiros (ou clonar do git)
cp -r . /var/www/moz-crm/

# Instalar dependências
cd /var/www/moz-crm
npm install --production

# Criar .env a partir do exemplo
cp .env.example .env
nano .env   # preencher os valores reais

# Arrancar
pm2 start src/app.js --name "moz-crm"
```

---

## Verificar que está tudo a funcionar

```bash
# Health check
curl http://localhost:3000/api/health

# Logs
pm2 logs moz-crm

# Status
pm2 status
```
