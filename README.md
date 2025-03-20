![mzc.fi-logo](https://raw.githubusercontent.com/mizucoffee/mzc.fi/main/banner.png)

## Installation
```bash
git clone https://github.com/mizucoffee/mzc.fi
cd mzc.fi
npm i
vim .env # create .env file
npx prisma db push
npm run build
node dist
```

## Environment Variables (Example)
```
DATABASE_URL=postgres://postgres:postgres@localhost/mzcfi
SITE_NAME=mzc.fi
DOMAIN=mzc.fi
SITE_DESCRIPTION="mizucoffee Private URL Shortener"
PROVIDER_NAME=IDP
ISSUER_BASE_URL=https://idp.your.domain/mzcfi
BASE_URL: https://mzc.fi
CLIENT_ID: YOUR_CLIENT_ID
CLIENT_SECRET: YOUR_CLIENT_SECRET
SECRET: YOUR_SECRET
```