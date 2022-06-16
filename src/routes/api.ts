import { RequestHandler, Response, Router } from "express";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import { checkProperty } from "../tools";
import jwt from "jsonwebtoken";

const isLoggedIn: RequestHandler = (req, res, next) => {
  if (req.user == null) return error(res, 401, 'unauthorized')
  next();
};

const router: Router = Router();
const prisma = new PrismaClient();

router.get("/", (req, res) => {
  res.json({ ok: true });
});

router.post("/auth/signin", async (req, res) => {
  if (!checkProperty(req.body, ["name", "password"]))
    return error(res, 400, { message: "invalid request" });

  const user = await prisma.user.findUnique({ where: { name: `${req.body.name}` } });

  if (!user || !(await bcrypt.compare(`${req.body.password}`, user.password_digest)))
    return error(res, 404, { message: "not found" });

  success(res, {
    access_token: jwt.sign({ user_id: user.id, type: 'access_token' }, `${process.env.JWT_SECRET}`, { expiresIn: '1h' }),
    refresh_token: jwt.sign({ user_id: user.id, type: 'refresh_token' }, `${process.env.JWT_SECRET}`, { expiresIn: '30d' })
  })
});

router.post("/auth/signup", async (req, res) => {
  if (!checkProperty(req.body, ["name", "password"]))
    return error(res, 400, { message: "invalid request" });

  if(await prisma.user.findUnique({ where: { name: `${req.body.name}` } }))
    return error(res, 409, { message: "already registered name" });

  const user = await prisma.user.create({
    data: {
      name: `${req.body.name}`,
      password_digest: await bcrypt.hash(`${req.body.password}`, 10),
    },
  });

  success(res, {
    access_token: jwt.sign({ user_id: user.id, type: 'access_token' }, `${process.env.JWT_SECRET}`, { expiresIn: '1h' }),
    refresh_token: jwt.sign({ user_id: user.id, type: 'refresh_token' }, `${process.env.JWT_SECRET}`, { expiresIn: '30d' })
  })
});

router.post("/auth/token", async (req, res) => {
  if (!checkProperty(req.body, ["refresh_token"]))
    return error(res, 400, { message: "invalid request" });

  try {
    const token = jwt.verify(req.body.refresh_token, `${process.env.JWT_SECRET}`)
    if(typeof token == 'string') return error(res, 400, { message: "invalid refresh token" });
    if(token.type != 'refresh_token') return error(res, 400, { message: "invalid refresh token" });

    const user = await prisma.user.findUnique({ where: {id: token.user_id} })
    
    if(!user) return error(res, 400, { message: "invalid refresh token" });

    return success(res, {
      access_token: jwt.sign({ user_id: user.id, type: 'access_token' }, `${process.env.JWT_SECRET}`, { expiresIn: '1m' }),
      refresh_token: jwt.sign({ user_id: user.id, type: 'refresh_token' }, `${process.env.JWT_SECRET}`, { expiresIn: '30d' })
    })
  } catch(e) {}

  return error(res, 400, { message: "invalid refresh token" });
});

router.get("/user/me", isLoggedIn, (req, res) => {
  return success(res, {
    id: req.user?.id,
    name: req.user?.name,
  })
});

function success(res: Response, data: any) {
  res.json(data);
}

function error(res: Response, status: number, error: any) {
  res.status(status);
  res.json(error);
}

export default router;
