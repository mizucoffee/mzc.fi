import { urlencoded, json } from 'body-parser'
import express from 'express'
import session from 'express-session'
import { PrismaSessionStore } from '@quixo3/prisma-session-store';
import { Server } from 'http'
import { connectLogger, getLogger } from 'log4js'
import { PrismaClient } from '@prisma/client'
import * as sourceMap from 'source-map-support'
import jwt from "jsonwebtoken";
import swaggerUi from "swagger-ui-express";
import yaml from "js-yaml";
import fs from "fs";
import dotenv from "dotenv";

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
const a = yaml.load(fs.readFileSync('./swagger.yml', 'utf8'))
app.use('/docs', swaggerUi.serve, swaggerUi.setup(Object(a)))
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

// Router
import root from './routes/root'
import api from './routes/api'
import auth from './routes/auth'

app.use('/', root)
app.use('/api', api)
app.use('/auth', auth)

server.listen(process.env.PORT || 3000)
