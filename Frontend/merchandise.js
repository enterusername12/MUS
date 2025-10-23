const PRODUCTS = [
  { id: "p1", title:"Campus Guide Book", category:"Books", price:12.99, desc:"Essential guide for new students with maps and resources."},
  { id: "p2", title:"University Hoodie", category:"Apparel", price:49.00, desc:"Warm pullover with Murdoch logo."},
  { id: "p3", title:"Event Ticket", category:"Tickets", price:25.00, desc:"Access to annual campus festival and activities."},
  { id: "p4", title:"Enamel Pin", category:"Accessories", price:6.50, desc:"Collectible enamel pin."},
  { id: "p5", title:"Stationery Set", category:"Stationery", price:9.75, desc:"Notebook + pen set."},
  { id: "p6", title:"Campus Tote Bag", category:"Accessories", price:15.00, desc:"Canvas tote with MU print."}
];

const categories = ["All Categories", ...Array.from(new Set(PRODUCTS.map(p=>p.category)))];

let state = {
  query: "",
  category: "All Categories",
  sort: "name-asc",
  products: PRODUCTS.slice(),
  cart: JSON.parse(localStorage.getItem('mu_cart')||'{}')  // {id: qty}
};

/* ---------- Utilities ---------- */
function fmt(v){ return '$' + Number(v).toFixed(2); }
function saveCart(){ localStorage.setItem('mu_cart', JSON.stringify(state.cart)); }

/* ---------- Render Controls / Lists ---------- */
const productsEl = document.getElementById('products');
const countEl = document.getElementById('count');
const resultsText = document.getElementById('resultsText');
const searchInput = document.getElementById('searchInput');
const categoryLabel = document.getElementById('categoryLabel');
const categoryList = document.getElementById('categoryList');
const sortLabel = document.getElementById('sortLabel');
const sortList = document.getElementById('sortList');

function renderCategoryList(){
  categoryList.innerHTML = '';
  categories.forEach(cat=>{
    const d = document.createElement('div');
    d.textContent = cat;
    d.style.padding = '8px';
    d.style.cursor = 'pointer';
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
  let list = PRODUCTS.filter(p=>{
    const matchesQuery = p.title.toLowerCase().includes(state.query.toLowerCase()) || p.desc.toLowerCase().includes(state.query.toLowerCase());
    const matchesCat = (state.category === "All Categories") || (p.category === state.category);
    return matchesQuery && matchesCat;
  });

  if(state.sort === 'name-asc'){
    list.sort((a,b)=>a.title.localeCompare(b.title));
  } else if(state.sort === 'price-asc'){
    list.sort((a,b)=>a.price - b.price);
  } else {
    list.sort((a,b)=>b.price - a.price);
  }

  state.products = list;
  renderProducts();
}

/* ---------- Render products ---------- */
function renderProducts(){
  productsEl.innerHTML = '';
  countEl.textContent = state.products.length;
  state.products.forEach(p=>{
    const card = document.createElement('div'); card.className='card';
    const media = document.createElement('div'); media.className='media'; media.textContent = 'Image';
    const title = document.createElement('div'); title.innerHTML = `<strong style="font-size:18px">${p.title}</strong><div style="color:var(--subtext)">${p.desc}</div>`;
    const row = document.createElement('div'); row.className='row';
    const left = document.createElement('div'); left.className='left';
    left.appendChild(media); left.appendChild(title);

    const bottom = document.createElement('div');
    bottom.style.display='flex'; bottom.style.alignItems='center'; bottom.style.justifyContent='space-between'; bottom.style.marginTop='10px';

    const leftLower = document.createElement('div'); leftLower.style.display='flex'; leftLower.style.alignItems='center'; leftLower.style.gap='12px';
    const pill = document.createElement('div'); pill.className='pill'; pill.textContent = p.category;
    const price = document.createElement('div'); price.className='price'; price.textContent = fmt(p.price);
    leftLower.appendChild(pill); leftLower.appendChild(price);

    const controls = document.createElement('div'); controls.style.display='flex'; controls.style.gap='12px'; controls.style.alignItems='center';
    const viewBtn = document.createElement('button'); viewBtn.className='view-btn'; viewBtn.textContent='View Details';
    const addBtn = document.createElement('button'); addBtn.className='add-btn'; addBtn.textContent='Put in Cart';

    viewBtn.addEventListener('click', ()=>openModal(p));
    addBtn.addEventListener('click', ()=>{
      addToCart(p.id,1);
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
  for(const id in state.cart){
    const qty = state.cart[id];
    count += qty;
    const prod = PRODUCTS.find(p=>p.id===id);
    if(prod) total += prod.price * qty;
  }
  return {count,total};
}

function renderCart(){
  cartItemsEl.innerHTML = '';
  const ids = Object.keys(state.cart);
  if(ids.length===0){
    cartItemsEl.innerHTML = '<div style="color:var(--subtext)">Your cart is empty.</div>';
  } else {
    ids.forEach(id=>{
      const qty = state.cart[id];
      const p = PRODUCTS.find(x=>x.id===id);
      const el = document.createElement('div'); el.className='cart-item';
      const thumb = document.createElement('div'); thumb.className='thumb'; thumb.textContent='Img';
      const info = document.createElement('div'); info.style.flex='1'; info.innerHTML = `<strong>${p.title}</strong><div style="color:var(--subtext)">${p.category}</div><div style="font-weight:700;color:var(--accent)">${fmt(p.price)}</div>`;
      const ctrl = document.createElement('div'); ctrl.style.display='flex'; ctrl.style.flexDirection='column'; ctrl.style.gap='6px'; ctrl.style.alignItems='flex-end';
      const qtyWrap = document.createElement('div'); qtyWrap.style.display='flex'; qtyWrap.style.gap='6px'; qtyWrap.style.alignItems='center';
      const minus = document.createElement('button'); minus.textContent='−'; minus.style.width='32px'; minus.style.height='32px';
      const qtyEl = document.createElement('div'); qtyEl.textContent=qty; qtyEl.style.minWidth='22px'; qtyEl.style.textAlign='center';
      const plus = document.createElement('button'); plus.textContent='+'; plus.style.width='32px'; plus.style.height='32px';
      const remove = document.createElement('button'); remove.textContent='🗑'; remove.style.border='0'; remove.style.background='transparent';
      minus.addEventListener('click', ()=> {
        if(state.cart[id] > 1) state.cart[id]--; else delete state.cart[id];
        saveCart(); renderCart(); renderBadge();
      });
      plus.addEventListener('click', ()=> {
        state.cart[id] = (state.cart[id]||0)+1; saveCart(); renderCart(); renderBadge();
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
  const totals = cartTotals();
  cartBadge.textContent = totals.count;
  cartSubtotalEl.textContent = fmt(totals.total);
  cartCountEl.textContent = totals.count;
}

/* ---------- Add to cart ---------- */
function addToCart(id, qty=1){
  state.cart[id] = (state.cart[id]||0) + qty;
  saveCart();
  renderCart();
  renderBadge();
}

/* ---------- Badge ---------- */
function renderBadge(){
  const totals = cartTotals();
  document.getElementById('cartBadge').textContent = totals.count;
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
let modalQtyVal = 1;
let currentModalProduct = null;

function openModal(product){
  currentModalProduct = product;
  modalTitle.textContent = product.title;
  modalDesc.textContent = product.desc;
  modalPrice.textContent = fmt(product.price);
  modalCategory.textContent = product.category;
  modalQtyVal = 1; modalQty.textContent = modalQtyVal;
  overlay.style.display = 'flex'; overlay.setAttribute('aria-hidden','false');
}
function closeModal(){ overlay.style.display='none'; overlay.setAttribute('aria-hidden','true'); }

document.getElementById('closeModal').addEventListener('click', closeModal);
document.getElementById('modalPlus').addEventListener('click', ()=>{ modalQtyVal++; modalQty.textContent = modalQtyVal; });
document.getElementById('modalMinus').addEventListener('click', ()=>{ if(modalQtyVal>1) modalQtyVal--; modalQty.textContent = modalQtyVal; });
document.getElementById('modalAdd').addEventListener('click', ()=>{
  if(currentModalProduct){ addToCart(currentModalProduct.id, modalQtyVal); closeModal(); openCart();}
});
document.getElementById('modalView').addEventListener('click', ()=>{
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
function showCheckout(){
  document.getElementById('checkoutArea').style.display='block';
  document.getElementById('products').style.display='none';
  document.getElementById('controls').style.display='none';
  // render checkout items + order summary
  renderCheckoutItems();
}
function backToShop(){
  document.getElementById('checkoutArea').style.display='none';
  document.getElementById('paymentArea').style.display='none';
  document.getElementById('products').style.display='';
  document.getElementById('controls').style.display='';
  overlay.style.display='none'; // hide modal if still open
  window.scrollTo({top:0,behavior:'smooth'});
}


function renderCheckoutItems(){
  const el = document.getElementById('checkoutItems'); el.innerHTML='';
  const ids = Object.keys(state.cart);
  if(ids.length===0){
    el.innerHTML = '<div style="color:var(--subtext)">Your cart is empty.</div>';
  } else {
    ids.forEach(id=>{
      const p = PRODUCTS.find(x=>x.id===id);
      const qty = state.cart[id];
      const row = document.createElement('div'); row.style.display='flex'; row.style.justifyContent='space-between'; row.style.alignItems='center';
      row.innerHTML = `<div style="display:flex;gap:12px;align-items:center"><div style="width:84px;height:84px;background:#eee;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#9aa0a6">Img</div>
        <div><strong>${p.title}</strong><div style="color:var(--subtext)">${p.category}</div><div style="color:var(--subtext)">Qty: ${qty}</div></div></div>
        <div style="font-weight:700;color:var(--accent)">${fmt(p.price)}</div>`;
      el.appendChild(row);
    });
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
  const name = document.getElementById('fullname').value.trim();
  const email = document.getElementById('email').value.trim();
  const addr1 = document.getElementById('addr1').value.trim();
  if(!name || !email || !addr1){ 
    alert('Please fill required delivery fields.'); 
    return; 
  }

  // ✅ Hide delivery details, show payment section
  document.getElementById('checkoutArea').style.display = 'none';
  document.getElementById('paymentArea').style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

document.getElementById('backToCart').addEventListener('click', ()=> backToShop());

document.getElementById('backToDelivery').addEventListener('click', ()=>{
  // ✅ Hide payment, show delivery again
  document.getElementById('paymentArea').style.display = 'none';
  document.getElementById('checkoutArea').style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

/* "Complete order" — front-end mock */
document.getElementById('completeOrder').addEventListener('click', ()=>{
  const card = document.getElementById('cardNumber').value.trim();
  const expiry = document.getElementById('expiry').value.trim();
  const cvv = document.getElementById('cvv').value.trim();
  if(!card || !expiry || !cvv){ alert('Please fill in card details (mock).'); return; }
  // mock success
  alert('Order placed — thank you! (this is a front-end mock)');
  state.cart = {}; saveCart(); renderCart(); renderBadge();
  // reset views
  document.getElementById('paymentArea').style.display='none';
  document.getElementById('checkoutArea').style.display='none';
  document.getElementById('products').style.display='';
  window.scrollTo({top:0,behavior:'smooth'});
});

/* Back button to cart (from any checkout area) */
document.getElementById('backToCart').addEventListener('click', ()=>{ document.getElementById('checkoutArea').style.display='none'; document.getElementById('products').style.display=''; });

/* ---------- Init ---------- */
renderCategoryList();
renderSortList();
filterAndRender();
renderCart();
renderBadge();

/* Small accessibility: open cart when pressing 'c' key */
document.addEventListener('keydown', (e)=>{ if(e.key==='c') openCart(); });

