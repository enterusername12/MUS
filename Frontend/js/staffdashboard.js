const API_BASE_URL = 'http://10.51.33.36:3000/api';
let cardId;
let cardcompetition;
async function fetchPolls() {
  try {
    const response = await fetch(`${API_BASE_URL}/dashboard`, { credentials: "include" });
    if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
    
    const data = await response.json(); // 拿整個 JSON
    return data.polls || [];             // 取 polls 陣列
  } catch (err) {
    console.error("Failed to fetch polls:", err);
    return [];
  }
}

async function fetchDashboardEvents() {
  try {
    const res = await fetch(`${API_BASE_URL}/dashboard`, { credentials: "include" });
    if (!res.ok) throw new Error(`Failed to fetch dashboard: ${res.status}`);
    const data = await res.json();
    return data.events || [];
  } catch (err) {
    console.error("Failed to fetch events:", err);
    return [];
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const eventContainer = document.getElementById("eventContainer");

  const events = await fetchDashboardEvents();
  renderEvents(events);

  attachCardActions(eventContainer, "event"); // attach edit/delete/QR actions


});

document.addEventListener("DOMContentLoaded", () => {
  const authUser = JSON.parse(localStorage.getItem("musAuthUser"));

  if (authUser) {
    const fullName = `${authUser.firstName} ${authUser.lastName}`;
    document.getElementById("staffName").textContent = fullName;
  }
});


// ==========================================
// FIXED: Event Fetching & Rendering
// ==========================================


// Fetch events from dashboard endpoint
// ✅ Fetch BOTH event types from dashboard
async function fetchAllEvents() {
  try {
    const res = await fetch(`${API_BASE_URL}/dashboard`, { 
      credentials: "include" 
    });
    
    if (!res.ok) {
      throw new Error(`Failed to fetch dashboard: ${res.status}`);
    }
    
    const data = await res.json();
 
    
    // Get both event types
    const customEvents = data.event || [];      // Your custom events table
    const campusEvents = data.events || [];     // Campus/community events

    
    // Merge and normalize both types
    return mergeAndNormalizeEvents(customEvents, campusEvents);
    
  } catch (err) {
    console.error("❌ Failed to fetch events:", err);
    return [];
  }
}

// ✅ Merge and normalize both event types into consistent format
function mergeAndNormalizeEvents(customEvents, campusEvents) {
  // Normalize custom events (from your events table)
  const normalizedCustom = customEvents.map(event => ({
    id: event.id,
    title: event.title || 'Untitled Event',
    type: event.category || event.type || 'custom',
    date: event.start_time || event.date,
    description: event.content || event.description || '',
    image_url: event.image_url || null,
    source: 'custom',  // Tag to identify source
    author: event.author || 'Event Organizer'
  }));
  
  // Normalize campus/community events
  const normalizedCampus = campusEvents.map(event => ({
    id: event.id,
    title: event.title || 'Untitled Event',
    type: event.category || 'campus',
    date: event.start_time || event.created_at,
    venue: event.location || 'TBD',
    description: event.content || event.description || '',
    image_url: event.image_url || null,
    source: 'campus',  // Tag to identify source
    author: event.author || 'Campus'
  }));
  
  // Merge both arrays
  const allEvents = [...normalizedCustom, ...normalizedCampus];
  
  // Sort by date (most recent first)
  allEvents.sort((a, b) => {
    const dateA = new Date(a.date || 0);
    const dateB = new Date(b.date || 0);
    return dateB - dateA;
  });
  

  return allEvents;
}

// ✅ Render all events to the DOM
function renderEvents(events) {
  const eventContainer = document.getElementById("eventContainer");
  
  if (!eventContainer) {
    console.error("❌ eventContainer element not found in DOM");
    return;
  }
  
  eventContainer.innerHTML = ""; // Clear existing content
  
  if (events.length === 0) {
    eventContainer.innerHTML = '<p style="color: #666; text-align: center; padding: 2rem;">No events found</p>';
    return;
  }
  

  
  events.forEach((event, index) => {

    
    const card = document.createElement("div");
    card.className = "card event-card";
    card.dataset.id = event.id;
    card.dataset.source = event.source; // Track if custom or campus
    
    // Format date safely
    let formattedDate = "Date TBD";
    if (event.date) {
      try {
        const date = new Date(event.date);
        formattedDate = date.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      } catch (e) {
        formattedDate = event.date;
      }
    }
    
    // Different badge colors for different sources
    const badgeClass = event.source === 'custom' ? 'badge-custom' : 'badge-campus';
    const sourceLabel = event.source === 'custom' ? 'Event' : 'Campus Post';
    
    card.innerHTML = `
      <div class="card-header">
        <span class="card-id">Event #${event.id}</span>
        <span class="badge ${badgeClass}">${sourceLabel}</span>
        <span class="card-date">${formattedDate}</span>
      </div>
      <h3>${event.title}</h3>
      
      ${event.author ? `<p><strong>Organizer:</strong> ${event.author}</p>` : ''}
      <p><strong>Type:</strong> ${event.type}</p>
      ${event.description ? `<p class="event-description">${event.description}</p>` : ''}
      
    `;
    
    eventContainer.appendChild(card);
  });
  

}




// ✅ Initialize on page load
document.addEventListener("DOMContentLoaded", async () => {

  
  const eventContainer = document.getElementById("eventContainer");
  
  if (!eventContainer) {
    console.error("❌ eventContainer not found in DOM!");
    return;
  }
  
  // Show loading state
  eventContainer.innerHTML = '<p style="text-align: center; padding: 2rem;">Loading all events...</p>';
  
  // Fetch and render ALL events (custom + campus)
  const allEvents = await fetchAllEvents();
  renderEvents(allEvents);
  
  // Attach card actions - only for custom events
  if (typeof attachCardActions === 'function') {
    attachCardActionsForMixedEvents(eventContainer);
  }

  // Attach card actions (edit/delete/QR)
  attachCardActions(eventContainer, "event");
});



async function renderPolls() {
  const pollContainer = document.getElementById("pollContainer");
  pollContainer.innerHTML = ""; // 清空 container

  const polls = await fetchPolls();

  polls.forEach(poll => {
    const card = document.createElement("div");
    card.className = "card poll-card";
    card.dataset.id = poll.id;
    // 這裡用你的 UI 佈局
    card.innerHTML = `
      <div class="card-header">
        <span>Poll #${poll.id}</span>
        <span class="status ${poll.status ?? "active"}">${poll.status ?? "active"}</span>
        <span class="ends">Ends: ${new Date(poll.deadline).toLocaleString()}</span>
      </div>
      <h3>${poll.title}</h3>
      
    `;

    pollContainer.appendChild(card);
  });
}
async function fetchDashboardData() {
  try {
    const res = await fetch("http://10.51.33.36:3000/api/dashboard", {
      credentials: "include",
      headers: {
        "Authorization": `Bearer ${localStorage.getItem("musAuthUser")}`
      }
    });

    if (!res.ok) throw new Error(`Failed to fetch dashboard: ${res.status}`);
    const data = await res.json();
    return data; // this should be { competitions: [...], polls: [...], events: [...] }
  } catch (err) {
    console.error(err);
    return { competitions: [], polls: [], events: [] };
  }
}

async function renderCompetitions() {
  const competitionContainer = document.getElementById("competitionContainer");
  competitionContainer.innerHTML = ""; // clear container

  const dashboardData = await fetchDashboardData();
  const competitions = dashboardData.competitions || [];

  competitions.forEach(comp => {
    const card = document.createElement("div");
    card.className = "card competition-card";
    card.dataset.reward = comp.reward?.points || 0;
    card.dataset.participationToken = comp.participation?.token || "";
    card.dataset.rewardToken = comp.reward?.token || "";
    card.dataset.compId = comp.id;

    card.innerHTML = `
      <div class="card-header">
        <span>Competition #${comp.id}</span>
        <span class="ends">Due: ${comp.due}</span>
      </div>
      <h3>${comp.title}</h3>
      <p>${comp.participation?.participants || 0} participants</p>
      <p class="reward">Reward: ${comp.reward?.points || 0}</p>
    `;

    competitionContainer.appendChild(card);
  });
}

// Render when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  renderCompetitions();
});

document.addEventListener("DOMContentLoaded", renderPolls);

document.addEventListener("DOMContentLoaded", renderPolls);

document.addEventListener("DOMContentLoaded", async () => {

  const pollContainer = document.getElementById("pollContainer");
  const competitionContainer = document.getElementById("competitionContainer");
  const eventContainer = document.getElementById("eventContainer");

  // 🟢 Modal & Form
  const modal = document.getElementById('createModal');
  const closeModalBtn = document.getElementById('closeModal');
  const addBtns = document.querySelectorAll('.add-btn');
  const tabBtns = document.querySelectorAll('.tab-btn');
  const pollForm = document.getElementById('pollForm');
  const competitionForm = document.getElementById('competitionForm');
  const eventForm = document.getElementById('eventForm');
  const modalDescription = document.getElementById('modalDescription');

  // ✅ QR Modal
  const qrModal = document.getElementById('qrModal');
  const qrContainer = document.getElementById('qrContainer');
  const qrTitle = document.getElementById('qrTitle');
  const qrTypeDesc = document.getElementById('qrTypeDesc');
  const rewardText = document.getElementById('rewardText');
  const closeQrModal = document.getElementById('closeQrModal');
  const bannerUpload = document.getElementById("bannerUpload");
  const bannerInput = document.getElementById("bannerInput");
  const addPollOptionBtn = document.getElementById("addPollOption");
  const pollOptionsContainer = document.getElementById("pollOptionsContainer"); // container for inputs
  bannerUpload.addEventListener("click", () => bannerInput.click());

bannerInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const allowedTypes = ["image/png", "image/jpeg"];
  if (!allowedTypes.includes(file.type)) {
    alert("Only PNG and JPG images are allowed!");
    bannerInput.value = "";
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    alert("File too large! Max 5MB.");
    bannerInput.value = "";
    return;
  }

  // 🔹 UI 預覽
  const imgURL = URL.createObjectURL(file);
  const bannerUpload = document.getElementById("bannerUpload");
  bannerUpload.innerHTML = `<img src="${imgURL}" alt="Banner Preview" style="width:100%; height:auto; border-radius:8px;">`;



  // 🔹 ArrayBuffer → Uint8Array（瀏覽器版本的「Buffer」）
  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);


  // 🔹 完整二進位
  // 如果你想把它傳到後端，直接 append Blob 就好
  const formData = new FormData();
  formData.append("banner", file, file.name);

  // 示例: 發送到後端
  // fetch("/api/competition", { method: "POST", body: formData });
});

// ✅ Create Competition Cards




let pollOptionCount = 2;
document.getElementById('addPollOption').addEventListener('click', () => {
  if (pollOptionCount < 10) {
    pollOptionCount++;
    const container = document.getElementById('pollOptionsContainer');
    const newOption = document.createElement('div');
    newOption.className = 'form-group';
    newOption.innerHTML = `
      <label>Option ${pollOptionCount} *</label>
      <input type="text" name="options" placeholder="e.g., Event ${String.fromCharCode(64 + pollOptionCount)}" required class="poll-option-input">
    `;
    container.appendChild(newOption);
  }
});


  // ==========================
  // 🔹 Fetch & Render Data
  // ==========================
  async function fetchData(endpoint) {
    try {
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error(`Failed to fetch ${endpoint}`);
      return await res.json();
    } catch (err) {
      console.error(err);
      return [];
    }
  }
  let hostCount = 1;

  document.getElementById('addHost').addEventListener('click', () => {
    if (hostCount < 5) {
      hostCount++;

      const container = document.getElementById('hostContainer');

      const newHost = document.createElement('input');
      newHost.type = 'text';
      newHost.name = `host`; // 🟢 必须加，FormData 才会收到
      newHost.placeholder = `Host ${hostCount} (e.g., Dr. Johnson, Student Council)`;
      newHost.style.marginTop = '8px';

      container.appendChild(newHost);
    }
  });


  
  function renderPolls(polls) {
    pollContainer.innerHTML = "";
    polls.forEach(poll => {
      
      const card = document.createElement("div");
      card.className = "card poll-card";
      card.dataset.id = poll.id;
  
      card.innerHTML = `
        <div class="card-header">
          <span>Poll #${poll.id}</span>
          <span class="status ${poll.status}">${poll.status}</span>
          <span class="ends">Ends: ${poll.ends}</span>
        </div>
        <h3>${poll.title}</h3>
        <p>${poll.votes || 0} votes</p>
      `;
      pollContainer.appendChild(card);
    });
  }
 
  function renderCompetitions(comps) {
    competitionContainer.innerHTML = "";
    comps.forEach(comp => {
      const card = document.createElement("div");
      card.className = "card competition-card";
      card.dataset.id = comp.id;
      card.dataset.reward = comp.reward;
      card.innerHTML = `
        <div class="card-header">
          <span>Competition #${comp.id}</span>
          <span class="status ${comp.status}">${comp.status}</span>
          <span class="ends">Due: ${comp.due}</span>
        </div>
        <h3>${comp.title}</h3>
        <p>${comp.participants || 0} participants</p>
        <p class="reward">Reward: ${comp.reward}</p>
      `;
      competitionContainer.appendChild(card);
    });
  }

  function renderEvents(events) {
    eventContainer.innerHTML = "";
    events.forEach(event => {
      const card = document.createElement("div");
      card.className = "card event-card";
      card.dataset.id = event.id;
      card.innerHTML = `
        <div class="card-header">
          <span>Event #${event.id}</span>
          <span class="status ${event.status}">${event.status}</span>
          <span class="ends">${event.date}</span>
        </div>
        <h3>${event.title}</h3>
        <p>Type: ${event.type}</p>
        <p>Venue: ${event.venue}</p>
      `;
      eventContainer.appendChild(card);
    });
  }

  // 初始讀取
  const [polls, competitions, events] = await Promise.all([
    fetchData("/api/polls"),
    fetchData("/api/competitions"),
    fetchData("/api/events")
  ]);

  renderPolls(polls);
  renderCompetitions(competitions);
  renderEvents(events);

  // ==========================
  // 🔹 Modal & Tabs
  // ==========================
  addBtns.forEach(btn =>
  btn.addEventListener('click', () => {
    modal.classList.remove('hidden');

    // Reset cardId and cardCompetition when opening modal
    cardId = null;
    cardCompetition = null;

    // Clear modal inputs
    modal.querySelectorAll('input, textarea').forEach(field => {
      field.value = "";
    });
  })
);

closeModalBtn.addEventListener('click', () => modal.classList.add('hidden'));

modal.addEventListener('click', e => {
  if (e.target === modal) modal.classList.add('hidden');
});

  cardcompetition = null;
  closeModalBtn.addEventListener('click', () => modal.classList.add('hidden'));
  
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });
  modal.querySelectorAll('input, textarea').forEach(field => {
      field.value = "";
    });
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      [pollForm, competitionForm, eventForm].forEach(f => f.classList.remove('active'));

      if (tab === 'poll') {
        pollForm.classList.add('active');
        modalDescription.textContent = 'Create and manage polls by entering a title, expiry date, and context. Add multiple selection options.';
      } else if (tab === 'competition') {
        competitionForm.classList.add('active');
        modalDescription.textContent = 'Create competitions by entering title, reward, venue, and max participants.';
      } else if (tab === 'event') {
        eventForm.classList.add('active');
        modalDescription.textContent = 'Create events by specifying type, title, date, venue, and description.';
      }
    });
  });

  // ==========================
  // 🔹 Form Submission
  // ==========================
  async function submitForm(form, endpoint) {
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });

      
      if (!res.ok) throw new Error("Submit failed");
      alert("Created successfully!");
      modal.classList.add('hidden');
      form.reset();

      // 重新刷新列表
      if (endpoint.includes("polls")) renderPolls(await fetchData("/api/polls"));
      else if (endpoint.includes("competitions")) renderCompetitions(await fetchData("http://10.51.33.36:3000/api/competition"));
      else if (endpoint.includes("events")) renderEvents(await fetchData("/api/events"));
    } catch (err) {
      console.error(err);
    }
  }
pollForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  // ✅ FIX: Get the TOKEN, not the user object
  const token = localStorage.getItem("musAuthToken");

  // 收集表單資料
  const formData = new FormData(pollForm);
  const data = {
    title: formData.get("title"),
    question: formData.get("question"),
    expiresAt : formData.get("expiry"), // 對應你的表單欄位名稱
    options: formData.getAll("options"),// 收所有同名 options input 成陣列
    id : cardId
  };


  try {
    const res = await fetch(`${API_BASE_URL}/polls`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`  // Use the token
      },
      credentials: "include",
      body: JSON.stringify(data)
    });

    const contentType = res.headers.get("Content-Type") || "";
    let responseBody;
    if (contentType.includes("application/json")) responseBody = await res.json();
    else responseBody = await res.text();

    if (!res.ok) throw new Error(`Submit failed: ${JSON.stringify(responseBody)}`);

   
    modal.classList.add("hidden");
    pollForm.reset();

    // 重新拉最新列表
    // const polls = await fetch("http://localhost:3000/api/polls", { credentials: "include" }).then(r => r.json());
    // renderPolls(polls);
    alert("Poll created successfully!");

  } catch (err) {
    console.error(err);
    alert("Failed to create poll: " + err.message);
  }
});




competitionForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  // define token 
  const token = localStorage.getItem("musAuthToken")

  // 先用 FormData 收集表單文字欄位
  const formData = new FormData(competitionForm);

  // 收集文字欄位成物件
  const dataObj = {
    hosts: formData.getAll("host"),
    title: formData.get("title"),
    reward: formData.get("reward"),
    venue: formData.get("venue"),
    maxParticipants: parseInt(formData.get("maxParticipants")) || 0,
    due: formData.get("expiry"),
    description: formData.get("description"),
    id: cardcompetition ?? null // 如果有卡片 ID 就帶上
  };

  // 建立新的 FormData 用於傳送 JSON + banner
  const sendFormData = new FormData();
  sendFormData.append("data", JSON.stringify(dataObj));

  // 加入圖片檔案（如果有）
  const bannerFile = bannerInput.files[0];
  if (bannerFile) {

    sendFormData.append("banner", bannerFile, bannerFile.name);
  } else {
    console.log("No file selected");
  }


  for (let [key, value] of sendFormData.entries()) {
    if (value instanceof File) {
      console.log(`${key}: File { name: ${value.name}, type: ${value.type}, size: ${value.size} }`);
    } else {
      console.log(`${key}:`, value);
    }
  }

  try {
    const res = await fetch(`${API_BASE_URL}/competition`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}` // ✅ Add Header
      },
      body: sendFormData // 直接傳 FormData
      // ⚠️ 不要加 Content-Type，瀏覽器會自動加 multipart/form-data
    });

    if (!res.ok) throw new Error(await res.text());

    alert("Competition created!");
    competitionForm.reset();
    modal.classList.add("hidden");

  } catch (err) {
    console.error("Competition submit failed:", err);
    alert("Failed to create competition");
  }
});

  // ==========================
  // 🔹 Card Actions (Edit / Delete / QR)
  // ==========================
function attachCardActions(container, type) {
  container.addEventListener("click", async (e) => {
    const card = e.target.closest(".card");
    if (!card) return;

    // 移除旧菜单
    const existingMenu = card.querySelector(".card-action-menu");
    if (existingMenu) {
      existingMenu.remove();
      return;
    }

    // 创建菜单
    const menu = document.createElement("div");
    menu.classList.add("card-action-menu");

    if (type === "competition") {
      menu.innerHTML = `
        <button class="qr-participate">Participation QR</button>
        <button class="qr-reward">Reward QR</button>
        <button class="edit-btn">Edit</button>
        <button class="delete-btn-competition">Delete</button>
      `;
    } else if (type === "poll") {
      menu.innerHTML = `
        <button class="edit-btn">Edit</button>
        <button class="delete-btn">Delete</button>
      `;
    } else if (type === "event") {
      menu.innerHTML = `
        <button class="edit-btn">Edit</button>
        <button class="delete-btn-event">Delete</button>
      `;
    }

    card.appendChild(menu);

    // ==========================
    // Edit 按钮
    // ==========================
    menu.querySelector(".edit-btn")?.addEventListener("click", () => {
      modal.classList.remove("hidden");

      // 切换 tab
      tabBtns.forEach(btn => btn.classList.toggle("active", btn.dataset.tab === type));

      // 隐藏所有 form
      [pollForm, competitionForm, eventForm].forEach(f => f.classList.remove("active"));

      // 显示对应 form
      const form = type === "poll" ? pollForm : type === "competition" ? competitionForm : eventForm;
      form.classList.add("active");

      // 填入标题
      const titleInput = form.querySelector("input[type='text']");
      if (titleInput) titleInput.value = card.querySelector("h3")?.textContent ?? "";

      // 保存 cardId
      cardId = card.dataset.id ?? null;
      cardcompetition = card.dataset.compId ?? null;
      menu.remove();
    });

    // ==========================
    // Delete 按钮
    // ==========================
    const deleteBtnClass = type === "poll" ? ".delete-btn"
                         : type === "competition" ? ".delete-btn-competition"
                         : ".delete-btn-event";

    menu.querySelector(deleteBtnClass)?.addEventListener("click", async () => {
      if (!confirm(`Are you sure you want to delete this ${type}?`)) return;

      // ✅ Get the correct ID
      let id = type === "competition" ? card.dataset.compId : card.dataset.id;
      if (!id) return alert(`${type} ID not found`);

      // ✅ Map to the correct endpoint
      const endpointMap = {
        poll: `${API_BASE_URL}/polls/${id}`,
        competition: `${API_BASE_URL}/competition/${id}`,
        event: `${API_BASE_URL}/events/${id}`
      };

      try {
        const res = await fetch(endpointMap[type], { method: "DELETE" });
        if (!res.ok) throw new Error(await res.text());
        
        card.remove();  // remove card from DOM
        console.log(`Deleted ${type} with ID ${id}`);
      } catch (err) {
        console.error(err);
        alert(`Failed to delete ${type}: ${err.message}`);
      }
    });

    if (type === "competition") {
      const compName = card.querySelector("h3")?.textContent ?? "";
      const participationToken = card.dataset.participationToken;
      const rewardToken = card.dataset.rewardToken;
      const reward = card.dataset.reward || "-";

      menu.querySelector(".qr-participate")?.addEventListener("click", () => {
        qrModal.classList.remove("hidden");
        qrContainer.innerHTML = "";
        qrTitle.textContent = "Participation QR";
        qrTypeDesc.textContent = `Scan to join "${compName}".`;
        rewardText.textContent = "";
        new QRCode(qrContainer, { text: `/competition/${encodeURIComponent(participationToken)}/join`, width: 250, height: 250 });
      });

      menu.querySelector(".qr-reward")?.addEventListener("click", () => {
        qrModal.classList.remove("hidden");
        qrContainer.innerHTML = "";
        qrTitle.textContent = "Reward QR";
        qrTypeDesc.textContent = `Scan to claim reward for "${compName}".`;
        rewardText.textContent = `Reward: ${reward}`;
        new QRCode(qrContainer, { text: `/competition/${encodeURIComponent(rewardToken)}/reward`, width: 250, height: 250 });
      });
    }

    // ==========================
    // 点击外部关闭菜单
    // ==========================
    document.addEventListener("click", function handleOutside(e2) {
      if (!menu.contains(e2.target) && !card.contains(e2.target)) {
        menu.remove();
        document.removeEventListener("click", handleOutside);
      }
    });
  });
}
  attachCardActions(pollContainer, "poll");
  attachCardActions(competitionContainer, "competition");
  attachCardActions(eventContainer, "event");

  // ==========================
  // 🔹 QR Modal Close
  // ==========================
  closeQrModal.addEventListener('click', () => qrModal.classList.add('hidden'));
  qrModal.addEventListener('click', e => { if (e.target === qrModal) qrModal.classList.add('hidden'); });
  
  
  const eventUploadArea = eventForm.querySelector(".upload-area");
  const eventPosterInput = eventForm.querySelector("input[name='poster']");
  const eventDesc = document.getElementById("eventDesc");
  const eventCharCount = document.getElementById("eventCharCount");

  let editingEventId = null; // same idea as cardId for competitions

  // --------------------
  // Click upload box => open file picker
  // --------------------
  eventUploadArea.addEventListener("click", () => {
    eventPosterInput.click();
  });

  // --------------------
  // Live preview + size/type validation
  // --------------------
  eventPosterInput.addEventListener("change", () => {
    const file = eventPosterInput.files[0];
    if (!file) return;

    if (!["image/png", "image/jpeg"].includes(file.type)) {
      alert("Only PNG or JPG allowed.");
      eventPosterInput.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("File must be under 5MB.");
      eventPosterInput.value = "";
      return;
    }

    // Add preview (same style as competitions)
    eventUploadArea.innerHTML = `
      <img src="${URL.createObjectURL(file)}" style="max-width:120px; border-radius:6px; margin-bottom:8px;">
      <p><strong>${file.name}</strong></p>
      <p class="upload-hint">Click to change poster</p>
    `;
  });

  // --------------------
  // Description character counter
  // --------------------
  eventDesc.addEventListener("input", () => {
    eventCharCount.textContent = `${eventDesc.value.length}/500`;
  });

  // --------------------
  // Submit Event Form
  // --------------------
  eventForm.addEventListener("submit", async (e) => {
    e.preventDefault();


    const fd = new FormData(eventForm);

    // Build event object
    const eventData = {
      id: editingEventId || null,
      type: fd.get("type"),
      title: fd.get("title"),
      date: fd.get("date"),
      venue: fd.get("venue"),
      description: fd.get("description") || ""
    };




    const sendForm = new FormData();
    sendForm.append("data", JSON.stringify(eventData));

    const posterFile = eventPosterInput.files[0];
    if (posterFile) {
      sendForm.append("poster", posterFile, posterFile.name);

    } else {
      
    }


    try {
      const token = localStorage.getItem("musAuthToken"); // ✅ Get Token

      const res = await fetch(`${API_BASE_URL}/events`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}` // ✅ Add Header
        },
        body: sendForm,
        credentials: "include"
      });


      const contentType = res.headers.get("Content-Type") || "";

      let responseBody;
      if (contentType.includes("application/json")) {
        responseBody = await res.json();
      } else {
        responseBody = await res.text();
      }

      if (!res.ok) {
        throw new Error(JSON.stringify(responseBody));
      }

      alert("Event created successfully!");

      // reset form and UI
      eventForm.reset();
      eventUploadArea.innerHTML = `
        <div class="upload-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
            <path d="M12 15V3M12 3L8 7M12 3L16 7M2 17L2 19C2 20.1046 2.89543 21 4 21L20 21C21.1046 21 22 20.1046 22 19V17" 
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <p><strong>+ Upload Poster</strong></p>
        <p class="upload-hint">PNG, JPG up to 5MB. Recommended: 1000x1500px</p>
      `;
      eventCharCount.textContent = "0/500";

    if (typeof renderEvents === "function") {


      const dashboardData = await fetch(`${API_BASE_URL}/dashboard`, { credentials: "include" })
        .then(r => r.json());

      const allEvents = dashboardData.events || [];
      renderEvents(allEvents);
    }


      modal.classList.add("hidden");

    } catch (err) {
      console.error("Event submit failed:", err);
      alert("Failed to create event: " + err.message);
    }
  });

});


