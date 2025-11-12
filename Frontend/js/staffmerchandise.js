/* ----------------------------
   MOCK PRODUCT DATA
---------------------------- */
const PRODUCTS = [
  { id: "p1", title: "Campus Guide Book", category: "Books", price: 12.99, desc: "Essential guide for new students with maps and resources." },
  { id: "p2", title: "University Hoodie", category: "Apparel", price: 49.00, desc: "Warm pullover with Murdoch logo." },
  { id: "p3", title: "Event Ticket", category: "Tickets", price: 25.00, desc: "Access to annual campus festival and activities." },
  { id: "p4", title: "Enamel Pin", category: "Accessories", price: 6.50, desc: "Collectible enamel pin." },
  { id: "p5", title: "Stationery Set", category: "Stationery", price: 9.75, desc: "Notebook + pen set." },
  { id: "p6", title: "Campus Tote Bag", category: "Accessories", price: 15.00, desc: "Canvas tote with MU print." }
];

const categories = ["All Categories", ...Array.from(new Set(PRODUCTS.map(p => p.category)))];

let state = {
  query: "",
  category: "All Categories",
  sort: "name-asc",
  products: PRODUCTS.slice(),
  cart: JSON.parse(localStorage.getItem('mu_cart') || '{}')
};

/* ----------------------------
   UTILITIES
---------------------------- */
function fmt(v) { return '$' + Number(v).toFixed(2); }
function saveCart() { localStorage.setItem('mu_cart', JSON.stringify(state.cart)); }

/* ----------------------------
   ELEMENT REFERENCES
---------------------------- */
const productsEl = document.getElementById('products');
const countEl = document.getElementById('count');
const searchInput = document.getElementById('searchInput');
const categoryLabel = document.getElementById('categoryLabel');
const categoryList = document.getElementById('categoryList');
const sortLabel = document.getElementById('sortLabel');
const sortList = document.getElementById('sortList');

/* ----------------------------
   CATEGORY + SORT FILTERS
---------------------------- */
function renderCategoryList() {
  categoryList.innerHTML = '';
  categories.forEach(cat => {
    const d = document.createElement('div');
    d.textContent = cat;
    d.className = 'dropdown-item';
    d.addEventListener('click', () => {
      state.category = cat;
      categoryLabel.textContent = cat;
      categoryList.style.display = 'none';
      filterAndRender();
    });
    categoryList.appendChild(d);
  });
}

function renderSortList() {
  const opts = [
    { k: 'name-asc', t: 'Name (A–Z)' },
    { k: 'price-asc', t: 'Price: Low → High' },
    { k: 'price-desc', t: 'Price: High → Low' }
  ];
  sortList.innerHTML = '';
  opts.forEach(o => {
    const d = document.createElement('div');
    d.textContent = o.t;
    d.className = 'dropdown-item';
    d.addEventListener('click', () => {
      state.sort = o.k;
      sortLabel.textContent = o.t;
      sortList.style.display = 'none';
      filterAndRender();
    });
    sortList.appendChild(d);
  });
}

/* ----------------------------
   PRODUCT FILTERING + SORTING
---------------------------- */
function filterAndRender() {
  let list = PRODUCTS.filter(p => {
    const matchesQuery = p.title.toLowerCase().includes(state.query.toLowerCase()) || p.desc.toLowerCase().includes(state.query.toLowerCase());
    const matchesCat = (state.category === "All Categories") || (p.category === state.category);
    return matchesQuery && matchesCat;
  });

  if (state.sort === 'name-asc') list.sort((a, b) => a.title.localeCompare(b.title));
  else if (state.sort === 'price-asc') list.sort((a, b) => a.price - b.price);
  else list.sort((a, b) => b.price - a.price);

  state.products = list;
  renderProducts();
}

/* ----------------------------
   PRODUCT CARD RENDERING
---------------------------- */
function renderProducts() {
  productsEl.innerHTML = '';
  countEl.textContent = state.products.length;

  state.products.forEach(p => {
    const card = document.createElement('div');
    card.className = 'card';

    const media = document.createElement('div');
    media.className = 'media';
    media.textContent = 'Image';

    const title = document.createElement('div');
    title.innerHTML = `<strong>${p.title}</strong><div class="desc">${p.desc}</div>`;

    const info = document.createElement('div');
    info.className = 'card-info';
    const pill = document.createElement('div');
    pill.className = 'pill';
    pill.textContent = p.category;
    const price = document.createElement('div');
    price.className = 'price';
    price.textContent = fmt(p.price);
    info.appendChild(pill);
    info.appendChild(price);

    const controls = document.createElement('div');
    controls.className = 'card-controls';

    const viewBtn = document.createElement('button');
    viewBtn.className = 'view-btn';
    viewBtn.textContent = 'View Details';
    viewBtn.addEventListener('click', () => openModal(p));

    const addBtn = document.createElement('button');
    addBtn.className = 'add-btn';
    addBtn.textContent = 'Put in Cart';
    addBtn.addEventListener('click', () => {
      addToCart(p.id, 1);
      openCart();
    });

    const editBtn = document.createElement('button');
    editBtn.className = 'edit-btn';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => openEditModal(p));

    controls.append(viewBtn, addBtn, editBtn);

    card.append(media, title, info, controls);
    productsEl.appendChild(card);
  });
}

/* ----------------------------
   CART DRAWER
---------------------------- */
const cartDrawer = document.getElementById('cartDrawer');
const cartItemsEl = document.getElementById('cartItems');
const cartBadge = document.getElementById('cartBadge');
const cartSubtotalEl = document.getElementById('cartSubtotal');
const cartCountEl = document.getElementById('cartCount');

function cartTotals() {
  let count = 0, total = 0;
  for (const id in state.cart) {
    const qty = state.cart[id];
    const prod = PRODUCTS.find(p => p.id === id);
    if (prod) { count += qty; total += prod.price * qty; }
  }
  return { count, total };
}

function renderCart() {
  cartItemsEl.innerHTML = '';
  const ids = Object.keys(state.cart);
  if (ids.length === 0) {
    cartItemsEl.innerHTML = '<div style="color:var(--subtext)">Your cart is empty.</div>';
  } else {
    ids.forEach(id => {
      const qty = state.cart[id];
      const p = PRODUCTS.find(x => x.id === id);
      const el = document.createElement('div');
      el.className = 'cart-item';
      el.innerHTML = `
        <div class="thumb">Img</div>
        <div class="info"><strong>${p.title}</strong><div>${p.category}</div><div>${fmt(p.price)}</div></div>
        <div class="ctrl">
          <button class="minus">−</button>
          <span>${qty}</span>
          <button class="plus">+</button>
          <button class="remove">🗑</button>
        </div>`;
      el.querySelector('.minus').addEventListener('click', () => {
        if (state.cart[id] > 1) state.cart[id]--; else delete state.cart[id];
        saveCart(); renderCart(); renderBadge();
      });
      el.querySelector('.plus').addEventListener('click', () => {
        state.cart[id] = (state.cart[id] || 0) + 1; saveCart(); renderCart(); renderBadge();
      });
      el.querySelector('.remove').addEventListener('click', () => {
        delete state.cart[id]; saveCart(); renderCart(); renderBadge();
      });
      cartItemsEl.appendChild(el);
    });
  }
  const totals = cartTotals();
  cartBadge.textContent = totals.count;
  cartSubtotalEl.textContent = fmt(totals.total);
  cartCountEl.textContent = totals.count;
}

function addToCart(id, qty = 1) {
  state.cart[id] = (state.cart[id] || 0) + qty;
  saveCart();
  renderCart();
  renderBadge();
}

function renderBadge() {
  const totals = cartTotals();
  cartBadge.textContent = totals.count;
}

function openCart() { cartDrawer.classList.add('open'); }
function closeCart() { cartDrawer.classList.remove('open'); }

document.getElementById('closeCart').addEventListener('click', closeCart);
document.getElementById('continueShopping').addEventListener('click', () => { closeCart(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
document.getElementById('proceedCheckout').addEventListener('click', () => { closeCart(); showCheckout(); });

/* ----------------------------
   MODAL VIEW
---------------------------- */
const overlay = document.getElementById('overlay');
const modalTitle = document.getElementById('modalTitle');
const modalDesc = document.getElementById('modalDesc');
const modalPrice = document.getElementById('modalPrice');
const modalCategory = document.getElementById('modalCategory');
const modalQty = document.getElementById('modalQty');
let modalQtyVal = 1;
let currentModalProduct = null;

function openModal(product) {
  currentModalProduct = product;
  modalTitle.textContent = product.title;
  modalDesc.textContent = product.desc;
  modalPrice.textContent = fmt(product.price);
  modalCategory.textContent = product.category;
  modalQtyVal = 1;
  modalQty.textContent = modalQtyVal;
  overlay.style.display = 'flex';
}

function closeModal() { overlay.style.display = 'none'; }

document.getElementById('closeModal').addEventListener('click', closeModal);
document.getElementById('modalPlus').addEventListener('click', () => { modalQtyVal++; modalQty.textContent = modalQtyVal; });
document.getElementById('modalMinus').addEventListener('click', () => { if (modalQtyVal > 1) modalQtyVal--; modalQty.textContent = modalQtyVal; });
document.getElementById('modalAdd').addEventListener('click', () => {
  if (currentModalProduct) { addToCart(currentModalProduct.id, modalQtyVal); closeModal(); openCart(); }
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
  const el = document.getElementById('checkoutItems'); el.innerHTML = '';
  const ids = Object.keys(state.cart);
  if (ids.length === 0) {
    el.innerHTML = '<div>Your cart is empty.</div>';
  } else {
    ids.forEach(id => {
      const p = PRODUCTS.find(x => x.id === id);
      const qty = state.cart[id];
      const row = document.createElement('div');
      row.innerHTML = `<div><strong>${p.title}</strong> (x${qty})</div><div>${fmt(p.price)}</div>`;
      el.appendChild(row);
    });
  }
  const totals = cartTotals();
  document.getElementById('orderTotal').textContent = fmt(totals.total);
  document.getElementById('orderTotal2').textContent = fmt(totals.total);
}

document.getElementById('continueToPayment').addEventListener('click', () => {
  const name = document.getElementById('fullname').value.trim();
  const email = document.getElementById('email').value.trim();
  const addr1 = document.getElementById('addr1').value.trim();
  if (!name || !email || !addr1) { alert('Please fill required delivery fields.'); return; }

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
  state.cart = {}; saveCart(); renderCart(); renderBadge();
  backToShop();
});

/* ----------------------------
   EDIT MODAL (ADMIN MOCK)
---------------------------- */
const editModal = document.getElementById('editModal');
document.getElementById('addProductBtn').addEventListener('click', () => openEditModal());

function openEditModal(p = null) {
  editModal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  if (p) {
    document.getElementById('editName').value = p.title;
    document.getElementById('editPrice').value = p.price;
  } else {
    document.getElementById('editName').value = '';
    document.getElementById('editPrice').value = '';
  }
}

function closeEditModal() {
  editModal.style.display = 'none';
  document.body.style.overflow = 'auto';
}

document.getElementById('closeEditModal').addEventListener('click', closeEditModal);
document.getElementById('cancelEdit').addEventListener('click', closeEditModal);
document.getElementById('saveProduct').addEventListener('click', () => {
  const name = document.getElementById('editName').value.trim();
  const price = document.getElementById('editPrice').value.trim();
  if (!name || !price) { alert('Please fill required fields.'); return; }
  alert('✅ Product saved (mock only)');
  closeEditModal();
});

/* ----------------------------
   INIT
---------------------------- */
renderCategoryList();
renderSortList();
filterAndRender();
renderCart();
renderBadge();

document.addEventListener('keydown', (e) => { if (e.key === 'c') openCart(); });