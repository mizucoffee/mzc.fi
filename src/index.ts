import { urlencoded, json } from 'body-parser'
import express from 'express'
import session from 'express-session'
import { PrismaSessionStore } from '@quixo3/prisma-session-store';
import { Server } from 'http'
import { connectLogger, getLogger } from 'log4js'
import { PrismaClient } from '@prisma/client'
import * as sourceMap from 'source-map-support'
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import bcrypt from 'bcrypt'
import { RequestHandler } from "express"
import crypto from 'crypto'

// Database
const prisma = new PrismaClient()

// Logger
const logger = getLogger()
logger.level = 'debug'

// Source Map
sourceMap.install()

// Initialise
const app = express()
const server = new Server(app)
dotenv.config()

// Configuration
app.disable('x-powered-by')
app.use(session({
  store: new PrismaSessionStore(
    prisma,
    {
      checkPeriod: 2 * 60 * 1000,
      dbRecordIdIsSessionId: true,
      dbRecordIdFunction: undefined,
    }
  ),
  secret: `${process.env.SESSION_SECRET}`,
  resave: false,
  saveUninitialized: false,
}))
app.use(urlencoded({ limit: '100mb', extended: true }))
app.use(json({ limit: '100mb' }))
app.use(express.static('./public'))
app.use(connectLogger(logger, { level: 'info' }))
app.set('view engine', 'pug')
app.use(async (req, res, next) => {
  if(req.user != null || req.session.user_id == null) return next()

  const user = await prisma.user.findUnique({ where: {id: req.session.user_id} })
  if(user) req.user = user

  next()
})
app.use(async (req, res, next) => {
  if(req.user != null || req.headers["authorization"] == null) return next()
  try {
    const authData = req.headers["authorization"].split(" ")
    if(authData[0] != 'Bearer') return next();
    
    const token = jwt.verify(authData[1], `${process.env.JWT_SECRET}`)
    if(typeof token == 'string') return next();
    if(token.type != 'access_token') return next();

    const user = await prisma.user.findUnique({ where: {id: token.user_id} })
    if(user) req.user = user
  } catch(e) {}
  next()
})


export function checkProperty(target: { [key: string]: string; }, properties: string[]) {
  return properties.every(property => {
    if (!target.hasOwnProperty(property)) return false
    if (target[property] == null) return false
    if (target[property] == "") return false
    return true
  })
}

const SITE_NAME = process.env.SITE_NAME
const SITE_DESCRIPTION = process.env.SITE_DESCRIPTION
const DOMAIN = process.env.DOMAIN

app.get("/", async (req, res) => {
  if(await prisma.user.count() == 0) return res.redirect("/setup")
  if(req.query.signout == 'true') {
    req.session.destroy(() => res.redirect("/"))
  } else if(req.query.delete) {
    await prisma.link.delete({ where: { linkText: `${req.query.delete}` } })
    res.redirect("/")
  } else if(req.query.update) {
    const links = await prisma.link.findMany();
    const link = await prisma.link.findFirst({ where: { linkText: `${req.query.update}` } })
    res.render('index', { user: req.user, site_name: SITE_NAME, site_description: SITE_DESCRIPTION, domain: DOMAIN, links, ...link });
  } else {
    const links = await prisma.link.findMany();
    res.render('index', { user: req.user, site_name: SITE_NAME, site_description: SITE_DESCRIPTION, domain: DOMAIN, links });
  }
});

app.get("/setup", async (req, res, next) => {
  if(await prisma.user.count() > 0) return next();
  res.render('setup', { user: req.user, site_name: SITE_NAME, site_description: SITE_DESCRIPTION });
})

app.post("/setup", async (req, res) => {
  if(await prisma.user.count() > 0) return res.redirect("/");

  if(!checkProperty(req.body,['name', 'password']))
  return res.redirect('/setup?error=invalid_request')

  await prisma.user.create({
    data: {
      name: `${req.body.name}`,
      passwordDigest: await bcrypt.hash(`${req.body.password}`, 10),
      isAdmin: true
    }
  })

  res.redirect("/");
})

app.post("/signin", async (req, res) => {
  if(!checkProperty(req.body,['name', 'password']))
  return res.redirect('/?error=invalid_request')

  const user = await prisma.user.findUnique({ where: {name: `${req.body.name}`} })
  if(user == null) return res.redirect('/?error=invalid_credentials')

  if(!await bcrypt.compare(`${req.body.password}`, user.passwordDigest))
  return res.redirect('/?error=invalid_credentials')

  req.session.user_id = user.id
  req.session.save(() => res.redirect("/"))
});

app.post("/api/shorten", async (req, res) => {
  // User must be logged in
  if (req.user == null) return res.json({ error: "Unauthorized" })
  const user = await prisma.user.findUnique({ where: {id: req.user.id} })
  if(user == null) return res.json({ error: "Unauthorized" })

  // Validate request
  if(!checkProperty(req.body, ['url'])) return res.json({ error: "Please enter the URL" })
  const url = `${req.body.url}`
  if(!url.startsWith("http://") && !url.startsWith("https://")) return res.json({ error: "Please enter a valid URL" })

  if(req.body.update) {
    const link = await prisma.link.findUnique({ where: { linkText: `${req.body.update}` } })
    if(link == null) return res.json({ error: "Link not found" })

    const short = await prisma.link.update({
      where: { id: link.id },
      data: {
        linkText: `${req.body.linktext}`,
        linkDest: `${req.body.url}`,
      }
    })
        
    res.json({
      id: short.id,
      linkText: short.linkText,
    })

  } else {
    let id = crypto.randomBytes(6).toString('hex').substring(0, 6);
    if(req.body.linktext) {
      const link = await prisma.link.findUnique({ where: { linkText: `${req.body.linktext}` } })
      if(link) return res.json({ error: "Link already exists" })
      id = req.body.linktext;
    } else {
      while(await prisma.link.findUnique({ where: { linkText: id } })) {
        id = crypto.randomBytes(6).toString('hex').substring(0, 6);
      }
    }
  
    const short = await prisma.link.create({
      data: {
        linkText: id,
        linkDest: url,
        userId: user.id
      }
    })
  
    res.json({
      id: short.id,
      linkText: short.linkText,
    })
  }
})

app.get("/:link_text", async (req, res) => {
  const link = await prisma.link.findFirst({ where: { linkText: req.params.link_text } })
  if(link) {
    res.redirect(link.linkDest)
    // Access Log追加
    return;
  }
  res.render('notfound', { user: req.user, site_name: SITE_NAME, site_description: SITE_DESCRIPTION });
})


server.listen(process.env.PORT || 3000)
