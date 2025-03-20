import express from 'express'
import { connectLogger, getLogger } from 'log4js'
import { PrismaClient } from '@prisma/client'
import * as sourceMap from 'source-map-support'
import dotenv from "dotenv";
import crypto from 'crypto'
import { auth, requiresAuth } from "express-openid-connect";

// Database
const prisma = new PrismaClient()

// Logger
const logger = getLogger()
logger.level = 'debug'

// Source Map
sourceMap.install()

// Initialise
const app = express()
dotenv.config()

// Configuration
app.disable('x-powered-by')
app.use(auth({ idpLogout: true, authRequired: false }));
app.use(express.urlencoded({ limit: '100mb', extended: true }))
app.use(express.json({ limit: '100mb' }))
app.use(express.static('./public'))
app.use(connectLogger(logger, { level: 'info' }))
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

app.get("/dashboard", requiresAuth(), async (req, res) => {
  res.render('dashboard', {
    siteInfo,
    user: req.oidc?.user,
    target: req.query.target,
    links: await prisma.link.findMany({where: { OR: [ {userId: req.oidc?.user?.sub}, {userId: ""} ] }, orderBy: {createdAt: 'desc'}})
  });
});

app.post("/api/link", requiresAuth(), async (req, res) => {
  const userId = req.oidc?.user?.sub;
  const nickname = req.oidc?.user?.nickname;
  if (!userId) return res.json({ ok: false, error: "Unauthorized" }).status(401);

  const url = req.body.url
  if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) return res.json({ ok: false, error: "Invalid URL" }).status(400);

  let linkText = req.body.linktext;
  if (reserved.includes(linkText)) return res.json({ ok: false, error: "Reserved word" }).status(400);
  if (linkText) {
    const link = await prisma.link.findUnique({ where: { linkText } })
    if (link) return res.json({ ok: false, error: "Link already exists" }).status(409);
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

  res.json({
    id: short.id,
    linkText: short.linkText,
  })
})

app.put("/api/link/:id", requiresAuth(), async (req, res) => {
  const userId = req.oidc?.user?.sub;
  if (!userId) return res.json({ ok: false, error: "Unauthorized" }).status(401);

  const url = req.body.url
  if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) return res.json({ ok: false, error: "Invalid URL" }).status(400);

  const id = parseInt(req.params.id);
  if (!id) return res.json({ ok: false, error: "Invalid ID" }).status(400);

  const link = await prisma.link.findUnique({ where: { id } })
  if (!link || (link.userId !== userId && link.userId !== "")) return res.json({ ok: false, error: "Not found" }).status(404);

  const short = await prisma.link.update({
    where: { id: link.id },
    data: {
      linkText: link.linkText,
      linkDest: url,
    }
  })

  res.json({
    ok: true,
    id: short.id,
    linkText: short.linkText,
  })
})

app.delete("/api/link/:id", requiresAuth(), async (req, res) => {
  const userId = req.oidc?.user?.sub;
  if (!userId) return res.json({ ok: false, error: "Unauthorized" }).status(401);

  const id = parseInt(req.params.id);
  if (!id) return res.json({ ok: false, error: "Invalid ID" }).status(400);

  const link = await prisma.link.findUnique({ where: { id } })
  if (!link || (link.userId !== userId && link.userId !== "")) return res.json({ ok: false, error: "Not found" }).status(404);

  await prisma.link.delete({ where: { id } });
  res.json({ ok: true })
})

app.get("*", async (req, res) => {
  const link = await prisma.link.findFirst({ where: { linkText: req.originalUrl.slice(1) } })
  if (!link) {
    return res.render('notfound', { user: req.user, siteInfo })
  }
  // TODO: Access Log追加
  return res.redirect(link.linkDest);
})

app.listen(process.env.PORT || 3000)
