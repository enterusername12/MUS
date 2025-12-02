


const API_BASE = (() => {
  const explicit = window.__MU_MERCH_API_BASE__
    || document?.querySelector?.('meta[name="merch-api-base"]')?.content;
  if (typeof explicit === 'string' && explicit.trim()) {
    return explicit.trim().replace(/\/$/, '');
  }

  const backendOrigin = window.__MU_BACKEND_ORIGIN__ || 'http://10.51.33.36:3000';
  try {
    const backendURL = new URL(backendOrigin);
    const pageOrigin = window.location?.origin;
    if (pageOrigin && pageOrigin !== 'null') {
      const currentOrigin = new URL(pageOrigin);
      if (currentOrigin.origin === backendURL.origin) {
        return '/api/merch';
      }
    }
    return `${backendURL.origin.replace(/\/$/, '')}/api/merch`;
  } catch (error) {
    console.warn('Unable to parse backend origin, defaulting to 10.51.33.36:3000', error);
    return 'http://10.51.33.36:3000/api/merch';
  }
})();

function loadStoredCart() {
  try {
    const raw = localStorage.getItem('mu_cart');
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }
    return Object.keys(parsed).reduce((acc, key) => {
      const quantity = Number(parsed[key]);
      if (Number.isInteger(quantity) && quantity > 0) {
        acc[key] = quantity;
      }
      return acc;
    }, {});
  } catch (error) {
    console.warn('Unable to parse stored cart. Resetting.', error);
    return {};
  }
}

const state = {
  query: '',
  category: 'All Categories',
  sort: 'name-asc',
  visibleProducts: [],
  catalog: new Map(),
  cart: loadStoredCart(), // {id: qty}
  isLoading: false,
  error: null
};

/* ---------- Utilities ---------- */
function fmt(v){ return '$' + Number(v || 0).toFixed(2); }

function getProductKey(id){
  return String(id);
}

function normalizeProduct(raw){
  if(!raw){
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
    stock_qty: Number.isFinite(stock) && stock >= 0 ? Math.floor(stock) : 0,
    is_active: raw.is_active ?? raw.isActive ?? true,
    image_url: raw.image_url || raw.imageUrl || raw.image || null,
    sku: raw.sku || raw.id
  };
}

function getProductById(id){
  return state.catalog.get(getProductKey(id));
}

function saveCart(){ localStorage.setItem('mu_cart', JSON.stringify(state.cart)); }

function buildAuthHeaders({ json = false } = {}){
  const headers = {};
  if(json){
    headers['Content-Type'] = 'application/json';
  }
  try {
    const token = localStorage.getItem('musAuthToken');
    if(token){
      headers.Authorization = `Bearer ${token}`;
    }
  } catch (error) {
    console.warn('Unable to access auth token.', error);
  }
  return headers;
}

const SORT_PARAM_MAP = {
  'name-asc': 'name_asc',
  'name-desc': 'name_desc',
  'price-asc': 'price_asc',
  'price-desc': 'price_desc'
};

let filterTimer = null;
const FILTER_DEBOUNCE_MS = 250;

async function loadProducts(){
  state.error = null;
  state.isLoading = true;
  renderProducts();

  const params = new URLSearchParams();
  if(state.query){
    params.set('search', state.query);
  }
  if(state.category && state.category !== 'All Categories'){
    params.set('category', state.category);
  }
  if(state.sort){
    params.set('sort', SORT_PARAM_MAP[state.sort] || 'name_asc');
  }

  const query = params.toString();
  const url = `${API_BASE}/products${query ? `?${query}` : ''}`;

  try {
    const response = await fetch(url, { headers: buildAuthHeaders() });
    const payload = await response.json().catch(() => ({}));
    if(!response.ok){
      const message = payload?.message || 'Unable to load merchandise right now.';
      throw new Error(message);
    }

    const products = Array.isArray(payload.products) ? payload.products.map(normalizeProduct).filter(Boolean) : [];

    products.forEach((product) => {
      if(product){
        state.catalog.set(getProductKey(product.id), product);
      }
    });

    state.visibleProducts = products;
    renderCategoryList();
  } catch (error) {
    console.error('Failed to load products:', error);
    state.error = error.message || 'Something went wrong while loading products.';
    state.visibleProducts = [];
  } finally {
    state.isLoading = false;
    renderProducts();
    renderCart();
    renderBadge();
  }
}

/* ---------- Render Controls / Lists ---------- */
const productsEl = document.getElementById('products');
const countEl = document.getElementById('count');
const resultsText = document.getElementById('resultsText');
const searchInput = document.getElementById('searchInput');
const categoryLabel = document.getElementById('categoryLabel');
const categoryList = document.getElementById('categoryList');
const sortLabel = document.getElementById('sortLabel');
const sortList = document.getElementById('sortList');

function getAvailableCategories(){
  const unique = new Set(['All Categories']);
  state.catalog.forEach((product) => {
    const category = product?.category;
    if(typeof category === 'string' && category.trim()){
      unique.add(category.trim());
    }
  });
  return Array.from(unique);
}

function renderCategoryList(){
    const categories = getAvailableCategories();
  if(!categories.includes(state.category)){
    state.category = 'All Categories';
  }
  categoryLabel.textContent = state.category;
  categoryList.innerHTML = '';
  categories.forEach(cat=>{
    const d = document.createElement('div');
    d.textContent = cat;
    d.style.padding = '8px';
    d.style.cursor = 'pointer';
    if(cat === state.category){
      d.style.fontWeight = '600';
      d.style.color = 'var(--accent)';
    }
    d.addEventListener('click', ()=>{
      state.category = cat;
      categoryLabel.textContent = cat;
      categoryList.style.display = 'none';
      filterAndRender();
    });
    categoryList.appendChild(d);
  });
}
function renderSortList(){
  const opts = [
    {k:'name-asc', t:'Name (A-Z)'},
    {k:'price-asc', t:'Price: Low to High'},
    {k:'price-desc', t:'Price: High to Low'}
  ];
  sortList.innerHTML='';
  opts.forEach(o=>{
    const d=document.createElement('div');
    d.textContent=o.t; d.style.padding='8px'; d.style.cursor='pointer';
    d.addEventListener('click', ()=>{
      state.sort=o.k; sortLabel.textContent=o.t; sortList.style.display='none'; filterAndRender();
    });
    sortList.appendChild(d);
  });
}

function filterAndRender(){
  state.isLoading = true;
  state.error = null;
  renderProducts();
  if(filterTimer){
    clearTimeout(filterTimer);
  }
  filterTimer = setTimeout(()=>{
    loadProducts();
  }, FILTER_DEBOUNCE_MS);
}

/* ---------- Render products ---------- */
function renderProducts(){
  productsEl.innerHTML = '';
  if(state.isLoading){
    countEl.textContent = '0';
    const loading = document.createElement('div');
    loading.style.padding = '40px';
    loading.style.textAlign = 'center';
    loading.style.color = 'var(--subtext)';
    loading.textContent = 'Loading products...';
    productsEl.appendChild(loading);
    return;
  }

  if(state.error){
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

  const list = state.visibleProducts || [];
  countEl.textContent = list.length;

  if(list.length === 0){
    const empty = document.createElement('div');
    empty.style.padding = '40px';
    empty.style.textAlign = 'center';
    empty.style.color = 'var(--subtext)';
    empty.textContent = 'No merchandise matches your filters just yet. Try a different search or category.';
    productsEl.appendChild(empty);
    return;
  }

  list.forEach((product)=>{
    const card = document.createElement('div'); card.className='card';
        const media = document.createElement('div'); media.className='media'; media.textContent = product.image_url ? '' : 'Image';
    if(product.image_url){
      const img = document.createElement('img');
      img.src = product.image_url;
      img.alt = product.name;
      img.style.maxHeight = '120px';
      img.style.objectFit = 'cover';
      media.innerHTML = '';
      media.appendChild(img);
    }
    
    const title = document.createElement('div');
    const name = product.name || product.title || 'Product';
    const description = product.description || product.desc || 'No description provided yet.';
    title.innerHTML = `<strong style="font-size:18px">${name}</strong><div style="color:var(--subtext)">${description}</div>`;
    const left = document.createElement('div'); left.className='left';
    left.appendChild(media); left.appendChild(title);

    const bottom = document.createElement('div');
    bottom.style.display='flex'; bottom.style.alignItems='center'; bottom.style.justifyContent='space-between'; bottom.style.marginTop='10px';

    const leftLower = document.createElement('div'); leftLower.style.display='flex'; leftLower.style.alignItems='center'; leftLower.style.gap='12px';
    const pill = document.createElement('div'); pill.className='pill'; pill.textContent = product.category || 'Merch';
    const price = document.createElement('div'); price.className='price'; price.textContent = fmt(product.price);
    leftLower.appendChild(pill); leftLower.appendChild(price);

    const controls = document.createElement('div'); controls.style.display='flex'; controls.style.gap='12px'; controls.style.alignItems='center';
    const viewBtn = document.createElement('button'); viewBtn.className='view-btn'; viewBtn.textContent='View Details';
    const addBtn = document.createElement('button'); addBtn.className='add-btn'; addBtn.textContent='Add to Cart';

    const inStock = Number(product.stock_qty ?? product.stockQty ?? 0) > 0;
    addBtn.textContent = inStock ? 'Add to Cart' : 'Sold Out';
    addBtn.disabled = !inStock;
    if(!inStock){
      addBtn.style.opacity = '0.7';
      addBtn.style.cursor = 'not-allowed';
    }

    viewBtn.addEventListener('click', ()=>openModal(product));
    addBtn.addEventListener('click', ()=>{
      if(!inStock){
        return;
      }
      addToCart(product.id,1);
      openCart();
    });

    controls.appendChild(viewBtn); controls.appendChild(addBtn);

    bottom.appendChild(leftLower); bottom.appendChild(controls);

    card.appendChild(left); card.appendChild(bottom);
    productsEl.appendChild(card);
  });
}

/* ---------- Cart logic ---------- */
const cartDrawer = document.getElementById('cartDrawer');
const cartItemsEl = document.getElementById('cartItems');
const cartBadge = document.getElementById('cartBadge');
const cartSubtotalEl = document.getElementById('cartSubtotal');
const cartCountEl = document.getElementById('cartCount');

function cartTotals(){
  let count=0, total=0;
  for(const [id, value] of Object.entries(state.cart)){
    const qty = Number(value);
    if(!Number.isInteger(qty) || qty <= 0){
      continue;
    }
    const prod = getProductById(id);
    if(!prod){
      continue;
    }
    count += qty;
    total += Number(prod.price) * qty;
  }
  return {count,total:Number(total.toFixed(2))};
}

function renderCart(){
  cartItemsEl.innerHTML = '';
  const ids = Object.keys(state.cart);
  const invalidIds = [];

  if(ids.length===0){
    cartItemsEl.innerHTML = '<div style="color:var(--subtext)">Your cart is empty.</div>';
  } else if(state.catalog.size === 0){
    cartItemsEl.innerHTML = '<div style="color:var(--subtext)">Loading your cart items...</div>';
  } else {
    ids.forEach(id=>{
      const qtyValue = Number(state.cart[id]);
      if(!Number.isInteger(qtyValue) || qtyValue <= 0){
        invalidIds.push(id);
        return;
      }
      const product = getProductById(id);
      if(!product){
        invalidIds.push(id);
        return;
      }

      const el = document.createElement('div'); el.className='cart-item';
      const thumb = document.createElement('div'); thumb.className='thumb'; thumb.textContent='Img';
      if(product.image_url){
        const img = document.createElement('img');
        img.src = product.image_url;
        img.alt = product.name;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        thumb.textContent = '';
        thumb.appendChild(img);
      }
      const info = document.createElement('div'); info.style.flex='1';
      info.innerHTML = `<strong>${product.name}</strong><div style="color:var(--subtext)">${product.category || 'Merch'}</div><div style="font-weight:700;color:var(--accent)">${fmt(product.price)}</div>`;
      const ctrl = document.createElement('div'); ctrl.style.display='flex'; ctrl.style.flexDirection='column'; ctrl.style.gap='6px'; ctrl.style.alignItems='flex-end';
      const qtyWrap = document.createElement('div'); qtyWrap.style.display='flex'; qtyWrap.style.gap='6px'; qtyWrap.style.alignItems='center';
      const minus = document.createElement('button'); minus.textContent='−'; minus.style.width='32px'; minus.style.height='32px';
      const qtyEl = document.createElement('div'); qtyEl.textContent=qtyValue; qtyEl.style.minWidth='22px'; qtyEl.style.textAlign='center';
      const plus = document.createElement('button'); plus.textContent='+'; plus.style.width='32px'; plus.style.height='32px';
      const remove = document.createElement('button'); remove.textContent='🗑'; remove.style.border='0'; remove.style.background='transparent';
      
      minus.addEventListener('click', ()=> {
        const current = Number(state.cart[id] || 0);
        if(current > 1){
          state.cart[id] = current - 1;
        } else {
          delete state.cart[id];
        }
        saveCart(); renderCart(); renderBadge();
      });

      plus.addEventListener('click', ()=> {
        const current = Number(state.cart[id] || 0);
        const stock = Number(product.stock_qty ?? product.stockQty ?? Infinity);
        const next = current + 1;
        if(Number.isFinite(stock) && next > stock){
          alert(`Only ${stock} left in stock for ${product.name}.`);
          return;
        }
        state.cart[id] = next;
        saveCart(); renderCart(); renderBadge();
      });

      remove.addEventListener('click', ()=> {
        delete state.cart[id]; saveCart(); renderCart(); renderBadge();
      });
      qtyWrap.appendChild(minus); qtyWrap.appendChild(qtyEl); qtyWrap.appendChild(plus);
      ctrl.appendChild(qtyWrap); ctrl.appendChild(remove);
      el.appendChild(thumb); el.appendChild(info); el.appendChild(ctrl);
      cartItemsEl.appendChild(el);
    });
  }

  if(invalidIds.length && state.catalog.size){
    invalidIds.forEach((id) => delete state.cart[id]);
    saveCart();
  }

  const totals = cartTotals();
  cartBadge.textContent = totals.count;
  cartSubtotalEl.textContent = fmt(totals.total);
  cartCountEl.textContent = totals.count;
}

/* ---------- Add to cart ---------- */
function addToCart(id, qty=1){
  const product = getProductById(id);
  if(!product){
    alert('This product is no longer available.');
    return;
  }
  const quantityToAdd = Number(qty) || 1;
  const current = Number(state.cart[getProductKey(id)] || 0);
  const stock = Number(product.stock_qty ?? product.stockQty ?? Infinity);
  const next = current + quantityToAdd;
  if(Number.isFinite(stock) && next > stock){
    alert(`Only ${stock} left in stock for ${product.name}.`);
    return;
  }
  state.cart[getProductKey(id)] = next;
  saveCart();
  renderCart();
  renderBadge();
}

/* ---------- Badge ---------- */
function renderBadge(){
  const totals = cartTotals();
  cartBadge.textContent = totals.count;
}

/* ---------- Drawer open/close ---------- */
function openCart(){ cartDrawer.classList.add('open'); cartDrawer.setAttribute('aria-hidden','false'); }
function closeCart(){ cartDrawer.classList.remove('open'); cartDrawer.setAttribute('aria-hidden','true'); }

document.getElementById('closeCart').addEventListener('click', closeCart);
document.getElementById('continueShopping').addEventListener('click', ()=>{ closeCart(); window.scrollTo({top:0,behavior:'smooth'})});
document.getElementById('proceedCheckout').addEventListener('click', ()=>{ closeCart(); showCheckout(); });

/* ---------- Modal ---------- */
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
let modalQtyVal = 1;
let currentModalProduct = null;

function openModal(product){
  currentModalProduct = product;
  const name = product.name || product.title || 'Product';
  const description = product.description || product.desc || 'No description available yet.';
  modalTitle.textContent = name;
  modalDesc.textContent = description;
  modalPrice.textContent = fmt(product.price);
  modalCategory.textContent = product.category || 'Merch';
  modalQtyVal = 1;
  modalQty.textContent = modalQtyVal;
  const stock = Number(product.stock_qty ?? product.stockQty ?? 0);
  if(stock <= 0){
    modalAddBtn.disabled = true;
    modalAddBtn.textContent = 'Out of Stock';
  } else {
    modalAddBtn.disabled = false;
    modalAddBtn.textContent = 'Add to Cart';
  }
  overlay.style.display = 'flex'; overlay.setAttribute('aria-hidden','false');
}
function closeModal(){ overlay.style.display='none'; overlay.setAttribute('aria-hidden','true'); }

document.getElementById('closeModal').addEventListener('click', closeModal);
modalPlusBtn.addEventListener('click', ()=>{
  if(!currentModalProduct){ return; }
  const stock = Number(currentModalProduct.stock_qty ?? currentModalProduct.stockQty ?? Infinity);
  if(Number.isFinite(stock) && modalQtyVal >= stock){
    alert(`Only ${stock} left in stock for ${currentModalProduct.name || currentModalProduct.title}.`);
    return;
  }
  modalQtyVal++;
  modalQty.textContent = modalQtyVal;
});
modalMinusBtn.addEventListener('click', ()=>{
  if(modalQtyVal>1){ modalQtyVal--; modalQty.textContent = modalQtyVal; }
});
modalAddBtn.addEventListener('click', ()=>{
  if(currentModalProduct && modalQtyVal > 0){ addToCart(currentModalProduct.id, modalQtyVal); closeModal(); openCart();}
});
modalViewBtn.addEventListener('click', ()=>{
  // For this mock we simply close modal and scroll to product (no separate page)
  closeModal();
});

/* ---------- Event bindings ---------- */
searchInput.addEventListener('input', (e)=>{ state.query = e.target.value; filterAndRender(); });

document.getElementById('categorySelect').addEventListener('click', (e)=>{
  const list = document.getElementById('categoryList');
  list.style.display = (list.style.display==='none' || list.style.display==='') ? 'block' : 'none';
});
document.getElementById('sortSelect').addEventListener('click', (e)=>{
  const list = document.getElementById('sortList');
  list.style.display = (list.style.display==='none' || list.style.display==='') ? 'block' : 'none';
});

/* Close dropdowns if clicked outside */
document.addEventListener('click', (e)=>{
  if(!document.getElementById('categorySelect').contains(e.target)) categoryList.style.display='none';
  if(!document.getElementById('sortSelect').contains(e.target)) sortList.style.display='none';
});

/* ---------- Checkout flow ---------- */
const checkoutAreaEl = document.getElementById('checkoutArea');
const paymentArea = document.getElementById('paymentArea');
const paymentGrid = paymentArea ? paymentArea.querySelector('.grid') : null;
const checkoutMessageEl = document.createElement('div');
checkoutMessageEl.style.display = 'none';
checkoutMessageEl.style.marginBottom = '16px';
checkoutMessageEl.style.padding = '12px 16px';
checkoutMessageEl.style.borderRadius = '12px';
checkoutMessageEl.setAttribute('role', 'alert');
checkoutMessageEl.style.fontWeight = '500';
if(paymentArea){
  paymentArea.insertBefore(checkoutMessageEl, paymentArea.firstChild);
}

const confirmationWrapper = document.createElement('div');
confirmationWrapper.style.display = 'none';
confirmationWrapper.style.marginTop = '18px';
const confirmationCard = document.createElement('div');
confirmationCard.className = 'checkout-card';
confirmationWrapper.appendChild(confirmationCard);
if(paymentArea){
  paymentArea.appendChild(confirmationWrapper);
}

const completeOrderBtn = document.getElementById('completeOrder');

function setCheckoutMessage(type, message){
  if(!checkoutMessageEl){
    return;
  }
  if(!message){
    checkoutMessageEl.style.display = 'none';
    checkoutMessageEl.textContent = '';
    return;
  }
  checkoutMessageEl.style.display = 'block';
  checkoutMessageEl.textContent = message;
  if(type === 'error'){
    checkoutMessageEl.style.background = '#fce8e6';
    checkoutMessageEl.style.color = '#b3261e';
  } else {
    checkoutMessageEl.style.background = '#e6f4ea';
    checkoutMessageEl.style.color = '#0f5132';
  }
}

function formatPickupReady(dateString){
  if(!dateString){
    return 'Collect on campus once you receive the ready notification.';
  }
  const date = new Date(dateString);
  if(Number.isNaN(date.getTime())){
    return 'Collect on campus once you receive the ready notification.';
  }
  const formatted = date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  return `Collect on ${formatted} at campus.`;
}

function showOrderConfirmation(order){
  if(paymentGrid){
    paymentGrid.style.display = 'none';
  }
  setCheckoutMessage('', '');
  const pickupMessage = formatPickupReady(order?.pickup_ready_at);
  const items = Array.isArray(order?.items) ? order.items : [];
  const itemsHtml = items.length ?
    `<ul style="padding-left:20px;margin:12px 0 0">
      ${items.map((item)=>{
        const product = getProductById(item.product_id || item.productId);
        const name = product?.name || product?.title || `Product #${item.product_id || item.productId}`;
        const lineTotal = fmt(Number(item.unit_price || product?.price || 0) * Number(item.quantity || 0));
        return `<li style="margin-bottom:6px">${item.quantity} × ${name}<span style="float:right">${lineTotal}</span></li>`;
      }).join('')}
    </ul>`
    : '<p style="color:var(--subtext)">Your order items will appear here once loaded.</p>';

  const orderTotal = fmt(order?.total ?? 0);
  confirmationCard.innerHTML = `
    <h2>Order confirmed!</h2>
    <p style="color:var(--subtext)">Order #${order?.id ?? ''} has been placed successfully.</p>
    <div style="margin-top:16px;padding:16px;background:#f1f5f9;border-radius:12px">${pickupMessage}</div>
    <div style="margin-top:16px"><strong>Total:</strong> ${orderTotal}</div>
    <div style="margin-top:16px">
      <h3 style="margin:0 0 8px 0">Items</h3>
      ${itemsHtml}
    </div>
    <button class="btn-primary" id="returnToShopBtn" style="margin-top:18px">Back to shop</button>
  `;

  confirmationWrapper.style.display = 'block';
  const returnBtn = confirmationCard.querySelector('#returnToShopBtn');
  if(returnBtn){
    returnBtn.addEventListener('click', ()=>{
      confirmationWrapper.style.display = 'none';
      if(paymentGrid){
        paymentGrid.style.display = '';
      }
      backToShop();
    });
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showCheckout(){
  const totals = cartTotals();
  if(totals.count === 0){
    alert('Your cart is empty. Add some merchandise before checking out.');
    return;
  }
  setCheckoutMessage('', '');
  confirmationWrapper.style.display = 'none';
  if(paymentGrid){
    paymentGrid.style.display = '';
  }
  document.getElementById('checkoutArea').style.display='block';
  document.getElementById('products').style.display='none';
  document.getElementById('controls').style.display='none';
  // render checkout items + order summary
  renderCheckoutItems();
}
function backToShop(){
  if(checkoutAreaEl){
    checkoutAreaEl.style.display='none';
  }
  if(paymentArea){
    paymentArea.style.display='none';
  }
  document.getElementById('products').style.display='';
  document.getElementById('controls').style.display='';
  overlay.style.display='none'; // hide modal if still open
  confirmationWrapper.style.display = 'none';
  if(paymentGrid){
    paymentGrid.style.display = '';
  }
  setCheckoutMessage('', '');
  window.scrollTo({top:0,behavior:'smooth'});
}


function renderCheckoutItems(){
  const el = document.getElementById('checkoutItems'); el.innerHTML='';
  const ids = Object.keys(state.cart);
  const invalidIds = [];
  if(ids.length===0){
    el.innerHTML = '<div style="color:var(--subtext)">Your cart is empty.</div>';
    const totals = cartTotals();
    document.getElementById('orderSummary').innerHTML = `Items (${totals.count})<span style="float:right">${fmt(totals.total)}</span><hr style="border:none;border-top:1px solid #f0f0f0;margin:10px 0">Delivery: <span style="float:right;color:var(--success)">FREE</span>`;
    document.getElementById('orderTotal').textContent = fmt(totals.total);
    document.getElementById('orderSummary2').innerHTML = document.getElementById('orderSummary').innerHTML;
    document.getElementById('orderTotal2').textContent = document.getElementById('orderTotal').textContent;
    return;
  } else if(state.catalog.size === 0){
    el.innerHTML = '<div style="color:var(--subtext)">Loading your items...</div>';
  } else {
    ids.forEach(id=>{
      const qty = Number(state.cart[id]);
      if(!Number.isInteger(qty) || qty <= 0){
        invalidIds.push(id);
        return;
      }
      const product = getProductById(id);
      if(!product){
        invalidIds.push(id);
        return;
      }
      const row = document.createElement('div'); row.style.display='flex'; row.style.justifyContent='space-between'; row.style.alignItems='center';
      const lineTotal = fmt(Number(product.price) * qty);
      row.innerHTML = `<div style="display:flex;gap:12px;align-items:center"><div style="width:84px;height:84px;background:#eee;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#9aa0a6">Img</div>
        <div><strong>${product.name}</strong><div style="color:var(--subtext)">${product.category || 'Merch'}</div><div style="color:var(--subtext)">Qty: ${qty}</div></div></div>
        <div style="font-weight:700;color:var(--accent)">${lineTotal}</div>`;
      el.appendChild(row);
    });
  }
  if(invalidIds.length && state.catalog.size){
    invalidIds.forEach((id)=> delete state.cart[id]);
    saveCart();
  }
  const totals = cartTotals();
  document.getElementById('orderSummary').innerHTML = `Items (${totals.count})<span style="float:right">${fmt(totals.total)}</span><hr style="border:none;border-top:1px solid #f0f0f0;margin:10px 0">Delivery: <span style="float:right;color:var(--success)">FREE</span>`;
  document.getElementById('orderTotal').textContent = fmt(totals.total);
  document.getElementById('orderSummary2').innerHTML = document.getElementById('orderSummary').innerHTML;
  document.getElementById('orderTotal2').textContent = document.getElementById('orderTotal').textContent;
}

/* Step navigation */
document.getElementById('continueToPayment').addEventListener('click', ()=>{
  // simple validation
  const totals = cartTotals();
  if(totals.count === 0){
    alert('Your cart is empty. Add some merchandise before checking out.');
    return;
  }
  const name = document.getElementById('fullname').value.trim();
  const email = document.getElementById('email').value.trim();
  const addr1 = document.getElementById('addr1').value.trim();
  if(!name || !email || !addr1){
    alert('Please fill required delivery fields.');
    return;
  }

  // ✅ Hide delivery details, show payment section
  if(checkoutAreaEl){
    checkoutAreaEl.style.display = 'none';
  }
  if(paymentArea){
    paymentArea.style.display = 'block';
  }
  setCheckoutMessage('', '');
  confirmationWrapper.style.display = 'none';
  if(paymentGrid){
    paymentGrid.style.display = '';
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

document.getElementById('backToCart').addEventListener('click', ()=> backToShop());

document.getElementById('backToDelivery').addEventListener('click', ()=>{
  // ✅ Hide payment, show delivery again
  if(paymentArea){
    paymentArea.style.display = 'none';
  }
  if(checkoutAreaEl){
    checkoutAreaEl.style.display = 'block';
  }
  confirmationWrapper.style.display = 'none';
  if(paymentGrid){
    paymentGrid.style.display = '';
  }
  setCheckoutMessage('', '');
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

/* Complete order with backend API */
if(completeOrderBtn){
  completeOrderBtn.addEventListener('click', async ()=>{
    setCheckoutMessage('', '');
    const totals = cartTotals();
    if(totals.count === 0){
      setCheckoutMessage('error', 'Your cart is empty.');
      return;
    }

    const card = document.getElementById('cardNumber').value.trim();
    const expiry = document.getElementById('expiry').value.trim();
    const cvv = document.getElementById('cvv').value.trim();
    if(!card || !expiry || !cvv){
      setCheckoutMessage('error', 'Please fill in the mock card details to continue.');
      return;
    }

    const name = document.getElementById('fullname').value.trim();
    const email = document.getElementById('email').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const addr1 = document.getElementById('addr1').value.trim();
    const addr2 = document.getElementById('addr2').value.trim();
    if(!name || !email){
      setCheckoutMessage('error', 'Please provide your name and email before placing the order.');
      return;
    }

    const items = [];
    for(const [id, value] of Object.entries(state.cart)){
      const qty = Number(value);
      if(!Number.isInteger(qty) || qty <= 0){
        continue;
      }
      const product = getProductById(id);
      if(!product){
        continue;
      }
      items.push({ productId: Number(product.id), quantity: qty });
    }

    if(items.length === 0){
      setCheckoutMessage('error', 'Your cart items are no longer available. Please refresh and try again.');
      return;
    }

    const notesParts = [];
    if(addr1){ notesParts.push(addr1); }
    if(addr2){ notesParts.push(addr2); }
    const notes = notesParts.length ? `Address: ${notesParts.join(', ')}` : undefined;

    const payload = {
      purchaserName: name,
      purchaserEmail: email,
      purchaserPhone: phone || undefined,
      pickupOption: 'campus_pickup',
      notes,
      items
    };

    const originalText = completeOrderBtn.textContent;
    completeOrderBtn.disabled = true;
    completeOrderBtn.textContent = 'Placing order...';

    try {
      const response = await fetch(`${API_BASE}/orders`, {
        method: 'POST',
        headers: buildAuthHeaders({ json: true }),
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(()=>({}));
      if(!response.ok){
        const message = result?.message || 'Unable to place your order right now.';
        throw new Error(message);
      }

      const order = result?.order || {};
      state.cart = {};
      saveCart();
      renderCart();
      renderBadge();
      renderCheckoutItems();
      showOrderConfirmation(order);
    } catch (error) {
      console.error('Failed to submit order:', error);
      setCheckoutMessage('error', error.message || 'Unable to place your order right now.');
    } finally {
      completeOrderBtn.disabled = false;
      completeOrderBtn.textContent = originalText;
    }
  });
}

/* ---------- Init ---------- */
renderCategoryList();
renderSortList();
filterAndRender();
renderCart();
renderBadge();

/* Small accessibility: open cart when pressing 'c' key */
document.addEventListener('keydown', (e)=>{ if(e.key==='c') openCart(); });
