import { Router } from "express";
import { AppError } from "../../middleware/errorHandler.js";
import {
  getPublishedProductBySlug,
  listPublishedProducts,
} from "../../services/catalog.service.js";
import {
  productSlugParamSchema,
  productsQuerySchema,
} from "../../validators/catalog.validators.js";

export const productsRouter = Router();

productsRouter.get("/", async (req, res, next) => {
  try {
    const query = productsQuerySchema.parse(req.query);
    const result = await listPublishedProducts(query);
    res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

productsRouter.get("/:slug", async (req, res, next) => {
  try {
    const { slug } = productSlugParamSchema.parse(req.params);
    const product = await getPublishedProductBySlug(slug);
    if (!product) {
      throw new AppError("Product not found.", 404, "PRODUCT_NOT_FOUND");
    }
    res.json({
      success: true,
      product,
    });
  } catch (err) {
    next(err);
  }
});
