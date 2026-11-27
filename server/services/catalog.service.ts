import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  banners,
  categories,
  collections,
  homepageSections,
  inventory,
  orderItems,
  productCollections,
  productImages,
  products,
  productVariants,
} from "../db/schema.js";
import type { ProductsQueryInput } from "../validators/catalog.validators.js";
import { getHomepageAdminConfig } from "./adminSettings.service.js";
import {
  getBestSellerProductIds,
  isWithinNewProductWindow,
  NEW_PRODUCT_WINDOW_DAYS,
} from "./product-merchandising.service.js";

export interface PublicCategoryDTO {
  id: string;
  slug: string;
  name_en: string;
  name_ar: string;
  description_en: string | null;
  description_ar: string | null;
  imageUrl: string | null;
  displayOrder: number;
  productCount: number;
}

export interface PublicCollectionDTO {
  id: string;
  slug: string;
  name_en: string;
  name_ar: string;
  description_en: string | null;
  description_ar: string | null;
  imageUrl: string | null;
  productCount: number;
}

export interface PublicProductImageDTO {
  id: string;
  imageUrl: string;
  altText: string | null;
  displayOrder: number;
  isPrimary: boolean;
}

export interface PublicVariantDTO {
  id: string;
  sku: string;
  size: string;
  color: string;
  price: number;
  availableStock: number;
  inStock: boolean;
}

export interface PublicProductSummaryDTO {
  id: string;
  slug: string;
  name_en: string;
  name_ar: string;
  basePrice: number;
  compareAtPrice: number | null;
  isFeatured: boolean;
  isNew: boolean;
  isBestSeller: boolean;
  imageUrl: string | null;
  category: {
    id: string;
    slug: string;
    name_en: string;
    name_ar: string;
  };
  availableSizes: string[];
  availableColors: string[];
  inStock: boolean;
}

export interface PublicProductDetailDTO extends PublicProductSummaryDTO {
  description_en: string | null;
  description_ar: string | null;
  images: PublicProductImageDTO[];
  collections: Array<{
    id: string;
    slug: string;
    name_en: string;
    name_ar: string;
  }>;
  variants: PublicVariantDTO[];
  relatedProducts: PublicProductSummaryDTO[];
}

const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "3XL"];

function sortSizes(sizes: string[]): string[] {
  return [...sizes].sort((a, b) => {
    const ia = SIZE_ORDER.indexOf(a.toUpperCase());
    const ib = SIZE_ORDER.indexOf(b.toUpperCase());
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

async function hydrateProductSummaries(
  productRows: Array<{
    id: string;
    slug: string;
    nameEn: string;
    nameAr: string;
    basePrice: string;
    compareAtPrice: string | null;
    isFeatured: boolean;
    createdAt: Date;
    categoryId: string;
    categorySlug: string;
    categoryNameEn: string;
    categoryNameAr: string;
  }>,
  bestSellerProductIds: ReadonlySet<string>
): Promise<PublicProductSummaryDTO[]> {
  if (productRows.length === 0) return [];

  const productIds = productRows.map((p) => p.id);

  const [imageRows, variantRows] = await Promise.all([
    db
      .select({
        productId: productImages.productId,
        imageUrl: productImages.imageUrl,
        isPrimary: productImages.isPrimary,
        displayOrder: productImages.displayOrder,
      })
      .from(productImages)
      .where(inArray(productImages.productId, productIds))
      .orderBy(desc(productImages.isPrimary), asc(productImages.displayOrder)),
    db
      .select({
        productId: productVariants.productId,
        size: productVariants.size,
        color: productVariants.color,
        price: productVariants.price,
        quantity: inventory.quantity,
        reservedQuantity: inventory.reservedQuantity,
      })
      .from(productVariants)
      .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
      .where(
        and(
          inArray(productVariants.productId, productIds),
          eq(productVariants.isActive, true)
        )
      ),
  ]);

  const primaryImageMap = new Map<string, string>();
  for (const img of imageRows) {
    if (!primaryImageMap.has(img.productId)) {
      primaryImageMap.set(img.productId, img.imageUrl);
    }
  }

  const variantsByProduct = new Map<
    string,
    { sizes: Set<string>; colors: Set<string>; inStock: boolean; minPrice: number }
  >();

  for (const variant of variantRows) {
    let bucket = variantsByProduct.get(variant.productId);
    if (!bucket) {
      bucket = { sizes: new Set(), colors: new Set(), inStock: false, minPrice: Infinity };
      variantsByProduct.set(variant.productId, bucket);
    }
    bucket.sizes.add(variant.size);
    bucket.colors.add(variant.color);
    bucket.minPrice = Math.min(bucket.minPrice, Number(variant.price));
    const available = Math.max(
      0,
      Number(variant.quantity ?? 0) - Number(variant.reservedQuantity ?? 0)
    );
    if (available > 0) {
      bucket.inStock = true;
    }
  }

  return productRows.map((row) => {
    const meta = variantsByProduct.get(row.id);
    return {
      id: row.id,
      slug: row.slug,
      name_en: row.nameEn,
      name_ar: row.nameAr,
      basePrice: meta && Number.isFinite(meta.minPrice) ? meta.minPrice : Number(row.basePrice),
      compareAtPrice:
        row.compareAtPrice !== null ? Number(row.compareAtPrice) : null,
      isFeatured: row.isFeatured,
      isNew: isWithinNewProductWindow(row.createdAt),
      isBestSeller: bestSellerProductIds.has(row.id),
      imageUrl: primaryImageMap.get(row.id) ?? null,
      category: {
        id: row.categoryId,
        slug: row.categorySlug,
        name_en: row.categoryNameEn,
        name_ar: row.categoryNameAr,
      },
      availableSizes: meta ? sortSizes([...meta.sizes]) : [],
      availableColors: meta ? [...meta.colors] : [],
      inStock: meta ? meta.inStock : false,
    };
  });
}

export async function listPublishedProducts(input: ProductsQueryInput) {
  const searchTerm = input.search ?? input.q;
  const inStockOnly = input.inStock ?? input.inStockOnly ?? false;

  const conditions = [
    eq(products.isPublished, true),
    eq(categories.isActive, true),
  ];
  const storefrontPriceExpr = sql`COALESCE(
    (SELECT MIN(pv.price)
     FROM product_variants pv
     WHERE pv.product_id = ${products.id}
       AND pv.is_active = true),
    ${products.basePrice}
  )`;

  if (searchTerm) {
    const pattern = `%${searchTerm}%`;
    conditions.push(
      sql`(${products.nameEn} ILIKE ${pattern} OR ${products.nameAr} ILIKE ${pattern} OR EXISTS (
        SELECT 1 FROM product_variants pv
        WHERE pv.product_id = ${products.id}
          AND pv.is_active = true
          AND pv.sku ILIKE ${pattern}
      ))`
    );
  }

  if (input.category) {
    conditions.push(eq(categories.slug, input.category));
  }

  if (input.collection) {
    conditions.push(
      sql`EXISTS (
        SELECT 1
        FROM product_collections pc
        INNER JOIN collections col ON col.id = pc.collection_id
        WHERE pc.product_id = ${products.id}
          AND col.slug = ${input.collection}
          AND col.is_active = true
      )`
    );
  }

  if (input.minPrice !== undefined) {
    conditions.push(sql`${storefrontPriceExpr} >= ${input.minPrice.toFixed(2)}`);
  }

  if (input.maxPrice !== undefined) {
    conditions.push(sql`${storefrontPriceExpr} <= ${input.maxPrice.toFixed(2)}`);
  }

  if (input.size || input.color || inStockOnly) {
    const sizeFilter = input.size
      ? sql`AND pv.size = ${input.size}`
      : sql``;
    const colorFilter = input.color
      ? sql`AND pv.color = ${input.color}`
      : sql``;
    const stockFilter = inStockOnly
      ? sql`AND COALESCE(inv.quantity - inv.reserved_quantity, 0) > 0`
      : sql``;

    conditions.push(
      sql`EXISTS (
        SELECT 1
        FROM product_variants pv
        LEFT JOIN inventory inv ON inv.variant_id = pv.id
        WHERE pv.product_id = ${products.id}
          AND pv.is_active = true
          ${sizeFilter}
          ${colorFilter}
          ${stockFilter}
      )`
    );
  }

  const whereClause = and(...conditions);

  const [countResult] = await db
    .select({ total: sql<number>`COUNT(*)::int` })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(whereClause);

  const total = Number(countResult?.total ?? 0);
  const offset = (input.page - 1) * input.limit;

  const popularityOrderExpr = sql`(
    SELECT COALESCE(SUM(oi.quantity), 0)
    FROM order_items oi
    INNER JOIN orders o ON o.id = oi.order_id
    INNER JOIN product_variants pv2 ON pv2.id = oi.variant_id
    WHERE pv2.product_id = ${products.id}
      AND o.payment_status = 'paid'
      AND o.order_status <> 'cancelled'
  )`;

  let orderByClauses;
  switch (input.sort) {
    case "price_asc":
      orderByClauses = [asc(storefrontPriceExpr), desc(products.createdAt)];
      break;
    case "price_desc":
      orderByClauses = [desc(storefrontPriceExpr), desc(products.createdAt)];
      break;
    case "popularity":
      orderByClauses = [
        desc(popularityOrderExpr),
        desc(products.createdAt),
      ];
      break;
    case "newest":
    default:
      orderByClauses = [desc(products.createdAt)];
      break;
  }

  const [rows, bestSellerProductIds] = await Promise.all([
    db
      .select({
        id: products.id,
        slug: products.slug,
        nameEn: products.nameEn,
        nameAr: products.nameAr,
        basePrice: products.basePrice,
        compareAtPrice: products.compareAtPrice,
        isFeatured: products.isFeatured,
        createdAt: products.createdAt,
        categoryId: categories.id,
        categorySlug: categories.slug,
        categoryNameEn: categories.nameEn,
        categoryNameAr: categories.nameAr,
      })
      .from(products)
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .where(whereClause)
      .orderBy(...orderByClauses)
      .limit(input.limit)
      .offset(offset),
    getBestSellerProductIds(),
  ]);

  const items = await hydrateProductSummaries(rows, bestSellerProductIds);

  const facetRows = await db
    .selectDistinct({
      size: productVariants.size,
      color: productVariants.color,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(
      and(
        eq(products.isPublished, true),
        eq(categories.isActive, true),
        eq(productVariants.isActive, true)
      )
    );

  const sizesSet = new Set<string>();
  const colorsSet = new Set<string>();
  for (const f of facetRows) {
    sizesSet.add(f.size);
    colorsSet.add(f.color);
  }

  return {
    items,
    pagination: {
      page: input.page,
      limit: input.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / input.limit)),
      hasMore: offset + items.length < total,
    },
    facets: {
      sizes: sortSizes([...sizesSet]),
      colors: [...colorsSet].sort((a, b) => a.localeCompare(b)),
    },
  };
}

export async function getPublishedProductBySlug(
  slug: string
): Promise<PublicProductDetailDTO | null> {
  const [[row], bestSellerProductIds] = await Promise.all([
    db
      .select({
        id: products.id,
        slug: products.slug,
        nameEn: products.nameEn,
        nameAr: products.nameAr,
        descriptionEn: products.descriptionEn,
        descriptionAr: products.descriptionAr,
        basePrice: products.basePrice,
        compareAtPrice: products.compareAtPrice,
        isFeatured: products.isFeatured,
        createdAt: products.createdAt,
        categoryId: categories.id,
        categorySlug: categories.slug,
        categoryNameEn: categories.nameEn,
        categoryNameAr: categories.nameAr,
      })
      .from(products)
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .where(
        and(
          eq(products.slug, slug),
          eq(products.isPublished, true),
          eq(categories.isActive, true)
        )
      )
      .limit(1),
    getBestSellerProductIds(),
  ]);

  if (!row) return null;

  const [imageRows, collectionRows, variantRows, relatedRows] = await Promise.all([
    db
      .select({
        id: productImages.id,
        imageUrl: productImages.imageUrl,
        altText: productImages.altText,
        displayOrder: productImages.displayOrder,
        isPrimary: productImages.isPrimary,
      })
      .from(productImages)
      .where(eq(productImages.productId, row.id))
      .orderBy(desc(productImages.isPrimary), asc(productImages.displayOrder)),
    db
      .select({
        id: collections.id,
        slug: collections.slug,
        nameEn: collections.nameEn,
        nameAr: collections.nameAr,
      })
      .from(productCollections)
      .innerJoin(collections, eq(collections.id, productCollections.collectionId))
      .where(
        and(
          eq(productCollections.productId, row.id),
          eq(collections.isActive, true)
        )
      ),
    db
      .select({
        id: productVariants.id,
        sku: productVariants.sku,
        size: productVariants.size,
        color: productVariants.color,
        price: productVariants.price,
        quantity: inventory.quantity,
        reservedQuantity: inventory.reservedQuantity,
      })
      .from(productVariants)
      .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
      .where(
        and(
          eq(productVariants.productId, row.id),
          eq(productVariants.isActive, true)
        )
      )
      .orderBy(asc(productVariants.createdAt)),
    db
      .select({
        id: products.id,
        slug: products.slug,
        nameEn: products.nameEn,
        nameAr: products.nameAr,
        basePrice: products.basePrice,
        compareAtPrice: products.compareAtPrice,
        isFeatured: products.isFeatured,
        createdAt: products.createdAt,
        categoryId: categories.id,
        categorySlug: categories.slug,
        categoryNameEn: categories.nameEn,
        categoryNameAr: categories.nameAr,
      })
      .from(products)
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .where(
        and(
          eq(products.isPublished, true),
          eq(categories.isActive, true),
          ne(products.id, row.id)
        )
      )
      .orderBy(
        sql`CASE WHEN ${products.categoryId} = ${row.categoryId} THEN 0 ELSE 1 END`,
        desc(products.isFeatured),
        desc(products.createdAt)
      )
      .limit(3),
  ]);

  const variants: PublicVariantDTO[] = variantRows.map((v) => {
    const availableStock = Math.max(
      0,
      Number(v.quantity ?? 0) - Number(v.reservedQuantity ?? 0)
    );
    return {
      id: v.id,
      sku: v.sku,
      size: v.size,
      color: v.color,
      price: Number(v.price),
      availableStock,
      inStock: availableStock > 0,
    };
  });

  const sizesSet = new Set<string>();
  const colorsSet = new Set<string>();
  let anyInStock = false;
  for (const v of variants) {
    sizesSet.add(v.size);
    colorsSet.add(v.color);
    if (v.inStock) anyInStock = true;
  }

  const relatedProducts = await hydrateProductSummaries(
    relatedRows,
    bestSellerProductIds
  );

  return {
    id: row.id,
    slug: row.slug,
    name_en: row.nameEn,
    name_ar: row.nameAr,
    description_en: row.descriptionEn,
    description_ar: row.descriptionAr,
    basePrice:
      variants.length > 0
        ? Math.min(...variants.map((variant) => variant.price))
        : Number(row.basePrice),
    compareAtPrice:
      row.compareAtPrice !== null ? Number(row.compareAtPrice) : null,
    isFeatured: row.isFeatured,
    isNew: isWithinNewProductWindow(row.createdAt),
    isBestSeller: bestSellerProductIds.has(row.id),
    imageUrl: imageRows[0]?.imageUrl ?? null,
    images: imageRows.map((img) => ({
      id: img.id,
      imageUrl: img.imageUrl,
      altText: img.altText,
      displayOrder: img.displayOrder,
      isPrimary: img.isPrimary,
    })),
    category: {
      id: row.categoryId,
      slug: row.categorySlug,
      name_en: row.categoryNameEn,
      name_ar: row.categoryNameAr,
    },
    collections: collectionRows.map((c) => ({
      id: c.id,
      slug: c.slug,
      name_en: c.nameEn,
      name_ar: c.nameAr,
    })),
    availableSizes: sortSizes([...sizesSet]),
    availableColors: [...colorsSet],
    inStock: anyInStock,
    variants,
    relatedProducts,
  };
}

export async function listActiveCategories(): Promise<PublicCategoryDTO[]> {
  const rows = await db
    .select({
      id: categories.id,
      slug: categories.slug,
      nameEn: categories.nameEn,
      nameAr: categories.nameAr,
      descriptionEn: categories.descriptionEn,
      descriptionAr: categories.descriptionAr,
      imageUrl: categories.imageUrl,
      displayOrder: categories.displayOrder,
      productCount: sql<number>`COUNT(${products.id}) FILTER (WHERE ${products.isPublished} = true)::int`,
    })
    .from(categories)
    .leftJoin(products, eq(products.categoryId, categories.id))
    .where(eq(categories.isActive, true))
    .groupBy(categories.id)
    .orderBy(asc(categories.displayOrder), asc(categories.nameEn));

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name_en: row.nameEn,
    name_ar: row.nameAr,
    description_en: row.descriptionEn,
    description_ar: row.descriptionAr,
    imageUrl: row.imageUrl,
    displayOrder: row.displayOrder,
    productCount: Number(row.productCount ?? 0),
  }));
}

export async function listActiveCollections(): Promise<PublicCollectionDTO[]> {
  const rows = await db
    .select({
      id: collections.id,
      slug: collections.slug,
      nameEn: collections.nameEn,
      nameAr: collections.nameAr,
      descriptionEn: collections.descriptionEn,
      descriptionAr: collections.descriptionAr,
      imageUrl: collections.imageUrl,
      productCount: sql<number>`COUNT(${products.id}) FILTER (WHERE ${products.isPublished} = true)::int`,
    })
    .from(collections)
    .leftJoin(
      productCollections,
      eq(productCollections.collectionId, collections.id)
    )
    .leftJoin(products, eq(products.id, productCollections.productId))
    .where(eq(collections.isActive, true))
    .groupBy(collections.id)
    .orderBy(asc(collections.nameEn));

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name_en: row.nameEn,
    name_ar: row.nameAr,
    description_en: row.descriptionEn,
    description_ar: row.descriptionAr,
    imageUrl: row.imageUrl,
    productCount: Number(row.productCount ?? 0),
  }));
}

export async function getHomepageData() {
  const bestSellerProductIds = await getBestSellerProductIds();
  const bestSellerRank = new Map(
    [...bestSellerProductIds].map((productId, index) => [productId, index])
  );
  const [
    homepageConfig,
    sectionRows,
    bannerRows,
    activeCollections,
    newRows,
    bestSellerRows,
    defaultFeaturedRows,
  ] = await Promise.all([
    getHomepageAdminConfig(),
    db
      .select({
        id: homepageSections.id,
        sectionType: homepageSections.sectionType,
        title_en: homepageSections.titleEn,
        title_ar: homepageSections.titleAr,
        content_en: homepageSections.contentEn,
        content_ar: homepageSections.contentAr,
        displayOrder: homepageSections.displayOrder,
      })
      .from(homepageSections)
      .where(eq(homepageSections.isVisible, true))
      .orderBy(asc(homepageSections.displayOrder)),
    db
      .select({
        id: banners.id,
        title_en: banners.titleEn,
        title_ar: banners.titleAr,
        subtitle_en: banners.subtitleEn,
        subtitle_ar: banners.subtitleAr,
        imageUrl: banners.imageUrl,
        targetUrl: banners.targetUrl,
        displayOrder: banners.displayOrder,
      })
      .from(banners)
      .where(eq(banners.isActive, true))
      .orderBy(asc(banners.displayOrder)),
    listActiveCollections(),
    db
      .select({
        id: products.id,
        slug: products.slug,
        nameEn: products.nameEn,
        nameAr: products.nameAr,
        basePrice: products.basePrice,
        compareAtPrice: products.compareAtPrice,
        isFeatured: products.isFeatured,
        createdAt: products.createdAt,
        categoryId: categories.id,
        categorySlug: categories.slug,
        categoryNameEn: categories.nameEn,
        categoryNameAr: categories.nameAr,
      })
      .from(products)
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .where(
        and(
          eq(products.isPublished, true),
          eq(categories.isActive, true),
          sql`${products.createdAt} > NOW() - ${NEW_PRODUCT_WINDOW_DAYS} * INTERVAL '1 day'`,
          sql`${products.createdAt} <= NOW()`
        )
      )
      .orderBy(desc(products.createdAt))
      .limit(3),
    db
      .select({
        id: products.id,
        slug: products.slug,
        nameEn: products.nameEn,
        nameAr: products.nameAr,
        basePrice: products.basePrice,
        compareAtPrice: products.compareAtPrice,
        isFeatured: products.isFeatured,
        createdAt: products.createdAt,
        categoryId: categories.id,
        categorySlug: categories.slug,
        categoryNameEn: categories.nameEn,
        categoryNameAr: categories.nameAr,
      })
      .from(products)
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .where(
        and(
          eq(products.isPublished, true),
          eq(categories.isActive, true),
          inArray(products.id, [...bestSellerProductIds])
        )
      )
      .limit(bestSellerProductIds.size),
    db
      .select({
        id: products.id,
        slug: products.slug,
        nameEn: products.nameEn,
        nameAr: products.nameAr,
        basePrice: products.basePrice,
        compareAtPrice: products.compareAtPrice,
        isFeatured: products.isFeatured,
        createdAt: products.createdAt,
        categoryId: categories.id,
        categorySlug: categories.slug,
        categoryNameEn: categories.nameEn,
        categoryNameAr: categories.nameAr,
      })
      .from(products)
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .where(
        and(
          eq(products.isPublished, true),
          eq(categories.isActive, true),
          eq(products.isFeatured, true)
        )
      )
      .orderBy(desc(products.createdAt))
      .limit(6),
  ]);

  bestSellerRows.sort(
    (a, b) =>
      (bestSellerRank.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
      (bestSellerRank.get(b.id) ?? Number.MAX_SAFE_INTEGER)
  );

  let featuredProductRows = defaultFeaturedRows;
  if (homepageConfig.featuredProductIds.length > 0) {
    const selectedRows = await db
      .select({
        id: products.id,
        slug: products.slug,
        nameEn: products.nameEn,
        nameAr: products.nameAr,
        basePrice: products.basePrice,
        compareAtPrice: products.compareAtPrice,
        isFeatured: products.isFeatured,
        createdAt: products.createdAt,
        categoryId: categories.id,
        categorySlug: categories.slug,
        categoryNameEn: categories.nameEn,
        categoryNameAr: categories.nameAr,
      })
      .from(products)
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .where(
        and(
          inArray(products.id, homepageConfig.featuredProductIds),
          eq(products.isPublished, true),
          eq(categories.isActive, true)
        )
      );

    const byId = new Map(selectedRows.map((r) => [r.id, r]));
    const orderedSelected = homepageConfig.featuredProductIds
      .map((id) => byId.get(id))
      .filter((r): r is NonNullable<typeof r> => Boolean(r));
    if (orderedSelected.length > 0) {
      featuredProductRows = orderedSelected;
    }
  }

  let featuredCollections = activeCollections.slice(0, 3);
  if (homepageConfig.featuredCollectionIds.length > 0) {
    const byId = new Map(activeCollections.map((c) => [c.id, c]));
    const orderedSelected = homepageConfig.featuredCollectionIds
      .map((id) => byId.get(id))
      .filter((c): c is PublicCollectionDTO => Boolean(c));
    if (orderedSelected.length > 0) {
      featuredCollections = orderedSelected.slice(0, 3);
    }
  }

  const [newArrivals, bestSellers, featuredProducts] = await Promise.all([
    hydrateProductSummaries(newRows, bestSellerProductIds),
    hydrateProductSummaries(bestSellerRows, bestSellerProductIds),
    hydrateProductSummaries(featuredProductRows, bestSellerProductIds),
  ]);

  return {
    sections: sectionRows,
    banners: homepageConfig.promoBannerEnabled ? bannerRows : [],
    promoBannerConfig: {
      enabled: homepageConfig.promoBannerEnabled,
      title_en: homepageConfig.promoBannerTitleEn,
      title_ar: homepageConfig.promoBannerTitleAr,
      subtitle_en: homepageConfig.promoBannerSubtitleEn,
      subtitle_ar: homepageConfig.promoBannerSubtitleAr,
    },
    featuredCollections,
    newArrivals,
    bestSellers,
    featuredProducts,
  };
}
