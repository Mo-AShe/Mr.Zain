import { Router } from "express";
import { listActiveCollections } from "../../services/catalog.service.js";

export const collectionsRouter = Router();

collectionsRouter.get("/", async (_req, res, next) => {
  try {
    const items = await listActiveCollections();
    res.json({
      success: true,
      items,
    });
  } catch (err) {
    next(err);
  }
});
