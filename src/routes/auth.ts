import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import bcrypt from 'bcrypt'
import { checkProperty } from "../tools"

const router = Router();
const prisma = new PrismaClient();

router.get("/signin", (req, res) => {
  if(req.user != null) return res.redirect('/');
  res.render('auth/signin');
});

router.get("/signup", (req, res) => {
  if(req.user != null) return res.redirect('/');
  res.render('auth/signup');
});

router.post("/signin", async (req, res) => {
  if(!checkProperty(req.body,['name', 'password']))
    return res.redirect('/auth/signin?error=invalid_request')

  const user = await prisma.user.findUnique({ where: { name: `${req.body.name}` } })
  if(!user) return res.redirect('/auth/signin?error=not_found')

  if(!await bcrypt.compare(`${req.body.password}`, user.password_digest)) return res.redirect('/auth/signin?error=not_found')
  req.session.user_id = user.id

  res.redirect('/');
});

router.post("/signup", async (req, res) => {
  if(!checkProperty(req.body,['name', 'password', 'password_confirmation']))
    return res.redirect('/auth/signup?error=invalid_request')

  if(req.body.password != req.body.password_confirmation) return res.redirect('/auth/signup?error=password_confirmation')

  if(await prisma.user.findUnique({ where: { name: `${req.body.name}` } }))
    return res.redirect('/auth/signup?error=already_registered_name')

  const user = await prisma.user.create({
    data: {
      name: `${req.body.name}`,
      password_digest: await bcrypt.hash(`${req.body.password}`, 10)
    }
  })
  req.session.user_id = user.id

  res.redirect('/');
});

router.get("/signout", (req, res) => {
  req.session.destroy(() => {})
  res.redirect('/');
});

export default router;
