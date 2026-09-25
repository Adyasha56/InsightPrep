import { Request, Response } from "express";
import { sendSuccess } from "../utils/apiResponse";

export function getHealth(_req: Request, res: Response): void {
  sendSuccess(res, {
    status: "ok",
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
}
