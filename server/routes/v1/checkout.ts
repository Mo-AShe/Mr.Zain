import { Router } from "express";
import { requireCsrf, requireRole } from "../../middleware/auth.js";
import {
  calculateCheckoutShippingQuote,
  getCheckoutPreview,
} from "../../services/checkout.service.js";
import { placeCodOrder } from "../../services/order.service.js";
import {
  checkoutPreviewQuerySchema,
  placeOrderSchema,
  shippingQuoteSchema,
} from "../../validators/checkout.validators.js";

export const checkoutRouter = Router();

checkoutRouter.use(requireRole("customer"));

checkoutRouter.get("/preview", async (req, res, next) => {
  try {
    const query = checkoutPreviewQuerySchema.parse(req.query);
    const preview = await getCheckoutPreview(req.auth!.user.id, query);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      success: true,
      preview,
    });
  } catch (err) {
    next(err);
  }
});

checkoutRouter.post("/shipping-quote", requireCsrf, async (req, res, next) => {
  try {
    const payload = shippingQuoteSchema.parse(req.body);
    const quote = await calculateCheckoutShippingQuote(req.auth!.user.id, payload);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      success: true,
      quote,
    });
  } catch (err) {
    next(err);
  }
});

checkoutRouter.post("/orders", requireCsrf, async (req, res, next) => {
  try {
    const payload = placeOrderSchema.parse(req.body);
    const headerIdempotencyRaw = req.headers["idempotency-key"];
    const headerIdempotency = Array.isArray(headerIdempotencyRaw)
      ? headerIdempotencyRaw[0]
      : headerIdempotencyRaw;

    const idempotencyKey =
      (typeof headerIdempotency === "string" && headerIdempotency.trim()) ||
      payload.idempotencyKey;

    const result = await placeCodOrder(req.auth!.user.id, {
      ...payload,
      idempotencyKey,
    });

    res.setHeader("Cache-Control", "no-store");
    res.status(result.alreadyExisted ? 200 : 201).json({
      success: true,
      alreadyExisted: result.alreadyExisted,
      order: result.order,
    });
  } catch (err) {
    next(err);
  }
});
