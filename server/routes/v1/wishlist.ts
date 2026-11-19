import { Router } from "express";
import { requireCsrf, requireRole } from "../../middleware/auth.js";
import {
  addWishlistItem,
  getCustomerWishlist,
  removeWishlistItem,
} from "../../services/wishlist.service.js";
import {
  addWishlistItemSchema,
  wishlistProductParamSchema,
} from "../../validators/wishlist.validators.js";

export const wishlistRouter = Router();

wishlistRouter.use(requireRole("customer"));

wishlistRouter.get("/", async (req, res, next) => {
  try {
    const wishlist = await getCustomerWishlist(req.auth!.user.id);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      success: true,
      wishlist,
    });
  } catch (err) {
    next(err);
  }
});

wishlistRouter.post("/items", requireCsrf, async (req, res, next) => {
  try {
    const { productId } = addWishlistItemSchema.parse(req.body);
    const wishlist = await addWishlistItem(req.auth!.user.id, productId);
    res.setHeader("Cache-Control", "no-store");
    res.status(201).json({
      success: true,
      wishlist,
    });
  } catch (err) {
    next(err);
  }
});

wishlistRouter.delete("/items/:productId", requireCsrf, async (req, res, next) => {
  try {
    const { productId } = wishlistProductParamSchema.parse(req.params);
    const wishlist = await removeWishlistItem(req.auth!.user.id, productId);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      success: true,
      wishlist,
    });
  } catch (err) {
    next(err);
  }
});
