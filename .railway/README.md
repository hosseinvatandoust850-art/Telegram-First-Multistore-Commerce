# Railway Template Configuration

This directory contains the Railway Template configuration for one-click deployment.

## Files

- `template.json` - The main template definition that provisions both the application and PostgreSQL services

## How to Publish This Template

### Option 1: From Railway Dashboard (Recommended)

1. Deploy this repository to Railway first (New Project → Deploy from GitHub)
2. Add a PostgreSQL database service
3. Configure the service variables as shown in template.json
4. Go to Settings → Templates
5. Click "Publish as Template"
6. Fill in the template details:
   - Name: Telegram Multistore Commerce Platform
   - Description: A production-ready multistore commerce platform with Telegram bot integration
   - Tags: ecommerce, telegram, ton, multistore, postgresql
7. Publish the template

### Option 2: Using Railway CLI

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Initialize the project (if not already done)
railway init

# Link to your project
railway link

# Publish as template
railway template publish
```

## Template Architecture

The template provisions:

```
Railway Project
├── App Service (Web)
│   ├── Build: Dockerfile
│   ├── Start: node dist/scripts/migrate.js && node dist/src/index.js
│   ├── Health Check: /health
│   ├── Volume: /app/storage (1GB)
│   └── Variables:
│       ├── DATABASE_URL=${{Postgres.DATABASE_URL}}
│       ├── APP_SECRET={{generateSecret 32}}
│       └── APP_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
│
└── PostgreSQL Service
    ├── Version: 16
    └── Automatically connected to App via DATABASE_URL
```

## After Publishing

Once published, you can add the Deploy button to your README:

```markdown
[![Deploy on Railway](https://railway.com/button.svg)](https://railway.app/template/YOUR_TEMPLATE_ID)
```

Replace `YOUR_TEMPLATE_ID` with the actual template ID from Railway.
