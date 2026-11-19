import { Router } from "express";
import { listActiveCategories } from "../../services/catalog.service.js";

export const categoriesRouter = Router();

categoriesRouter.get("/", async (_req, res, next) => {
  try {
    const items = await listActiveCategories();
    res.json({
      success: true,
      items,
    });
  } catch (err) {
    next(err);
  }
});
