const API_BASE = '/api/merch';
const SORT_PARAM_MAP = {
  'name-asc': 'name_asc',
  'name-desc': 'name_desc',
  'price-asc': 'price_asc',
  'price-desc': 'price_desc'
};
const ORDER_STATUS_OPTIONS = ['pending', 'processing', 'ready_for_pickup', 'completed', 'cancelled'];
const FILTER_DEBOUNCE_MS = 250;

/* ----------------------------
   UTILITIES
---------------------------- */
function loadStoredCart() {
  try {
    const raw = localStorage.getItem('mu_cart');
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return Object.entries(parsed).reduce((acc, [key, value]) => {
      const qty = Number(value);
      if (Number.isInteger(qty) && qty > 0) {
        acc[String(key)] = qty;
      }
      return acc;
    }, {});
  } catch (error) {
    console.warn('Failed to parse stored cart; resetting.', error);
    return {};
  }
}

function fmt(value) {
  return '$' + Number(value || 0).toFixed(2);
}

function getProductKey(id) {
  return String(id);
}

function normalizeProduct(raw) {
  if (!raw) {
    return null;
  }
  const price = Number(raw.price ?? raw.unit_price ?? raw.cost ?? 0);
  const stock = Number(raw.stock_qty ?? raw.stockQty ?? raw.inventory ?? 0);
  return {
    id: raw.id,
    name: raw.name || raw.title || 'Product',
    description: raw.description || raw.desc || '',
    category: raw.category || 'Other',
    price: Number.isFinite(price) ? Number(price.toFixed(2)) : 0,
    stockQty: Number.isFinite(stock) && stock >= 0 ? Math.floor(stock) : 0,
    isActive: raw.is_active ?? raw.isActive ?? true,
    sku: raw.sku || raw.id,
    imageUrl: raw.image_url || raw.imageUrl || raw.image || null,
    notes: raw.notes || '',
    isFeatured: raw.is_featured ?? raw.isFeatured ?? false
  };
}

function normalizeOrderItem(raw) {
  if (!raw) return null;
  return {
    id: raw.id,
    orderId: raw.order_id ?? raw.orderId,
    productId: raw.product_id ?? raw.productId,
    quantity: Number(raw.quantity) || 0,
    unitPrice: Number(raw.unit_price ?? raw.unitPrice ?? 0),
    lineTotal: Number(raw.line_total ?? raw.lineTotal ?? 0)
  };
}

function normalizeOrder(raw) {
  if (!raw) return null;
  return {
    id: raw.id,
    purchaserName: raw.purchaser_name || raw.purchaserName || 'Customer',
    purchaserEmail: raw.purchaser_email || raw.purchaserEmail || '',
    purchaserPhone: raw.purchaser_phone || raw.purchaserPhone || '',
    pickupOption: raw.pickup_option || raw.pickupOption || '',
    status: raw.status || 'pending',
    isPaid: raw.is_paid ?? raw.isPaid ?? false,
    isCancelled: raw.is_cancelled ?? raw.isCancelled ?? false,
    isFulfilled: raw.is_fulfilled ?? raw.isFulfilled ?? false,
    pickupReadyAt: raw.pickup_ready_at || raw.pickupReadyAt || null,
    subtotal: Number(raw.subtotal ?? 0),
    taxTotal: Number(raw.tax_total ?? raw.taxTotal ?? 0),
    total: Number(raw.total ?? 0),
    notes: raw.notes || '',
    createdAt: raw.created_at || raw.createdAt || null,
    updatedAt: raw.updated_at || raw.updatedAt || null,
    items: Array.isArray(raw.items) ? raw.items.map(normalizeOrderItem).filter(Boolean) : []
  };
}

function getProductById(id) {
  return state.catalog.get(getProductKey(id)) || null;
}

function saveCart() {
  localStorage.setItem('mu_cart', JSON.stringify(state.cart));
}

function buildAuthHeaders({ json = false } = {}) {
  const headers = {};
  if (json) {
    headers['Content-Type'] = 'application/json';
  }
  try {
    const token = localStorage.getItem('musAuthToken');
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  } catch (error) {
    console.warn('Unable to read auth token.', error);
  }
  return headers;
}

const state = {
  query: '',
  category: 'All Categories',
  sort: 'name-asc',
  products: [],
  catalog: new Map(),
  cart: loadStoredCart(),
  isLoading: false,
  error: null,
  filterTimer: null,
  editingProductId: null,
  isSavingProduct: false,
  productFormError: '',
  orders: [],
  ordersLoading: false,
  ordersError: null,
  orderStatusFilter: 'all'
};

/* ----------------------------
   ELEMENT REFERENCES
---------------------------- */
const productsEl = document.getElementById('products');
const countEl = document.getElementById('count');
const resultsText = document.getElementById('resultsText');
const searchInput = document.getElementById('searchInput');
const categorySelect = document.getElementById('categorySelect');
const categoryLabel = document.getElementById('categoryLabel');
const categoryList = document.getElementById('categoryList');
const sortSelect = document.getElementById('sortSelect');
const sortLabel = document.getElementById('sortLabel');
const sortList = document.getElementById('sortList');

const cartDrawer = document.getElementById('cartDrawer');
const cartItemsEl = document.getElementById('cartItems');
const cartBadge = document.getElementById('cartBadge');
const cartSubtotalEl = document.getElementById('cartSubtotal');
const cartCountEl = document.getElementById('cartCount');

const overlay = document.getElementById('overlay');
const modalTitle = document.getElementById('modalTitle');
const modalDesc = document.getElementById('modalDesc');
const modalPrice = document.getElementById('modalPrice');
const modalCategory = document.getElementById('modalCategory');
const modalQty = document.getElementById('modalQty');
const modalAddBtn = document.getElementById('modalAdd');
const modalPlusBtn = document.getElementById('modalPlus');
const modalMinusBtn = document.getElementById('modalMinus');
const modalViewBtn = document.getElementById('modalView');
const modalMedia = document.getElementById('modalMedia');

const editModal = document.getElementById('editModal');
const editNameInput = document.getElementById('editName');
const editSkuInput = document.getElementById('editSku');
const editCategoryInput = document.getElementById('editCategory');
const editPriceInput = document.getElementById('editPrice');
const editStockInput = document.getElementById('editStock');
const editDescInput = document.getElementById('editDesc');
const editIsActiveInput = document.getElementById('editIsActive');
const editErrorEl = document.getElementById('editError');
const saveProductBtn = document.getElementById('saveProduct');

const ordersListEl = document.getElementById('ordersList');
const orderStatusFilterEl = document.getElementById('orderStatusFilter');
const refreshOrdersBtn = document.getElementById('refreshOrders');

let modalQtyVal = 1;
let currentModalProduct = null;
/* ----------------------------
  DATA LOADING
---------------------------- */
async function loadProducts() {
  state.isLoading = true;
  state.error = null;
  renderProducts();

  const params = new URLSearchParams();
  if (state.query) params.set('search', state.query);
  if (state.category && state.category !== 'All Categories') params.set('category', state.category);
  if (state.sort) params.set('sort', SORT_PARAM_MAP[state.sort] || 'name_asc');
  params.set('includeInactive', '1');

  const url = `${API_BASE}/products${params.toString() ? `?${params.toString()}` : ''}`;

  try {
    const response = await fetch(url, { headers: buildAuthHeaders() });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload?.message || 'Unable to load merchandise right now.';
      throw new Error(message);
    }

    const products = Array.isArray(payload.products)
      ? payload.products.map(normalizeProduct).filter(Boolean)
      : [];

    state.products = products;
    products.forEach((product) => {
      state.catalog.set(getProductKey(product.id), product);
    });

    renderCategoryList();
  } catch (error) {
    console.error('Failed to load products:', error);
    state.error = error.message || 'Something went wrong while loading products.';
    state.products = [];
  } finally {
    state.isLoading = false;
    renderProducts();
    renderCart();
    renderBadge();
    renderOrders();
  }
}

function getAvailableCategories() {
  const unique = new Set(['All Categories']);
  state.catalog.forEach((product) => {
    if (product?.category) {
      unique.add(product.category);
    }
  });
  return Array.from(unique);
}

function renderCategoryList() {
  if (!categoryList) return;
  const categories = getAvailableCategories();
  if (!categories.includes(state.category)) {
    state.category = 'All Categories';
  }
  categoryLabel.textContent = state.category;
  categoryList.innerHTML = '';
    categories.forEach((cat) => {
    const option = document.createElement('div');
    option.textContent = cat;
    option.className = 'dropdown-item';
    if (cat === state.category) {
      option.style.fontWeight = '600';
      option.style.color = 'var(--accent)';
    }
    option.addEventListener('click', () => {
      state.category = cat;
      categoryLabel.textContent = cat;
      categoryList.style.display = 'none';
      filterAndRender();
    });
    categoryList.appendChild(option);
  });
}

function renderSortList() {
  if (!sortList) return;
  const opts = [
    { k: 'name-asc', t: 'Name (A–Z)' },
    { k: 'name-desc', t: 'Name (Z–A)' },
    { k: 'price-asc', t: 'Price: Low → High' },
    { k: 'price-desc', t: 'Price: High → Low' }
  ];
  sortList.innerHTML = '';
    opts.forEach((opt) => {
    const div = document.createElement('div');
    div.textContent = opt.t;
    div.className = 'dropdown-item';
    div.addEventListener('click', () => {
      state.sort = opt.k;
      sortLabel.textContent = opt.t;
      sortList.style.display = 'none';
      filterAndRender();
    });
    sortList.appendChild(div);
  });
}
function filterAndRender() {
  if (state.filterTimer) {
    clearTimeout(state.filterTimer);
  }
  state.filterTimer = setTimeout(() => {
    loadProducts();
  }, FILTER_DEBOUNCE_MS);
}

/* ----------------------------
   PRODUCT RENDERING
---------------------------- */
function renderProducts() {
  if (!productsEl) return;
  productsEl.innerHTML = '';

  if (state.isLoading) {
    countEl.textContent = '0';
    const loading = document.createElement('div');
    loading.style.padding = '40px';
    loading.style.textAlign = 'center';
    loading.style.color = 'var(--subtext)';
    loading.textContent = 'Loading products...';
    productsEl.appendChild(loading);
    return;
  }

  if (state.error) {
    countEl.textContent = '0';
    const errorEl = document.createElement('div');
    errorEl.style.padding = '40px';
    errorEl.style.textAlign = 'center';
    errorEl.style.background = '#fce8e6';
    errorEl.style.color = '#b3261e';
    errorEl.style.borderRadius = '12px';
    errorEl.textContent = state.error;
    productsEl.appendChild(errorEl);
    return;
  }

  const list = state.products || [];
  countEl.textContent = String(list.length);

  if (!list.length) {
    const empty = document.createElement('div');
    empty.style.padding = '40px';
    empty.style.textAlign = 'center';
    empty.style.color = 'var(--subtext)';
    empty.textContent = 'No merchandise matches your filters yet. Adjust filters or try again later.';
    productsEl.appendChild(empty);
    return;
  }

  list.forEach((product) => {
    const card = document.createElement('div');
    card.className = 'card';

    const media = document.createElement('div');
    media.className = 'media';
        if (product.imageUrl) {
      const img = document.createElement('img');
      img.src = product.imageUrl;
      img.alt = product.name;
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'cover';
      media.appendChild(img);
    } else {
      media.textContent = 'Image';
    }

    const title = document.createElement('div');
    title.innerHTML = `<strong>${product.name}</strong><div class="desc">${product.description || 'No description yet.'}</div>`;

    const info = document.createElement('div');
    info.className = 'card-info';
    const pill = document.createElement('div');
    pill.className = 'pill';
    pill.textContent = product.category || 'Merch';
    const price = document.createElement('div');
    price.className = 'price';
    price.textContent = fmt(product.price);
    info.appendChild(pill);
    info.appendChild(price);

    const status = document.createElement('div');
    status.style.fontSize = '12px';
    status.style.marginTop = '6px';
    status.style.color = product.isActive ? '#137333' : '#b3261e';
    status.textContent = product.isActive ? 'Active' : 'Inactive';

    const controls = document.createElement('div');
    controls.className = 'card-controls';

    const viewBtn = document.createElement('button');
    viewBtn.className = 'view-btn';
    viewBtn.textContent = 'View Details';
    viewBtn.addEventListener('click', () => openModal(product));

    const addBtn = document.createElement('button');
    addBtn.className = 'add-btn';
    const inStock = Number(product.stockQty || 0) > 0;
    addBtn.textContent = inStock ? 'Put in Cart' : 'Out of Stock';
    addBtn.disabled = !inStock;
    if (!inStock) {
      addBtn.style.opacity = '0.7';
      addBtn.style.cursor = 'not-allowed';
    }
    addBtn.addEventListener('click', () => {
      addToCart(product.id, 1);
      openCart();
    });

    const editBtn = document.createElement('button');
    editBtn.className = 'edit-btn';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => openEditModal(product));

    controls.append(viewBtn, addBtn, editBtn);

    card.append(media, title, info, controls);
    productsEl.appendChild(card);
  });
}

/* ----------------------------
   CART LOGIC
---------------------------- */


function cartTotals() {
  let count = 0;
  let total = 0;
  const invalidIds = [];

  for (const [id, qtyRaw] of Object.entries(state.cart)) {
    const qty = Number(qtyRaw);
    if (!Number.isInteger(qty) || qty <= 0) {
      invalidIds.push(id);
      continue;
    }
    const product = getProductById(id);
    if (!product) {
      invalidIds.push(id);
      continue;
    }
    count += qty;
    total += Number(product.price) * qty;
  }
    if (invalidIds.length) {
    invalidIds.forEach((id) => delete state.cart[id]);
    saveCart();
  }

  return { count, total: Number(total.toFixed(2)) };
}

function renderCart() {
  if (!cartItemsEl) return;
  cartItemsEl.innerHTML = '';

  const ids = Object.keys(state.cart);
  if (ids.length === 0) {
    cartItemsEl.innerHTML = '<div style="color:var(--subtext)">Your cart is empty.</div>';
  } else if (state.catalog.size === 0) {
    cartItemsEl.innerHTML = '<div style="color:var(--subtext)">Loading your cart items...</div>';
  } else {
      ids.forEach((id) => {
      const qty = Number(state.cart[id]);
      const product = getProductById(id);
      if (!product || !Number.isInteger(qty) || qty <= 0) {
        return;
      }
      const el = document.createElement('div');
      el.className = 'cart-item';
      const thumb = document.createElement('div');
      thumb.className = 'thumb';
      if (product.imageUrl) {
        const img = document.createElement('img');
        img.src = product.imageUrl;
        img.alt = product.name;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        thumb.appendChild(img);
      } else {
        thumb.textContent = 'Img';
      }
      const info = document.createElement('div');
      info.style.flex = '1';
      info.innerHTML = `<strong>${product.name}</strong><div style="color:var(--subtext)">${product.category}</div><div style="font-weight:700;color:var(--accent)">${fmt(product.price)}</div>`;

      const ctrl = document.createElement('div');
      ctrl.className = 'ctrl';

      const minus = document.createElement('button');
      minus.className = 'minus';
      minus.textContent = '−';
      minus.addEventListener('click', () => {
        const current = Number(state.cart[id] || 0);
        if (current > 1) {
          state.cart[id] = current - 1;
        } else {
          delete state.cart[id];
        }
        saveCart();
        renderCart();
        renderBadge();
      });
       const qtyDisplay = document.createElement('span');
      qtyDisplay.textContent = qty;

      const plus = document.createElement('button');
      plus.className = 'plus';
      plus.textContent = '+';
      plus.addEventListener('click', () => {
        const current = Number(state.cart[id] || 0);
        const stock = Number(product.stockQty ?? Infinity);
        const next = current + 1;
        if (Number.isFinite(stock) && next > stock) {
          alert(`Only ${stock} left in stock for ${product.name}.`);
          return;
        }
        state.cart[id] = next;
        saveCart();
        renderCart();
        renderBadge();
      });
            const remove = document.createElement('button');
      remove.className = 'remove';
      remove.textContent = '🗑';
      remove.addEventListener('click', () => {
        delete state.cart[id];
        saveCart();
        renderCart();
        renderBadge();
      });
      
      ctrl.append(minus, qtyDisplay, plus, remove);
      el.append(thumb, info, ctrl);
      cartItemsEl.appendChild(el);
    });
  }



  const totals = cartTotals();
  cartBadge.textContent = totals.count;
  cartSubtotalEl.textContent = fmt(totals.total);
  cartCountEl.textContent = totals.count;
}

function addToCart(id, qty = 1) {
    const product = getProductById(id);
  if (!product) {
    alert('This product is no longer available.');
    return;
  }
  const current = Number(state.cart[getProductKey(id)] || 0);
  const stock = Number(product.stockQty ?? Infinity);
  const next = current + Number(qty);
  if (Number.isFinite(stock) && next > stock) {
    alert(`Only ${stock} left in stock for ${product.name}.`);
    return;
  }
  state.cart[getProductKey(id)] = next;
  saveCart();
  renderCart();
  renderBadge();
}

function renderBadge() {
  const totals = cartTotals();
  cartBadge.textContent = totals.count;
}

function openCart() {
  cartDrawer.classList.add('open');
  cartDrawer.setAttribute('aria-hidden', 'false');
}

function closeCart() {
  cartDrawer.classList.remove('open');
  cartDrawer.setAttribute('aria-hidden', 'true');
}

document.getElementById('closeCart').addEventListener('click', closeCart);
document.getElementById('continueShopping').addEventListener('click', () => {
  closeCart();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
document.getElementById('proceedCheckout').addEventListener('click', () => {
  closeCart();
  showCheckout();
});

/* ----------------------------
 PRODUCT MODAL
---------------------------- */
function updateModalMedia(product) {
  if (!modalMedia) return;
  modalMedia.innerHTML = '';
  if (product.imageUrl) {
    const img = document.createElement('img');
    img.src = product.imageUrl;
    img.alt = product.name;
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'cover';
    modalMedia.appendChild(img);
  } else {
    modalMedia.textContent = 'Image';
  }
}

function openModal(product) {
  currentModalProduct = product;
  modalTitle.textContent = product.name;
  modalDesc.textContent = product.description || 'No description provided yet.';
  modalPrice.textContent = fmt(product.price);
  modalCategory.textContent = product.category || 'Merch';
  updateModalMedia(product);
  modalQtyVal = 1;
  modalQty.textContent = modalQtyVal;
    const stock = Number(product.stockQty ?? 0);
  if (stock <= 0) {
    modalAddBtn.disabled = true;
    modalAddBtn.textContent = 'Out of Stock';
  } else {
    modalAddBtn.disabled = false;
    modalAddBtn.textContent = 'Add to Cart';
  }
  overlay.style.display = 'flex';
   overlay.setAttribute('aria-hidden', 'false');
}

function closeModal() {
  overlay.style.display = 'none';
  overlay.setAttribute('aria-hidden', 'true');
}

document.getElementById('closeModal').addEventListener('click', closeModal);
modalPlusBtn.addEventListener('click', () => {
  if (!currentModalProduct) return;
  const stock = Number(currentModalProduct.stockQty ?? Infinity);
  if (Number.isFinite(stock) && modalQtyVal >= stock) {
    alert(`Only ${stock} left in stock for ${currentModalProduct.name}.`);
    return;
  }
  modalQtyVal += 1;
  modalQty.textContent = modalQtyVal;
});
modalMinusBtn.addEventListener('click', () => {
  if (modalQtyVal > 1) {
    modalQtyVal -= 1;
    modalQty.textContent = modalQtyVal;
  }
});
modalAddBtn.addEventListener('click', () => {
  if (currentModalProduct && modalQtyVal > 0) {
    addToCart(currentModalProduct.id, modalQtyVal);
    closeModal();
    openCart();
  }
});
modalViewBtn.addEventListener('click', () => {
  closeModal();
});

/* ----------------------------
   CHECKOUT FLOW
---------------------------- */
function showCheckout() {
  document.getElementById('checkoutArea').style.display = 'block';
  document.getElementById('products').style.display = 'none';
  document.getElementById('controls').style.display = 'none';
  renderCheckoutItems();
}

function backToShop() {
  document.getElementById('checkoutArea').style.display = 'none';
  document.getElementById('paymentArea').style.display = 'none';
  document.getElementById('products').style.display = '';
  document.getElementById('controls').style.display = '';
}

function renderCheckoutItems() {
  const el = document.getElementById('checkoutItems');
  el.innerHTML = '';
  const ids = Object.keys(state.cart);
  if (ids.length === 0) {
    el.innerHTML = '<div>Your cart is empty.</div>';
  } else {
       ids.forEach((id) => {
      const product = getProductById(id);
      if (!product) return;
      const qty = Number(state.cart[id]);
      const row = document.createElement('div');
            row.innerHTML = `<div><strong>${product.name}</strong> (x${qty})</div><div>${fmt(product.price)}</div>`;
      el.appendChild(row);
    });
  }
  const totals = cartTotals();
  document.getElementById('orderTotal').textContent = fmt(totals.total);
  document.getElementById('orderTotal2').textContent = fmt(totals.total);
  renderOrderSummaries();
}

function renderOrderSummaries() {
  const orderSummary = document.getElementById('orderSummary');
  const orderSummary2 = document.getElementById('orderSummary2');
  if (orderSummary) orderSummary.innerHTML = '';
  if (orderSummary2) orderSummary2.innerHTML = '';
  const ids = Object.keys(state.cart);
  if (!ids.length) {
    if (orderSummary) orderSummary.textContent = 'No items in cart yet.';
    if (orderSummary2) orderSummary2.textContent = 'No items in cart yet.';
    return;
  }
  ids.forEach((id) => {
    const product = getProductById(id);
    if (!product) return;
    const qty = Number(state.cart[id]);
    const line = document.createElement('div');
    line.style.display = 'flex';
    line.style.justifyContent = 'space-between';
    line.innerHTML = `<span>${product.name} (x${qty})</span><span>${fmt(product.price * qty)}</span>`;
    if (orderSummary) orderSummary.appendChild(line.cloneNode(true));
    if (orderSummary2) orderSummary2.appendChild(line);
  });
}

document.getElementById('continueToPayment').addEventListener('click', () => {
  const name = document.getElementById('fullname').value.trim();
  const email = document.getElementById('email').value.trim();
  const addr1 = document.getElementById('addr1').value.trim();
  if (!name || !email || !addr1) {
    alert('Please fill required delivery fields.');
    return;
  }

  document.getElementById('checkoutArea').style.display = 'none';
  document.getElementById('paymentArea').style.display = 'block';
});

document.getElementById('backToCart').addEventListener('click', () => backToShop());
document.getElementById('backToDelivery').addEventListener('click', () => {
  document.getElementById('paymentArea').style.display = 'none';
  document.getElementById('checkoutArea').style.display = 'block';
});

document.getElementById('completeOrder').addEventListener('click', () => {
  alert('✅ Order placed — thank you! (Mock only)');
    state.cart = {};
  saveCart();
  renderCart();
  renderBadge();
  backToShop();
});

/* ----------------------------
   PRODUCT FORM (CREATE/UPDATE)
---------------------------- */
function setProductFormError(message) {
  if (!editErrorEl) return;
  if (!message) {
    editErrorEl.style.display = 'none';
    editErrorEl.textContent = '';
    return;
  }
  editErrorEl.style.display = 'block';
  editErrorEl.textContent = message;
}

function openEditModal(product = null) {
  if (!editModal) return;
  state.editingProductId = product ? product.id : null;
  setProductFormError('');
  if (product) {
    editNameInput.value = product.name || '';
    editSkuInput.value = product.sku || '';
    editCategoryInput.value = product.category || '';
    editPriceInput.value = Number(product.price ?? 0);
    editStockInput.value = Number(product.stockQty ?? 0);
    editDescInput.value = product.description || '';
    editIsActiveInput.checked = Boolean(product.isActive);
  } else {
    editNameInput.value = '';
    editSkuInput.value = '';
    editCategoryInput.value = '';
    editPriceInput.value = '';
    editStockInput.value = '0';
    editDescInput.value = '';
    editIsActiveInput.checked = true;
  }
    editModal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeEditModal() {
    if (!editModal) return;
  editModal.style.display = 'none';
  document.body.style.overflow = 'auto';
    state.editingProductId = null;
  state.isSavingProduct = false;
  setProductFormError('');
  saveProductBtn.disabled = false;
  saveProductBtn.textContent = 'Save Changes';
}

document.getElementById('addProductBtn').addEventListener('click', () => openEditModal());
document.getElementById('closeEditModal').addEventListener('click', closeEditModal);
document.getElementById('cancelEdit').addEventListener('click', closeEditModal);
async function submitProductForm() {
  if (state.isSavingProduct) return;
  const name = editNameInput.value.trim();
  const sku = editSkuInput.value.trim();
  const category = editCategoryInput.value.trim();
  const priceValue = editPriceInput.value.trim();
  const stockValue = editStockInput.value.trim();
  const description = editDescInput.value.trim();
  const isActive = editIsActiveInput.checked;

  if (!name || !sku || !category || !priceValue) {
    setProductFormError('Name, SKU, category, and price are required.');
    return;
  }

  const payload = {
    name,
    sku,
    category,
    price: priceValue,
    stockQty: Number(stockValue || 0),
    description,
    isActive
  };

  const isUpdate = Boolean(state.editingProductId);
  const url = isUpdate ? `${API_BASE}/products/${state.editingProductId}` : `${API_BASE}/products`;
  const method = isUpdate ? 'PUT' : 'POST';

  state.isSavingProduct = true;
  saveProductBtn.disabled = true;
  saveProductBtn.textContent = isUpdate ? 'Saving…' : 'Creating…';
  setProductFormError('');

  try {
    const response = await fetch(url, {
      method,
      headers: buildAuthHeaders({ json: true }),
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data?.message || 'Unable to save product. Please try again.';
      throw new Error(message);
    }

    closeEditModal();
    await loadProducts();
  } catch (error) {
    console.error('Failed to save product', error);
    setProductFormError(error.message || 'Unable to save product.');
    state.isSavingProduct = false;
    saveProductBtn.disabled = false;
    saveProductBtn.textContent = 'Save Changes';
  }
}

saveProductBtn.addEventListener('click', submitProductForm);

/* ----------------------------
   ORDERS MANAGEMENT
---------------------------- */
function renderOrders() {
  if (!ordersListEl) return;
  ordersListEl.innerHTML = '';

  if (state.ordersLoading) {
    const loading = document.createElement('div');
    loading.style.padding = '24px';
    loading.style.textAlign = 'center';
    loading.style.color = 'var(--subtext)';
    loading.textContent = 'Loading orders…';
    ordersListEl.appendChild(loading);
    return;
  }

  if (state.ordersError) {
    const errorEl = document.createElement('div');
    errorEl.style.padding = '24px';
    errorEl.style.background = '#fce8e6';
    errorEl.style.color = '#b3261e';
    errorEl.style.borderRadius = '12px';
    errorEl.textContent = state.ordersError;
    ordersListEl.appendChild(errorEl);
    return;
  }

  if (!state.orders.length) {
    const empty = document.createElement('div');
    empty.style.padding = '24px';
    empty.style.textAlign = 'center';
    empty.style.color = 'var(--subtext)';
    empty.textContent = 'No orders found for this filter.';
    ordersListEl.appendChild(empty);
    return;
  }

  state.orders.forEach((order) => {
    const card = document.createElement('div');
    card.className = 'order-card';

    const header = document.createElement('div');
    header.className = 'order-header';
    header.innerHTML = `<strong>Order #${order.id}</strong><span>${order.purchaserName || 'Customer'}</span>`;

    const meta = document.createElement('div');
    meta.className = 'order-meta';
    meta.innerHTML = `
      <div><strong>Status:</strong> ${order.status}</div>
      <div><strong>Total:</strong> ${fmt(order.total)}</div>
      <div><strong>Email:</strong> <a href="mailto:${order.purchaserEmail}">${order.purchaserEmail || '—'}</a></div>
      <div><strong>Phone:</strong> ${order.purchaserPhone || '—'}</div>
    `;

    const itemsList = document.createElement('ul');
    itemsList.className = 'order-items';
    if (order.items.length) {
      order.items.forEach((item) => {
        const product = getProductById(item.productId);
        const li = document.createElement('li');
        const name = product ? product.name : `Product #${item.productId}`;
        li.textContent = `${name} — ${item.quantity} × ${fmt(item.unitPrice)} (${fmt(item.lineTotal)})`;
        itemsList.appendChild(li);
      });
    } else {
      const li = document.createElement('li');
      li.textContent = 'No line items recorded.';
      itemsList.appendChild(li);
    }

    const form = document.createElement('div');
    form.className = 'order-form';

    const statusSelect = document.createElement('select');
    ORDER_STATUS_OPTIONS.forEach((status) => {
      const option = document.createElement('option');
      option.value = status;
      option.textContent = status.replace(/_/g, ' ');
      if (status === order.status) {
        option.selected = true;
      }
      statusSelect.appendChild(option);
    });

    const paidToggle = document.createElement('label');
    paidToggle.className = 'order-toggle';
    const paidInput = document.createElement('input');
    paidInput.type = 'checkbox';
    paidInput.checked = Boolean(order.isPaid);
    paidToggle.appendChild(paidInput);
    paidToggle.append(' Paid');

    const fulfilledToggle = document.createElement('label');
    fulfilledToggle.className = 'order-toggle';
    const fulfilledInput = document.createElement('input');
    fulfilledInput.type = 'checkbox';
    fulfilledInput.checked = Boolean(order.isFulfilled);
    fulfilledToggle.appendChild(fulfilledInput);
    fulfilledToggle.append(' Fulfilled');

    const cancelledToggle = document.createElement('label');
    cancelledToggle.className = 'order-toggle';
    const cancelledInput = document.createElement('input');
    cancelledInput.type = 'checkbox';
    cancelledInput.checked = Boolean(order.isCancelled);
    cancelledToggle.appendChild(cancelledInput);
    cancelledToggle.append(' Cancelled');

    const notesInput = document.createElement('textarea');
    notesInput.placeholder = 'Internal notes';
    notesInput.value = order.notes || '';
    notesInput.rows = 2;

    const feedback = document.createElement('div');
    feedback.className = 'order-feedback';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn-primary';
    saveBtn.textContent = 'Update Order';
    saveBtn.addEventListener('click', async () => {
      feedback.textContent = '';
      saveBtn.disabled = true;
      saveBtn.textContent = 'Updating…';
      try {
        await submitOrderUpdate(order.id, {
          status: statusSelect.value,
          isPaid: paidInput.checked,
          isFulfilled: fulfilledInput.checked,
          isCancelled: cancelledInput.checked,
          notes: notesInput.value
        });
        feedback.style.color = '#0f5132';
        feedback.textContent = 'Order updated.';
      } catch (error) {
        feedback.style.color = '#b3261e';
        feedback.textContent = error.message || 'Failed to update order.';
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Update Order';
      }
    });

    form.appendChild(createFormRow('Status', statusSelect));
    form.appendChild(createFormRow('Flags', [paidToggle, fulfilledToggle, cancelledToggle]));
    form.appendChild(createFormRow('Notes', notesInput));
    form.appendChild(saveBtn);
    form.appendChild(feedback);

    card.append(header, meta, itemsList, form);
    ordersListEl.appendChild(card);
  });
}

function createFormRow(label, content) {
  const wrapper = document.createElement('div');
  wrapper.className = 'order-form-row';
  const title = document.createElement('div');
  title.className = 'order-form-label';
  title.textContent = label;
  const body = document.createElement('div');
  body.className = 'order-form-body';
  if (Array.isArray(content)) {
    content.forEach((node) => body.appendChild(node));
  } else {
    body.appendChild(content);
  }
  wrapper.append(title, body);
  return wrapper;
}

async function loadOrders() {
  if (!ordersListEl) return;
  state.ordersLoading = true;
  state.ordersError = null;
  renderOrders();

  const params = new URLSearchParams();
  if (state.orderStatusFilter && state.orderStatusFilter !== 'all') {
    params.set('status', state.orderStatusFilter);
  }
  const url = `${API_BASE}/orders${params.toString() ? `?${params.toString()}` : ''}`;

  try {
    const response = await fetch(url, { headers: buildAuthHeaders() });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload?.message || 'Unable to load orders at the moment.';
      throw new Error(message);
    }
    const orders = Array.isArray(payload.orders) ? payload.orders.map(normalizeOrder).filter(Boolean) : [];
    state.orders = orders;
  } catch (error) {
    console.error('Failed to load orders:', error);
    state.ordersError = error.message || 'Unable to load orders.';
    state.orders = [];
  } finally {
    state.ordersLoading = false;
    renderOrders();
  }
}

async function submitOrderUpdate(orderId, updates) {
  const response = await fetch(`${API_BASE}/orders/${orderId}`, {
    method: 'PATCH',
    headers: buildAuthHeaders({ json: true }),
    body: JSON.stringify(updates)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.message || 'Failed to update order.';
    throw new Error(message);
  }
  const updated = normalizeOrder(data.order);
  if (updated) {
    const idx = state.orders.findIndex((order) => String(order.id) === String(updated.id));
    if (idx >= 0) {
      state.orders[idx] = updated;
      renderOrders();
    }
  }
}

if (orderStatusFilterEl) {
  orderStatusFilterEl.addEventListener('change', (event) => {
    state.orderStatusFilter = event.target.value;
    loadOrders();
  });
}
if (refreshOrdersBtn) {
  refreshOrdersBtn.addEventListener('click', () => {
    loadOrders();
  });
}

/* ----------------------------
   EVENT BINDINGS
---------------------------- */
searchInput.addEventListener('input', (event) => {
  state.query = event.target.value;
  filterAndRender();
});

categorySelect.addEventListener('click', () => {
  const isOpen = categoryList.style.display === 'block';
  categoryList.style.display = isOpen ? 'none' : 'block';
});

sortSelect.addEventListener('click', () => {
  const isOpen = sortList.style.display === 'block';
  sortList.style.display = isOpen ? 'none' : 'block';
});

document.addEventListener('click', (event) => {
  if (!categorySelect.contains(event.target)) {
    categoryList.style.display = 'none';
  }
  if (!sortSelect.contains(event.target)) {
    sortList.style.display = 'none';
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'c') openCart();
});

/* ----------------------------
   INIT
---------------------------- */
renderSortList();
renderCategoryList();
filterAndRender();
renderCart();
renderBadge();
loadOrders();