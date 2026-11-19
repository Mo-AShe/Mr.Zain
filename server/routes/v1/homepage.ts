import { Router } from "express";
import { getHomepageData } from "../../services/catalog.service.js";

export const homepageRouter = Router();

homepageRouter.get("/", async (_req, res, next) => {
  try {
    const data = await getHomepageData();
    res.json({
      success: true,
      ...data,
    });
  } catch (err) {
    next(err);
  }
});
