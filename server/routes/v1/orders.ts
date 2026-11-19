import { Router } from "express";
import { requireCsrf, requireRole } from "../../middleware/auth.js";
import {
  cancelCustomerOrder,
  getCustomerOrderById,
  listCustomerOrders,
} from "../../services/order.service.js";
import {
  cancelOrderSchema,
  listOrdersQuerySchema,
  orderIdParamSchema,
} from "../../validators/order.validators.js";

export const ordersRouter = Router();

ordersRouter.use(requireRole("customer"));

ordersRouter.get("/", async (req, res, next) => {
  try {
    const query = listOrdersQuerySchema.parse(req.query);
    const result = await listCustomerOrders(req.auth!.user.id, query);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

ordersRouter.get("/:id", async (req, res, next) => {
  try {
    const { id } = orderIdParamSchema.parse(req.params);
    const order = await getCustomerOrderById(req.auth!.user.id, id);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      success: true,
      order,
    });
  } catch (err) {
    next(err);
  }
});

ordersRouter.post("/:id/cancel", requireCsrf, async (req, res, next) => {
  try {
    const { id } = orderIdParamSchema.parse(req.params);
    const payload = cancelOrderSchema.parse(req.body ?? {});
    const order = await cancelCustomerOrder(req.auth!.user.id, id, payload.reason);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      success: true,
      order,
    });
  } catch (err) {
    next(err);
  }
});
