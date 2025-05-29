// import { Role } from "../../generated/prisma";

import { Role } from "../../generated/prisma";
import express from "express";

declare global {
  namespace Express {
    export interface Request {
      user: any;
    }
    export interface Response {
      user: any;
    }
  }
}
