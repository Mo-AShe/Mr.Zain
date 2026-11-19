import { Router } from "express";
import { getPublicStorefrontSettings } from "../../services/adminSettings.service.js";

export const settingsRouter = Router();

settingsRouter.get("/public", async (_req, res, next) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    const settings = await getPublicStorefrontSettings();
    res.json({
      success: true,
      settings,
    });
  } catch (err) {
    next(err);
  }
});
