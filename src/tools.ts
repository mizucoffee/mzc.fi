import { NextFunction, Request, RequestHandler, Response } from "express"

// Express 4 does not forward rejected promises from async handlers to error middleware
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next)
  }
}

export function checkProperty(target: { [key: string]: string; }, properties: string[]) {
  return properties.every(property => {
    if (!target.hasOwnProperty(property)) return false
    if (target[property] == null) return false
    if (target[property] == "") return false
    return true
  })
}

export const isLoggedIn: RequestHandler = (req, res, next) => {
  if (req.user == null) next('/')
  next();
}