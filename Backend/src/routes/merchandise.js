const express = require('express');

const {
  MerchandiseError,
  STAFF_ROLE_SET,
  fetchUserById,
  listProducts,
  createOrder,
  listOrders,
  createProduct,
  updateProduct,
  updateOrder
} = require('../services/merchandiseService');
const { readJwtUserId } = require('../utils/auth');

const router = express.Router();

const parseBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  return fallback;
};

const parseSort = (value) => {
  if (typeof value !== 'string') {
    return 'name_asc';
  }
  const normalized = value.trim().toLowerCase();
  switch (normalized) {
    case 'price-desc':
    case 'price_desc':
      return 'price_desc';
    case 'price-asc':
    case 'price_asc':
      return 'price_asc';
    case 'name-desc':
    case 'name_desc':
      return 'name_desc';
    case 'name-asc':
    case 'name_asc':
    default:
      return 'name_asc';
  }
};

const normalizeString = (value) => (typeof value === 'string' ? value.trim() : '');

const normalizeItemsPayload = (value) => {
  if (Array.isArray(value)) {
    return value;
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).map(([productId, quantity]) => ({
      productId,
      quantity
    }));
  }

  return [];
};

const handleServiceError = (res, error) => {
  if (error instanceof MerchandiseError) {
    const status = error.status || 400;
    return res.status(status).json({ message: error.message });
  }

  if (error?.code === '23505') {
    const constraint = error.constraint || '';
    if (typeof constraint === 'string' && constraint.includes('merch_products') && constraint.includes('sku')) {
      return res.status(409).json({ message: 'SKU must be unique.' });
    }
    return res.status(409).json({ message: 'A record with those details already exists.' });
  }

  console.error('Merchandise service error:', error);
  return res.status(500).json({ message: 'An unexpected error occurred.' });
};

const requireStaff = async (req, res, next) => {
  try {
    const userId = readJwtUserId(req);
    if (!userId) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const user = await fetchUserById(userId);
    if (!user) {
      return res.status(401).json({ message: 'User not found.' });
    }

    const role = normalizeString(user.role).toLowerCase();
    if (!STAFF_ROLE_SET.has(role)) {
      return res.status(403).json({ message: 'Staff privileges required.' });
    }

    req.user = {
      id: Number(user.id) || userId,
      role: user.role
    };
    next();
  } catch (error) {
    console.error('Failed to authorize staff request:', error);
    res.status(500).json({ message: 'Unable to verify staff access.' });
  }
};

router.get('/products', async (req, res) => {
  try {
    const search = normalizeString(req.query?.search);
    const category = normalizeString(req.query?.category);
    const sort = parseSort(req.query?.sort);

    let includeInactive = false;
    if (req.query?.includeInactive !== undefined || req.query?.include_inactive !== undefined) {
      const candidate = parseBoolean(req.query.includeInactive ?? req.query.include_inactive, false);
      if (candidate) {
        const userId = readJwtUserId(req);
        if (userId) {
          const user = await fetchUserById(userId);
          const role = normalizeString(user?.role).toLowerCase();
          if (user && STAFF_ROLE_SET.has(role)) {
            includeInactive = true;
          }
        }
      }
    }

    const products = await listProducts({
      search: search || undefined,
      category: category || undefined,
      sort,
      includeInactive
    });

    res.json({ products });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.post('/orders', async (req, res) => {
  try {
    const userId = readJwtUserId(req);
    const payload = {
      userId,
      purchaserName: normalizeString(req.body?.purchaserName ?? req.body?.name ?? req.body?.contactName),
      purchaserEmail: normalizeString(req.body?.purchaserEmail ?? req.body?.email ?? req.body?.contactEmail),
      purchaserPhone: normalizeString(req.body?.purchaserPhone ?? req.body?.phone ?? req.body?.contactPhone),
      pickupOption: normalizeString(req.body?.pickupOption ?? req.body?.pickup_option ?? req.body?.pickupPreference),
      notes: normalizeString(req.body?.notes ?? req.body?.comments),
      items: normalizeItemsPayload(
        req.body?.items ?? req.body?.cart ?? req.body?.orderItems ?? req.body?.order_items
      )
    };

    const order = await createOrder(payload);
    res.status(201).json({ order });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.post('/products', requireStaff, async (req, res) => {
  try {
    const product = await createProduct({
      name: req.body?.name,
      sku: req.body?.sku,
      description: req.body?.description,
      category: req.body?.category,
      price: req.body?.price,
      stockQty: req.body?.stockQty ?? req.body?.stock_qty,
      isActive: req.body?.isActive ?? req.body?.is_active,
      isFeatured: req.body?.isFeatured ?? req.body?.is_featured,
      userId: req.user?.id
    });

    res.status(201).json({ product });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.put('/products/:id', requireStaff, async (req, res) => {
  try {
    const product = await updateProduct(req.params.id, {
      name: req.body?.name,
      sku: req.body?.sku,
      description: req.body?.description,
      category: req.body?.category,
      price: req.body?.price,
      stockQty: req.body?.stockQty ?? req.body?.stock_qty,
      isActive: req.body?.isActive ?? req.body?.is_active,
      isFeatured: req.body?.isFeatured ?? req.body?.is_featured,
      userId: req.user?.id
    });

    res.json({ product });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.get('/orders', requireStaff, async (req, res) => {
  try {
    const status = normalizeString(req.query?.status);
    const orders = await listOrders({ status: status || undefined });
    res.json({ orders });
  } catch (error) {
    handleServiceError(res, error);
  }
});

router.patch('/orders/:id', requireStaff, async (req, res) => {
  try {
    const order = await updateOrder(req.params.id, {
      status: req.body?.status,
      isPaid: req.body?.isPaid ?? req.body?.is_paid,
      isCancelled: req.body?.isCancelled ?? req.body?.is_cancelled,
      isFulfilled: req.body?.isFulfilled ?? req.body?.is_fulfilled,
      pickupReadyAt: req.body?.pickupReadyAt ?? req.body?.pickup_ready_at,
      notes: req.body?.notes
    });

    res.json({ order });
  } catch (error) {
    handleServiceError(res, error);
  }
});

module.exports = router;