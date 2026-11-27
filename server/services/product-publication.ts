export type ProductPublicationBlocker =
  | "inactive_category"
  | "no_product_image"
  | "no_active_variant"
  | "no_available_stock";

export function getProductPublicationReadiness(
  categoryIsActive: boolean,
  variants: Array<{
    isActive: boolean;
    quantity: number;
    reservedQuantity: number;
  }>,
  hasProductImage: boolean
): {
  canPublish: boolean;
  blockers: ProductPublicationBlocker[];
} {
  const blockers: ProductPublicationBlocker[] = [];
  const activeVariants = variants.filter((variant) => variant.isActive);

  if (!categoryIsActive) blockers.push("inactive_category");
  if (!hasProductImage) blockers.push("no_product_image");
  if (activeVariants.length === 0) {
    blockers.push("no_active_variant");
  } else if (
    !activeVariants.some(
      (variant) => variant.quantity - variant.reservedQuantity > 0
    )
  ) {
    blockers.push("no_available_stock");
  }

  return { canPublish: blockers.length === 0, blockers };
}
