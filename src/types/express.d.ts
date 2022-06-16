import { User } from ".prisma/client";
import { Express } from "express-serve-static-core";

declare module 'express-serve-static-core' {
  export interface Request {
    user?: User;
  }
}

declare module 'express-session' {
  interface SessionData {
    user_id?: number;
  }
}