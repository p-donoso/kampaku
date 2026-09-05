import type { Context } from "hono";
import { getHealth } from "../application/health.js";

export const healthCheck = async (c: Context) => {
  return c.json(getHealth());
};
