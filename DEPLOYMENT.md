# 🚀 Deployment Guide: USA Creator Finder & Outreach Engine v2.0

Comprehensive production deployment documentation for **USA Creator Finder & Outreach Engine**.

---

## 📋 Table of Contents
1. [Architecture & Technology Stack](#-architecture--technology-stack)
2. [Environment Variables Reference](#-environment-variables-reference)
3. [Deployment Method A: Render.com (Recommended PaaS)](#-deployment-method-a-rendercom-recommended-paas)
4. [Deployment Method B: Railway.app](#-deployment-method-b-railwayapp)
5. [Deployment Method C: Ubuntu VPS / DigitalOcean / AWS EC2](#-deployment-method-c-ubuntu-vps--digitalocean--aws-ec2)
6. [Deployment Method D: Docker & Docker Compose](#-deployment-method-d-docker--docker-compose)
7. [Post-Deployment Verification](#-post-deployment-verification)
8. [Security & Maintenance Best Practices](#-security--maintenance-best-practices)

---

## 🏗️ Architecture & Technology Stack

* **Backend Server**: Node.js v18+ / v20+ with Express
* **Database**: PostgreSQL (Cloud PostgreSQL / Supabase / Neon / Render Postgres)
* **AI Extraction**: OpenAI GPT-4o-mini API (`json_object` mode)
* **Search Engine**: Serper.dev Organic Google SERP API
* **Outreach Mailer**: Nodemailer via Gmail SMTP TLS (Port 587)
* **Security & Auth**: Session Cookie Auth with configurable `.env` admin credentials

---

## 🔑 Environment Variables Reference

| Variable Name | Required | Default / Example | Description |
| :--- | :---: | :--- | :--- |
| `PORT` | Optional | `10000` | Application HTTP server listening port |
| `OPENAI_API_KEY` | **Required** | `sk-proj-...` | OpenAI API key for GPT-4o-mini extraction |
| `SERPER_KEY` | **Required** | `27c9f524...` | Serper.dev API key for Google SERP queries |
| `SERPER_DAILY_CREDIT_LIMIT` | Optional | `150` | Maximum Serper search queries allowed per day |
| `DATABASE_URL` | **Required** | `postgresql://...` | PostgreSQL connection pooler string |
| `DIRECT_URL` | Optional | `postgresql://...` | PostgreSQL direct connection string |
| `GMAIL_USER` | **Required** | `support@makeable.nyc` | Sender Gmail address for outreach emails |
| `GMAIL_APP_PASSWORD` | **Required** | `irrmbccu...` | 16-character Gmail App Password |
| `SMTP_HOST` | Optional | `smtp.gmail.com` | SMTP Server hostname |
| `SMTP_PORT` | Optional | `587` | SMTP Server port |
| `EMAIL_DAILY_LIMIT` | Optional | `200` | Maximum outreach emails allowed per day |
| `ADMIN_USERNAME` | **Required** | `admin` | Admin dashboard login ID |
| `ADMIN_PASSWORD` | **Required** | `your_secure_pass` | Admin dashboard login password |
| `SECRET_KEY` | **Required** | `your_secret_key` | Secret key for HTTP session cookies |
| `APP_BASE_URL` | Optional | `https://your-domain.com` | Production URL domain |

---

## ☁️ Deployment Method A: Render.com (Recommended PaaS)

Render is the simplest PaaS platform for deploying Node.js web applications with automatic SSL.

### Step 1: Push Repository to GitHub
Ensure your repository is pushed to GitHub:
```bash
git push origin main
```

### Step 2: Create Web Service on Render
1. Log in to [Render Dashboard](https://dashboard.render.com).
2. Click **New +** ➔ **Web Service**.
3. Connect your GitHub repository: `mr-aryan-rana/usa-creator-outreach-engine`.
4. Configure service parameters:
   * **Name**: `usa-creator-outreach-engine`
   * **Region**: Oregon (US West) or Ohio (US East)
   * **Branch**: `main`
   * **Runtime**: `Node`
   * **Build Command**: `npm install`
   * **Start Command**: `npm start`
   * **Instance Type**: Free or Starter ($7/mo)

### Step 3: Add Environment Variables
Under **Environment Variables**, add all environment variables listed in the table above:
* `OPENAI_API_KEY`
* `SERPER_KEY`
* `DATABASE_URL`
* `GMAIL_USER`
* `GMAIL_APP_PASSWORD`
* `ADMIN_USERNAME`
* `ADMIN_PASSWORD`
* `SECRET_KEY`

### Step 4: Deploy
Click **Create Web Service**. Render will automatically build, deploy, and assign a free SSL HTTPS domain (e.g. `https://usa-creator-outreach-engine.onrender.com`).

---

## 🚂 Deployment Method B: Railway.app

### Step 1: Deploy on Railway
1. Log in to [Railway.app](https://railway.app).
2. Click **New Project** ➔ **Deploy from GitHub Repo**.
3. Select `mr-aryan-rana/usa-creator-outreach-engine`.

### Step 2: Add Variables & Generate Domain
1. Open project settings in Railway ➔ **Variables**.
2. Click **Raw Editor** and paste your environment variables.
3. In **Settings** ➔ **Networking**, click **Generate Domain** (e.g. `usa-creator-outreach-engine.up.railway.app`).

Railway will automatically build using `npm start` and launch your server.

---

## 🐧 Deployment Method C: Ubuntu VPS / DigitalOcean / AWS EC2

For dedicated production performance on a Linux Ubuntu 22.04 / 24.04 server.

### Step 1: System Dependencies Installation
SSH into your server:
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nodejs npm git nginx certbot python3-certbot-nginx
```

### Step 2: Clone Repository
```bash
cd /var/www
sudo git clone https://github.com/mr-aryan-rana/usa-creator-outreach-engine.git
cd usa-creator-outreach-engine
sudo npm install
```

### Step 3: Configure `.env` File
Create `/var/www/usa-creator-outreach-engine/.env`:
```bash
sudo nano /var/www/usa-creator-outreach-engine/.env
```
Paste your production environment variables and save (`Ctrl+O`, `Enter`, `Ctrl+X`).

### Step 4: Configure Systemd Process Service (`pm2` or `systemd`)
Install PM2 process manager:
```bash
sudo npm install -g pm2
pm2 start server/index.js --name "creator-engine"
pm2 save
pm2 startup
```

### Step 5: Configure Nginx Reverse Proxy
Create `/etc/nginx/sites-available/creator-engine`:
```nginx
server {
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:10000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Enable site & enable HTTPS SSL:
```bash
sudo ln -s /etc/nginx/sites-available/creator-engine /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
sudo certbot --nginx -d yourdomain.com
```

---

## 🐳 Deployment Method D: Docker & Docker Compose

### Create `Dockerfile` in root:
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 10000
CMD ["npm", "start"]
```

### Create `docker-compose.yml`:
```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "10000:10000"
    env_file:
      - .env
    restart: always
```

### Launch Container:
```bash
docker-compose up -d --build
```

---

## ✅ Post-Deployment Verification

After deploying, run these health checks:

1. **Test Admin Login**:
   Navigate to `https://your-domain.com/login.html` and log in using `ADMIN_USERNAME` & `ADMIN_PASSWORD`.

2. **Verify System Stats API**:
   Open browser dev tools or execute:
   ```bash
   curl -i -X POST -H "Content-Type: application/json" -d '{"username":"admin","password":"your_password"}' https://your-domain.com/api/login
   ```

3. **Verify Database Connection**:
   Ensure stats metrics show total creators (e.g. `2,316`) and valid emails.

---

## 🛡️ Security & Maintenance Best Practices

1. **Never Commit `.env`**: Always verify [.gitignore](file:///d:/Shivam/Creator/.gitignore) excludes `.env`.
2. **Strong Passwords**: Set a complex `ADMIN_PASSWORD` and `SECRET_KEY` in environment variables.
3. **Daily Quotas**: Monitor `SERPER_DAILY_CREDIT_LIMIT` (150) and `EMAIL_DAILY_LIMIT` (200).
4. **Logs Monitoring**: View live logs anytime in the Web UI Terminal or via PM2 (`pm2 logs creator-engine`).
