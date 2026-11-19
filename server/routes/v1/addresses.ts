import { Router } from "express";
import { requireCsrf, requireRole } from "../../middleware/auth.js";
import {
  createCustomerAddress,
  deleteCustomerAddress,
  listActiveGovernorates,
  listCustomerAddresses,
  updateCustomerAddress,
} from "../../services/address.service.js";
import {
  addressIdParamSchema,
  createAddressSchema,
  updateAddressSchema,
} from "../../validators/address.validators.js";

export const addressesRouter = Router();

addressesRouter.use(requireRole("customer"));

addressesRouter.get("/governorates", async (_req, res, next) => {
  try {
    const governorates = await listActiveGovernorates();
    res.setHeader("Cache-Control", "no-store");
    res.json({
      success: true,
      governorates,
    });
  } catch (err) {
    next(err);
  }
});

addressesRouter.get("/", async (req, res, next) => {
  try {
    const addresses = await listCustomerAddresses(req.auth!.user.id);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      success: true,
      addresses,
    });
  } catch (err) {
    next(err);
  }
});

addressesRouter.post("/", requireCsrf, async (req, res, next) => {
  try {
    const payload = createAddressSchema.parse(req.body);
    const address = await createCustomerAddress(req.auth!.user.id, payload);
    res.setHeader("Cache-Control", "no-store");
    res.status(201).json({
      success: true,
      address,
    });
  } catch (err) {
    next(err);
  }
});

addressesRouter.patch("/:id", requireCsrf, async (req, res, next) => {
  try {
    const { id } = addressIdParamSchema.parse(req.params);
    const payload = updateAddressSchema.parse(req.body);
    const address = await updateCustomerAddress(req.auth!.user.id, id, payload);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      success: true,
      address,
    });
  } catch (err) {
    next(err);
  }
});

addressesRouter.delete("/:id", requireCsrf, async (req, res, next) => {
  try {
    const { id } = addressIdParamSchema.parse(req.params);
    await deleteCustomerAddress(req.auth!.user.id, id);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      success: true,
    });
  } catch (err) {
    next(err);
  }
});
