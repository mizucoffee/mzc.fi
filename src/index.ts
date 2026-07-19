import 'dotenv/config'
import express from 'express'
import { PrismaClient } from '@prisma/client'
import * as sourceMap from 'source-map-support'
import crypto from 'crypto'
import { auth, requiresAuth } from "express-openid-connect";
import pinoHttp from 'pino-http'
import { logger } from './logger'
import { asyncHandler } from './tools'

// Database
const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'warn' },
    { emit: 'event', level: 'error' },
  ],
})
prisma.$on('warn', (e) => logger.warn({ event: 'prisma.warn', target: e.target }, e.message))
prisma.$on('error', (e) => logger.error({ event: 'prisma.error', target: e.target }, e.message))

// Source Map
sourceMap.install()

// Process-level failure logging
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaught exception')
  process.exit(1)
})
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'unhandled rejection')
})

// Initialise
const app = express()

// Configuration
app.disable('x-powered-by')
app.set('trust proxy', true)
app.use(auth({ idpLogout: true, authRequired: false }));
app.use(express.urlencoded({ limit: '100mb', extended: true }))
app.use(express.json({ limit: '100mb' }))
app.use(express.static('./public'))
app.use(pinoHttp({
  logger,
  customLogLevel: (req, res, err) => {
    if (err || res.statusCode >= 500) return 'error'
    if (res.statusCode >= 400) return 'warn'
    return 'info'
  },
  autoLogging: {
    ignore: (req) => {
      const url = req.url || ''
      return url === '/favicon.ico' || url === '/style.css' || url.startsWith('/css/') || url.startsWith('/js/') || url.startsWith('/img/')
    },
  },
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      ip: (req.raw as express.Request).ip || req.remoteAddress,
      userAgent: req.headers['user-agent'],
      referrer: req.headers['referer'],
    }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
}))
app.set('view engine', 'pug')

const siteInfo = {
  siteName: process.env.SITE_NAME,
  siteDescription: process.env.SITE_DESCRIPTION,
  domain: process.env.DOMAIN,
  provider: process.env.PROVIDER_NAME
}

const reserved = [
  "api",
  "dashboard",
  "login",
  "logout",
  "callback",
  "css",
  "js",
  "img",
  "favicon.ico"
]

app.get("/", async (req, res) => {
  if (req.oidc?.user) return res.redirect("/dashboard")
  res.render('index', { siteInfo });
});

app.get("/dashboard", requiresAuth(), asyncHandler(async (req, res) => {
  res.render('dashboard', {
    siteInfo,
    user: req.oidc?.user,
    target: req.query.target,
    links: await prisma.link.findMany({where: { OR: [ {userId: req.oidc?.user?.sub}, {userId: ""} ] }, orderBy: {createdAt: 'desc'}})
  });
}))

app.post("/api/link", requiresAuth(), asyncHandler(async (req, res) => {
  const userId = req.oidc?.user?.sub;
  const nickname = req.oidc?.user?.nickname;
  if (!userId) {
    logger.warn({ event: 'link.create.denied' }, 'link create denied: no user id')
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const url = req.body.url
  if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) {
    logger.warn({ event: 'link.create.invalid', userId, url }, 'link create rejected: invalid url')
    return res.status(400).json({ ok: false, error: "Invalid URL" });
  }

  let linkText = req.body.linktext;
  if (reserved.includes(linkText)) {
    logger.warn({ event: 'link.create.reserved', userId, linkText }, 'link create rejected: reserved word')
    return res.status(400).json({ ok: false, error: "Reserved word" });
  }
  if (linkText) {
    const link = await prisma.link.findUnique({ where: { linkText } })
    if (link) {
      logger.warn({ event: 'link.create.conflict', userId, linkText }, 'link create rejected: already exists')
      return res.status(409).json({ ok: false, error: "Link already exists" });
    }
  } else {
    do {
      linkText = crypto.randomBytes(6).toString('hex').substring(0, 6);
    } while (await prisma.link.findUnique({ where: { linkText } }));
  }

  const short = await prisma.link.create({
    data: {
      linkText,
      linkDest: url,
      userId,
      userName: nickname
    }
  })

  logger.info({ event: 'link.create', userId, linkId: short.id, linkText: short.linkText, linkDest: short.linkDest }, 'link created')
  res.json({
    id: short.id,
    linkText: short.linkText,
  })
}))

app.put("/api/link/:id", requiresAuth(), asyncHandler(async (req, res) => {
  const userId = req.oidc?.user?.sub;
  if (!userId) {
    logger.warn({ event: 'link.update.denied' }, 'link update denied: no user id')
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const url = req.body.url
  if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) {
    logger.warn({ event: 'link.update.invalid', userId, url }, 'link update rejected: invalid url')
    return res.status(400).json({ ok: false, error: "Invalid URL" });
  }

  const id = parseInt(String(req.params.id));
  if (!id) return res.status(400).json({ ok: false, error: "Invalid ID" });

  const link = await prisma.link.findUnique({ where: { id } })
  if (!link || (link.userId !== userId && link.userId !== "")) {
    logger.warn({ event: 'link.update.notfound', userId, linkId: id }, 'link update rejected: not found or not owned')
    return res.status(404).json({ ok: false, error: "Not found" });
  }

  const short = await prisma.link.update({
    where: { id: link.id },
    data: {
      linkText: link.linkText,
      linkDest: url,
    }
  })

  logger.info({ event: 'link.update', userId, linkId: short.id, linkText: short.linkText, linkDest: short.linkDest }, 'link updated')
  res.json({
    ok: true,
    id: short.id,
    linkText: short.linkText,
  })
}))

app.delete("/api/link/:id", requiresAuth(), asyncHandler(async (req, res) => {
  const userId = req.oidc?.user?.sub;
  if (!userId) {
    logger.warn({ event: 'link.delete.denied' }, 'link delete denied: no user id')
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const id = parseInt(String(req.params.id));
  if (!id) return res.status(400).json({ ok: false, error: "Invalid ID" });

  const link = await prisma.link.findUnique({ where: { id } })
  if (!link || (link.userId !== userId && link.userId !== "")) {
    logger.warn({ event: 'link.delete.notfound', userId, linkId: id }, 'link delete rejected: not found or not owned')
    return res.status(404).json({ ok: false, error: "Not found" });
  }

  await prisma.link.delete({ where: { id } });
  logger.info({ event: 'link.delete', userId, linkId: link.id, linkText: link.linkText }, 'link deleted')
  res.json({ ok: true })
}))

app.get("/*splat", asyncHandler(async (req, res) => {
  let linkText = req.path.slice(1).replace(/\/+$/, '')
  try {
    linkText = decodeURIComponent(linkText)
  } catch {
    // malformed percent-encoding; look up the raw path as-is
  }
  const link = await prisma.link.findFirst({ where: { linkText } })
  if (!link) {
    logger.warn({ event: 'link.notfound', path: req.originalUrl, linkText }, 'short link not found')
    return res.render('notfound', { user: req.user, siteInfo })
  }
  // TODO: Access Log追加
  logger.info({ event: 'link.redirect', linkText: link.linkText, linkDest: link.linkDest }, 'link redirected')
  return res.redirect(link.linkDest);
}))

app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error({ err, method: req.method, url: req.originalUrl }, 'unhandled error')
  if (res.headersSent) return next(err)
  res.status(500).json({ ok: false, error: "Internal Server Error" })
})

const port = Number(process.env.PORT) || 3000
app.listen(port, () => logger.info({ event: 'server.start', port }, 'server started'))
