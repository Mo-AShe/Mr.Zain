import { Router } from "express";
import { requireCsrf, requireRole } from "../../middleware/auth.js";
import {
  addCartItem,
  clearCustomerCart,
  getCustomerCart,
  removeCartItem,
  updateCartItemQuantity,
} from "../../services/cart.service.js";
import {
  addCartItemSchema,
  cartItemIdParamSchema,
  updateCartItemSchema,
} from "../../validators/cart.validators.js";

export const cartRouter = Router();

cartRouter.use(requireRole("customer"));

cartRouter.get("/", async (req, res, next) => {
  try {
    const cart = await getCustomerCart(req.auth!.user.id);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      success: true,
      cart,
    });
  } catch (err) {
    next(err);
  }
});

cartRouter.post("/items", requireCsrf, async (req, res, next) => {
  try {
    const payload = addCartItemSchema.parse(req.body);
    const cart = await addCartItem(req.auth!.user.id, payload);
    res.setHeader("Cache-Control", "no-store");
    res.status(201).json({
      success: true,
      cart,
    });
  } catch (err) {
    next(err);
  }
});

cartRouter.patch("/items/:itemId", requireCsrf, async (req, res, next) => {
  try {
    const { itemId } = cartItemIdParamSchema.parse(req.params);
    const { quantity } = updateCartItemSchema.parse(req.body);
    const cart = await updateCartItemQuantity(req.auth!.user.id, itemId, quantity);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      success: true,
      cart,
    });
  } catch (err) {
    next(err);
  }
});

cartRouter.delete("/items/:itemId", requireCsrf, async (req, res, next) => {
  try {
    const { itemId } = cartItemIdParamSchema.parse(req.params);
    const cart = await removeCartItem(req.auth!.user.id, itemId);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      success: true,
      cart,
    });
  } catch (err) {
    next(err);
  }
});

cartRouter.delete("/", requireCsrf, async (req, res, next) => {
  try {
    const cart = await clearCustomerCart(req.auth!.user.id);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      success: true,
      cart,
    });
  } catch (err) {
    next(err);
  }
});
