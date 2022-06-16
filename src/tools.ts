import { RequestHandler } from "express"

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