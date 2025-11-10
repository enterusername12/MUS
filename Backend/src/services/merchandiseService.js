const { getPool } = require('../db');

const STAFF_ROLE_SET = new Set([
  'staff',
  'staff (admin only)',
  'admin',
  'admin (admin only)'
]);

class MerchandiseError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'MerchandiseError';
    this.status = status;
  }
}

const sanitizeTrimmedString = (value) => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
};

const ensureNullableString = (value) => {
  const trimmed = sanitizeTrimmedString(value);
  return trimmed.length > 0 ? trimmed : null;
};

const escapeLikePattern = (value) =>
  sanitizeTrimmedString(value)
    .replace(/[%_\\]/g, (match) => `\\${match}`);

const mapProductRow = (row) => ({
  id: Number(row.id) || row.id,
  name: row.name,
  sku: row.sku,
  description: row.description,
  category: row.category,
  price: Number(row.price),
  stock_qty: Number(row.stock_qty),
  is_active: row.is_active,
  is_featured: row.is_featured,
  created_at: row.created_at,
  updated_at: row.updated_at,
  created_by: row.created_by,
  updated_by: row.updated_by
});

const mapOrderRow = (row) => ({
  id: Number(row.id) || row.id,
  purchaser_user_id: row.purchaser_user_id ? Number(row.purchaser_user_id) : null,
  purchaser_name: row.purchaser_name,
  purchaser_email: row.purchaser_email,
  purchaser_phone: row.purchaser_phone,
  pickup_option: row.pickup_option,
  status: row.status,
  is_paid: row.is_paid,
  is_cancelled: row.is_cancelled,
  is_fulfilled: row.is_fulfilled,
  pickup_ready_at: row.pickup_ready_at,
  subtotal: Number(row.subtotal),
  tax_total: Number(row.tax_total),
  total: Number(row.total),
  notes: row.notes,
  created_at: row.created_at,
  updated_at: row.updated_at
});

const mapOrderItemRow = (row) => ({
  id: Number(row.id) || row.id,
  order_id: Number(row.order_id) || row.order_id,
  product_id: Number(row.product_id) || row.product_id,
  quantity: Number(row.quantity),
  unit_price: Number(row.unit_price),
  line_total: Number(row.line_total),
  created_at: row.created_at,
  updated_at: row.updated_at
});

const computePickupReadyAt = () => {
  const now = new Date();
  const daysToAdd = 2 + Math.floor(Math.random() * 2); // 2 or 3 days out
  const pickup = new Date(now.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
  pickup.setHours(10, 0, 0, 0); // default to 10 AM local time for pickup window
  return pickup;
};

async function fetchUserById(userId) {
  if (!Number.isInteger(userId) || userId <= 0) {
    return null;
  }

  const { rows } = await getPool().query(
    `SELECT id, role, first_name, last_name, email FROM users WHERE id = $1`,
    [userId]
  );

  return rows[0] || null;
}

async function listProducts({ search, category, includeInactive = false, sort = 'name_asc' } = {}) {
  const conditions = [];
  const values = [];
  let index = 1;

  if (!includeInactive) {
    conditions.push('is_active = TRUE');
  }

  if (category) {
    conditions.push(`LOWER(category) = LOWER($${index++})`);
    values.push(category);
  }

  if (search) {
    const escaped = escapeLikePattern(search);
    conditions.push(
      `(name ILIKE $${index} ESCAPE '\\' OR description ILIKE $${index} ESCAPE '\\' OR sku ILIKE $${index} ESCAPE '\\')`
    );
    values.push(`%${escaped}%`);
    index += 1;
  }

  const orderBy = (() => {
    switch (sort) {
      case 'price_desc':
        return 'price DESC NULLS LAST';
      case 'price_asc':
        return 'price ASC NULLS LAST';
      case 'name_desc':
        return 'name DESC';
      case 'name_asc':
      default:
        return 'name ASC';
    }
  })();

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await getPool().query(
    `SELECT id, name, sku, description, category, price, stock_qty, is_active, is_featured, created_at, updated_at, created_by, updated_by
       FROM merch_products
       ${whereClause}
       ORDER BY ${orderBy}`,
    values
  );

  return rows.map(mapProductRow);
}

function normalizeItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new MerchandiseError('Cart must include at least one item.');
  }

  return items.map((item, index) => {
    const productId = Number(item?.productId ?? item?.product_id);
    const quantity = Number(item?.quantity);

    if (!Number.isInteger(productId) || productId <= 0) {
      throw new MerchandiseError(`Item #${index + 1} is missing a valid productId.`);
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new MerchandiseError(`Quantity for item #${index + 1} must be a positive integer.`);
    }

    return { productId, quantity };
  });
}

function normalizeCurrency(value, fieldName) {
  if (value === undefined || value === null) {
    return null;
  }

  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    throw new MerchandiseError(`${fieldName} must be a non-negative number.`);
  }

  return Number(numberValue.toFixed(2));
}

async function createOrder({
  userId,
  purchaserName,
  purchaserEmail,
  purchaserPhone,
  pickupOption,
  notes,
  items
}) {
  const normalizedItems = normalizeItems(items);
  const name = ensureNullableString(purchaserName);
  const email = ensureNullableString(purchaserEmail);
  const phone = ensureNullableString(purchaserPhone);
  const pickup = ensureNullableString(pickupOption);
  const normalizedNotes = ensureNullableString(notes);

  if (!name && !email && !phone) {
    throw new MerchandiseError('Please provide at least one contact detail (name, email, or phone).');
  }

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');

    const productIds = normalizedItems.map((item) => item.productId);
    const { rows: productRows } = await client.query(
      {
        text: `SELECT id, name, price, stock_qty, is_active
                 FROM merch_products
                WHERE id = ANY($1::INT[])
                FOR UPDATE`,
        values: [productIds]
      }
    );

    if (productRows.length !== productIds.length) {
      const foundIds = new Set(productRows.map((row) => Number(row.id)));
      const missing = productIds.filter((id) => !foundIds.has(id));
      throw new MerchandiseError(`Some products are unavailable: ${missing.join(', ')}.`, 404);
    }

    const productsById = new Map(productRows.map((row) => [Number(row.id), row]));

    let subtotal = 0;
    for (const item of normalizedItems) {
      const product = productsById.get(item.productId);
      if (!product) {
        throw new MerchandiseError(`Product ${item.productId} is unavailable.`, 404);
      }
      if (product.is_active === false) {
        throw new MerchandiseError(`Product "${product.name}" is not currently available.`, 409);
      }
      const stock = Number(product.stock_qty);
      if (item.quantity > stock) {
        throw new MerchandiseError(`Only ${stock} units of "${product.name}" remain in stock.`, 409);
      }
      const price = Number(product.price);
      subtotal += price * item.quantity;
    }

    subtotal = Number(subtotal.toFixed(2));
    const taxTotal = 0;
    const total = Number((subtotal + taxTotal).toFixed(2));
    const pickupReadyAt = computePickupReadyAt();

    const orderInsert = await client.query(
      {
        text: `INSERT INTO merch_orders (
                 purchaser_user_id,
                 purchaser_name,
                 purchaser_email,
                 purchaser_phone,
                 pickup_option,
                 status,
                 is_paid,
                 is_cancelled,
                 is_fulfilled,
                 pickup_ready_at,
                 subtotal,
                 tax_total,
                 total,
                 notes
               )
               VALUES ($1, $2, $3, $4, $5, 'pending', FALSE, FALSE, FALSE, $6, $7, $8, $9, $10)
               RETURNING *`,
        values: [
          Number.isInteger(userId) ? userId : null,
          name,
          email,
          phone,
          pickup,
          pickupReadyAt,
          subtotal,
          taxTotal,
          total,
          normalizedNotes
        ]
      }
    );

    const order = orderInsert.rows[0];
    if (!order) {
      throw new MerchandiseError('Failed to create order. Please try again later.', 500);
    }

    const orderId = Number(order.id);

    for (const item of normalizedItems) {
      const product = productsById.get(item.productId);
      const unitPrice = Number(product.price);

      await client.query(
        {
          text: `INSERT INTO merch_order_items (order_id, product_id, quantity, unit_price)
                 VALUES ($1, $2, $3, $4)`,
          values: [orderId, item.productId, item.quantity, unitPrice]
        }
      );

      await client.query(
        {
          text: `UPDATE merch_products
                   SET stock_qty = stock_qty - $1,
                       updated_at = NOW(),
                       updated_by = COALESCE($3, updated_by)
                 WHERE id = $2`,
          values: [item.quantity, item.productId, Number.isInteger(userId) ? userId : null]
        }
      );
    }

    await client.query('COMMIT');

    const itemsResult = await client.query(
      `SELECT id, order_id, product_id, quantity, unit_price, line_total, created_at, updated_at
         FROM merch_order_items
        WHERE order_id = $1
        ORDER BY id ASC`,
      [orderId]
    );

    return {
      ...mapOrderRow(order),
      items: itemsResult.rows.map(mapOrderItemRow)
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function listOrders({ status } = {}) {
  const conditions = [];
  const values = [];
  let index = 1;

  if (status) {
    conditions.push(`status = $${index++}`);
    values.push(status);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await getPool().query(
    `SELECT id, purchaser_user_id, purchaser_name, purchaser_email, purchaser_phone, pickup_option, status,
            is_paid, is_cancelled, is_fulfilled, pickup_ready_at, subtotal, tax_total, total, notes,
            created_at, updated_at
       FROM merch_orders
       ${whereClause}
       ORDER BY created_at DESC, id DESC`,
    values
  );

  const orderIds = rows.map((row) => Number(row.id));
  let itemsByOrder = new Map();
  if (orderIds.length > 0) {
    const { rows: itemRows } = await getPool().query(
      `SELECT id, order_id, product_id, quantity, unit_price, line_total, created_at, updated_at
         FROM merch_order_items
        WHERE order_id = ANY($1::INT[])
        ORDER BY order_id ASC, id ASC`,
      [orderIds]
    );

    itemsByOrder = itemRows.reduce((acc, row) => {
      const key = Number(row.order_id);
      const list = acc.get(key) || [];
      list.push(mapOrderItemRow(row));
      acc.set(key, list);
      return acc;
    }, new Map());
  }

  return rows.map((row) => ({
    ...mapOrderRow(row),
    items: itemsByOrder.get(Number(row.id)) || []
  }));
}

async function createProduct({
  name,
  sku,
  description,
  category,
  price,
  stockQty,
  isActive = true,
  isFeatured = false,
  userId
}) {
  const trimmedName = sanitizeTrimmedString(name);
  const trimmedSku = sanitizeTrimmedString(sku);
  const trimmedCategory = sanitizeTrimmedString(category);
  const trimmedDescription = sanitizeTrimmedString(description);

  if (!trimmedName) {
    throw new MerchandiseError('Product name is required.');
  }
  if (!trimmedSku) {
    throw new MerchandiseError('SKU is required.');
  }
  if (!trimmedCategory) {
    throw new MerchandiseError('Category is required.');
  }

  const normalizedPrice = normalizeCurrency(price, 'Price');
  if (normalizedPrice === null) {
    throw new MerchandiseError('Price is required.');
  }
  const normalizedStock = Number(stockQty);
  if (!Number.isInteger(normalizedStock) || normalizedStock < 0) {
    throw new MerchandiseError('Stock quantity must be a non-negative integer.');
  }

  const result = await getPool().query(
    {
      text: `INSERT INTO merch_products (
               name, sku, description, category, price, stock_qty, is_active, is_featured, created_by, updated_by, created_at, updated_at
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, NOW(), NOW())
             RETURNING id, name, sku, description, category, price, stock_qty, is_active, is_featured, created_at, updated_at, created_by, updated_by`,
      values: [
        trimmedName,
        trimmedSku,
        trimmedDescription || null,
        trimmedCategory,
        normalizedPrice,
        normalizedStock,
        Boolean(isActive),
        Boolean(isFeatured),
        Number.isInteger(userId) ? userId : null
      ]
    }
  );

  return mapProductRow(result.rows[0]);
}

async function updateProduct(id, fields) {
  const productId = Number(id);
  if (!Number.isInteger(productId) || productId <= 0) {
    throw new MerchandiseError('Invalid product id.');
  }

  const updates = [];
  const values = [];
  let index = 1;

  if (fields.name !== undefined) {
    const name = sanitizeTrimmedString(fields.name);
    if (!name) {
      throw new MerchandiseError('Product name cannot be empty.');
    }
    updates.push(`name = $${index++}`);
    values.push(name);
  }

  if (fields.sku !== undefined) {
    const sku = sanitizeTrimmedString(fields.sku);
    if (!sku) {
      throw new MerchandiseError('SKU cannot be empty.');
    }
    updates.push(`sku = $${index++}`);
    values.push(sku);
  }

  if (fields.description !== undefined) {
    const description = sanitizeTrimmedString(fields.description);
    updates.push(`description = $${index++}`);
    values.push(description || null);
  }

  if (fields.category !== undefined) {
    const category = sanitizeTrimmedString(fields.category);
    if (!category) {
      throw new MerchandiseError('Category cannot be empty.');
    }
    updates.push(`category = $${index++}`);
    values.push(category);
  }

  if (fields.price !== undefined) {
    const normalizedPrice = normalizeCurrency(fields.price, 'Price');
    if (normalizedPrice === null) {
      throw new MerchandiseError('Price must be provided when updating.');
    }
    updates.push(`price = $${index++}`);
    values.push(normalizedPrice);
  }

  if (fields.stockQty !== undefined || fields.stock_qty !== undefined) {
    const stock = Number(fields.stockQty ?? fields.stock_qty);
    if (!Number.isInteger(stock) || stock < 0) {
      throw new MerchandiseError('Stock quantity must be a non-negative integer.');
    }
    updates.push(`stock_qty = $${index++}`);
    values.push(stock);
  }

  if (fields.isActive !== undefined || fields.is_active !== undefined) {
    updates.push(`is_active = $${index++}`);
    values.push(Boolean(fields.isActive ?? fields.is_active));
  }

  if (fields.isFeatured !== undefined || fields.is_featured !== undefined) {
    updates.push(`is_featured = $${index++}`);
    values.push(Boolean(fields.isFeatured ?? fields.is_featured));
  }

  const updatedBy = Number(fields.userId ?? fields.updatedBy);
  updates.push(`updated_at = NOW()`);
  if (Number.isInteger(updatedBy) && updatedBy > 0) {
    updates.push(`updated_by = $${index++}`);
    values.push(updatedBy);
  }

  if (updates.length === 1 && updates[0] === 'updated_at = NOW()') {
    throw new MerchandiseError('No fields provided to update.');
  }

  values.push(productId);

  const result = await getPool().query(
    {
      text: `UPDATE merch_products
               SET ${updates.join(', ')}
             WHERE id = $${index}
             RETURNING id, name, sku, description, category, price, stock_qty, is_active, is_featured, created_at, updated_at, created_by, updated_by`,
      values
    }
  );

  if (result.rowCount === 0) {
    throw new MerchandiseError('Product not found.', 404);
  }

  return mapProductRow(result.rows[0]);
}

async function updateOrder(orderId, fields) {
  const id = Number(orderId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new MerchandiseError('Invalid order id.');
  }

  const updates = [];
  const values = [];
  let index = 1;

  if (fields.status !== undefined) {
    const status = sanitizeTrimmedString(fields.status);
    if (!status) {
      throw new MerchandiseError('Status cannot be empty.');
    }
    updates.push(`status = $${index++}`);
    values.push(status);
  }

  if (fields.isPaid !== undefined || fields.is_paid !== undefined) {
    updates.push(`is_paid = $${index++}`);
    values.push(Boolean(fields.isPaid ?? fields.is_paid));
  }

  if (fields.isCancelled !== undefined || fields.is_cancelled !== undefined) {
    updates.push(`is_cancelled = $${index++}`);
    values.push(Boolean(fields.isCancelled ?? fields.is_cancelled));
  }

  if (fields.isFulfilled !== undefined || fields.is_fulfilled !== undefined) {
    updates.push(`is_fulfilled = $${index++}`);
    values.push(Boolean(fields.isFulfilled ?? fields.is_fulfilled));
  }

  if (fields.pickup_ready_at !== undefined || fields.pickupReadyAt !== undefined) {
    const raw = fields.pickup_ready_at ?? fields.pickupReadyAt;
    const date = raw ? new Date(raw) : null;
    if (!date || Number.isNaN(date.valueOf())) {
      throw new MerchandiseError('pickup_ready_at must be a valid date.');
    }
    updates.push(`pickup_ready_at = $${index++}`);
    values.push(date);
  }

  if (fields.notes !== undefined) {
    const notes = ensureNullableString(fields.notes);
    updates.push(`notes = $${index++}`);
    values.push(notes);
  }

  updates.push('updated_at = NOW()');

  if (updates.length === 1 && updates[0] === 'updated_at = NOW()') {
    throw new MerchandiseError('No valid fields were provided for update.');
  }

  values.push(id);

  const result = await getPool().query(
    {
      text: `UPDATE merch_orders
               SET ${updates.join(', ')}
             WHERE id = $${index}
             RETURNING id, purchaser_user_id, purchaser_name, purchaser_email, purchaser_phone, pickup_option, status,
                       is_paid, is_cancelled, is_fulfilled, pickup_ready_at, subtotal, tax_total, total, notes, created_at, updated_at`,
      values
    }
  );

  if (result.rowCount === 0) {
    throw new MerchandiseError('Order not found.', 404);
  }

  const order = mapOrderRow(result.rows[0]);

  const itemsResult = await getPool().query(
    `SELECT id, order_id, product_id, quantity, unit_price, line_total, created_at, updated_at
       FROM merch_order_items
      WHERE order_id = $1
      ORDER BY id ASC`,
    [order.id]
  );

  return {
    ...order,
    items: itemsResult.rows.map(mapOrderItemRow)
  };
}

module.exports = {
  MerchandiseError,
  STAFF_ROLE_SET,
  computePickupReadyAt,
  fetchUserById,
  listProducts,
  createOrder,
  listOrders,
  createProduct,
  updateProduct,
  updateOrder
};