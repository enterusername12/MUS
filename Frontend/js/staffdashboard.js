const API_BASE_URL = 'http://localhost:3000/api';
let cardId;
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

  const addPollOptionBtn = document.getElementById("addPollOption");
  const pollOptionsContainer = document.getElementById("pollOptionsContainer"); // container for inputs

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
  addBtns.forEach(btn => btn.addEventListener('click', () => modal.classList.remove('hidden')));
  cardId = null;
  closeModalBtn.addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });

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
      else if (endpoint.includes("competitions")) renderCompetitions(await fetchData("/api/competitions"));
      else if (endpoint.includes("events")) renderEvents(await fetchData("/api/events"));
    } catch (err) {
      console.error(err);
      alert("Failed to create item.");
    }
  }
pollForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  // 取得 musAuthUser
  const musAuthUser = localStorage.getItem("musAuthUser");

  // 收集表單資料
  const formData = new FormData(pollForm);
  const data = {
    title: formData.get("title"),
    question: formData.get("question"),
    expiresAt : formData.get("expiry"), // 對應你的表單欄位名稱
    options: formData.getAll("options"),// 收所有同名 options input 成陣列
    id : cardId
  };

  console.log("Submitting poll data:", data);

  try {
    const res = await fetch("http://localhost:3000/api/polls", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${musAuthUser}`
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




  competitionForm.addEventListener("submit", e => { e.preventDefault(); submitForm(competitionForm, "/api/competitions"); });
  eventForm.addEventListener("submit", e => { e.preventDefault(); submitForm(eventForm, "/api/events"); });

  // ==========================
  // 🔹 Card Actions (Edit / Delete / QR)
  // ==========================
  function attachCardActions(container, type) {
    container.addEventListener("click", async (e) => {
      const card = e.target.closest(".card");
      if (!card) return;

      // Remove old menu
      const existingMenu = card.querySelector(".card-action-menu");
      if (existingMenu) { existingMenu.remove(); return; }

      const menu = document.createElement("div");
      menu.classList.add("card-action-menu");

      if (type === "competition") {
        menu.innerHTML = `
          <button class="qr-participate">Participation QR</button>
          <button class="qr-reward">Reward QR</button>
          <button class="edit-btn">Edit</button>
          <button class="delete-btn">Delete</button>
        `;
      } else {
        menu.innerHTML = `
          <button class="edit-btn">Edit</button>
          <button class="delete-btn">Delete</button>
        `;
      }

      card.appendChild(menu);

      // Edit
  menu.querySelector(".edit-btn")?.addEventListener("click", async () => {
    modal.classList.remove("hidden");

    // Toggle active tab buttons
    tabBtns.forEach(btn => btn.classList.toggle("active", btn.dataset.tab === type));

    // Hide all forms first
    [pollForm, competitionForm, eventForm].forEach(f => f.classList.remove("active"));

    // Activate the correct form
    if (type === "poll") pollForm.classList.add("active");
    else if (type === "competition") competitionForm.classList.add("active");
    else if (type === "event") eventForm.classList.add("active");

    // Pick the correct form
    const form = type === "poll" ? pollForm : type === "competition" ? competitionForm : eventForm;

    // Fill the text input with the card title
    form.querySelector("input[type='text']").value = card.querySelector("h3").textContent;

    // Save the card ID for later use
    cardId = card.dataset.id ?? null;
    // console.log("Editing card ID:", cardId);

    menu.remove();

    // Later, when submitting, you can check:
    // if(cardId) { update existing in DB } else { create new in DB }
});


 card.querySelector(".delete-btn")?.addEventListener("click", async () => {
  if (!confirm("Are you sure you want to delete this item?")) return;

  const cards = document.querySelectorAll(".poll-card");
cards.forEach(card => {
  console.log("Card ID:", card.dataset.id, "Title:", card.querySelector("h3")?.textContent);
});
  // Get the poll ID from the card itself
  const id = card.dataset.id; 
  if (!id) {
    alert("Poll ID not found.");
    return;
  }

  try {
    const res = await fetch(`http://localhost:3000/api/polls/${id}`, { method: "DELETE" });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.message || "Delete failed");
    }

    // Remove the clicked card from UI
    card.remove();
    console.log(`Deleted poll with ID ${id}`);
  } catch (err) {
    console.error("Delete error:", err);
    alert(`Failed to delete: ${err.message}`);
  }
});



      // QR Codes for competitions
      if (type === "competition") {
        const compName = card.querySelector("h3").textContent;
        const reward = card.dataset.reward || "500 points";

        menu.querySelector(".qr-participate").addEventListener("click", () => {
          qrModal.classList.remove("hidden");
          qrContainer.innerHTML = "";
          qrTitle.textContent = "Participation QR";
          qrTypeDesc.textContent = `Scan to join "${compName}".`;
          rewardText.textContent = "";
          new QRCode(qrContainer, { text: `/competition/${encodeURIComponent(compName)}/join`, width: 250, height: 250 });
        });

        menu.querySelector(".qr-reward").addEventListener("click", () => {
          qrModal.classList.remove("hidden");
          qrContainer.innerHTML = "";
          qrTitle.textContent = "Reward QR";
          qrTypeDesc.textContent = `Scan to claim reward for "${compName}".`;
          rewardText.textContent = `Reward: ${reward}`;
          new QRCode(qrContainer, { text: `/competition/${encodeURIComponent(compName)}/reward`, width: 250, height: 250 });
        });
      }

      // Close menu on outside click
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
});
