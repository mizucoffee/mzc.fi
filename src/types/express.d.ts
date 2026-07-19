export {}

declare module 'express-serve-static-core' {
  export interface Request {
    user?: unknown;
  }
}
