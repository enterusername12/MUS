
// Dashboard widgets are hydrated from the backend API and rendered client-side.
const API_BASE_URL = "http://localhost:3000/api";

// === AI interaction helpers ===

function readCookie(name) {
  const cookies = document.cookie?.split(";") ?? [];
  for (const cookie of cookies) {
    const [key, value] = cookie.split("=");
    if (key?.trim() === name) {
      return decodeURIComponent(value ?? "");
    }
  }
  return null;
}

function getUserId() {
  // Option A: musAuthUser payload
  const musAuthUserRaw = localStorage.getItem("musAuthUser") || readCookie("musAuthUser");
  if (musAuthUserRaw) {
    try {
      const parsedUser = typeof musAuthUserRaw === "string" ? JSON.parse(musAuthUserRaw) : musAuthUserRaw;
      if (parsedUser?.id) return parsedUser.id;
    } catch (error) {
      console.warn("Unable to parse musAuthUser from storage", error);
    }
  }

  // Option B: meta tag injected by backend template (if add it later)
  const meta = document.querySelector('meta[name="user-id"]');
  if (meta && meta.content) return meta.content;

  return null; // guests or unknown
}

function getDashboardRequestOptions() {
  const headers = {
    "Accept": "application/json"
  };

  const token = localStorage.getItem("musAuthToken");
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const userId = getUserId();
  headers["X-User-Id"] = userId ?? "";

  return {
    credentials: "include",
    headers
  };
}

const user = JSON.parse(localStorage.getItem("musAuthUser"));



document.addEventListener("DOMContentLoaded", () => {
  const authUser = JSON.parse(localStorage.getItem("musAuthUser"));

  if (authUser) {
    const fullName = `${authUser.firstName} ${authUser.lastName}`;
    document.getElementById("studentName").textContent = fullName;
  }
});



async function initializeRewardPoints() {
  try {
        const response = await fetch(`${API_BASE_URL}/dashboard`, getDashboardRequestOptions());
    if (!response.ok) throw new Error(`Failed to fetch dashboard: ${response.status}`);

    const data = await response.json();

    // Pass rewardPoints array to your function
    loadRewardPoints(data.rewardPoints);
    //console.log("Reward points from API:", data.rewardPoints);

  } catch (err) {
    console.error("Error loading reward points:", err);
    const pointsEl = document.getElementById("rewardPoints");
    const progressEl = document.getElementById("rewardProgress");
    if (pointsEl) pointsEl.textContent = "Error loading points";
    if (progressEl) progressEl.textContent = "";
  }
}

// Call it after DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  initializeRewardPoints();
});


// One-time IntersectionObserver to log 'view' when a card is on screen
const _aiViewObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    const id = entry.target.getAttribute("data-event-id");
    if (id) logEventInteraction(String(id), "view");
    _aiViewObserver.unobserve(entry.target); // only log once per card
  });
}, { threshold: 0.5 });

// --- Helper to render cards ---
function sanitizeText(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed || fallback;
}

function showEventDetailUI(item) {
  if (!item) return;

  let modal = document.getElementById("eventDetailModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "eventDetailModal";
    Object.assign(modal.style, {
      position: "fixed",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      background: "rgba(0,0,0,0.5)",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      zIndex: 9999
    });

    modal.innerHTML = `
      <div id="modalContent" style="background:white;padding:20px;border-radius:10px;position:relative;">
        <span id="closeEventModal" style="cursor:pointer;position:absolute;top:10px;right:10px;font-size:24px;">&times;</span>
        <h2>Participate</h2>
        <p>Upload/paste the QR image to Participate:</p>
        <input type="file" id="qrInput" accept="image/*" />
        <button id="submitQR">Submit QR Code</button>
        <p id="qrResult"></p>
      </div>
    `;
    document.body.appendChild(modal);
  }

  modal.style.display = "flex";

  const qrInput = modal.querySelector("#qrInput");
  const qrResult = modal.querySelector("#qrResult");
  const submitQR = modal.querySelector("#submitQR");
  let qrFile = null;

  qrInput.addEventListener("change", (e) => {
    qrFile = e.target.files[0];
  });

  submitQR.onclick = async () => {
    if (!qrFile) {
      qrResult.textContent = "Please upload an image first.";
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const img = new Image();
      img.onload = async () => {
        const maxDim = 400;
        const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);

        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, canvas.width, canvas.height);

        if (!code) {
          qrResult.textContent = "Could not read QR code. Try a clearer image.";
          return;
        }

        const token = code.data;
        qrResult.textContent = `Token: ${token}`;
        console.log("QR token:", token);

        // 获取 userId
        const userId = JSON.parse(localStorage.getItem("musAuthUser"))?.id;
        if (!userId) {
          alert("User not logged in!");
          return;
        }

        // 获取 competitionId
        const competitionId = item?.id ?? item?.event_id;
        if (!competitionId) {
          alert("Competition ID missing!");
          return;
        }

        try {

          const response = await fetch(`${API_BASE_URL.replace(/\/api$/, "")}/api/competition/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId,
              competitionId,

            })
          });

          const data = await response.json();
          console.log("Server response:", data);

          if (data.success) {
            alert("✅ Registration successful!");
            modal.style.display = "none";
          } else {
            alert("❌ Registration failed: " + (data.error || "Unknown error"));
          }
        } catch (err) {
          console.error("Request error:", err);
          alert("❌ Registration failed due to network error.");
        }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(qrFile);
  };

  modal.querySelector("#closeEventModal").onclick = () => {
    modal.style.display = "none";
    qrInput.value = "";
    qrResult.textContent = "";
    qrFile = null;
  };
  modal.onclick = (e) => {
    if (e.target === modal) modal.style.display = "none";
  };
}






function renderCards(container, data, type) {
  container.innerHTML = "";
  data.forEach(item => {
    const card = document.createElement("div");
    card.classList.add(type === "news" ? "event-card" : "post-card");
    card.style.cursor = "pointer"; // make card visually clickable
    card.style.border = "1px solid #ccc";
    card.style.padding = "10px";
    card.style.marginBottom = "10px";
    card.style.borderRadius = "5px";
    card.style.background = "#fff";

    const evtId = String(item.id ?? item.event_id ?? item.post_id ?? "");

    if (evtId) {
      card.setAttribute("data-event-id", evtId);
      _aiViewObserver.observe(card);
      card.addEventListener("click", () => {
        logEventInteraction(evtId, "click");
        if (
          card.classList.contains("event-card") &&
          window.location.pathname.endsWith("Frontend/studentdashboard.html")
        ) {
          showEventDetailUI(item);
        }
          
      });
    }
    // console.log(item.participation);
    if (type === "news") {
      const publishedLabel = item.publishedAt
        ? new Date(item.publishedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
        : "";
      const authorLabel = item.author ? item.author : "";
      const meta = [authorLabel, publishedLabel].filter(Boolean).join(" • ");
      const description = item.desc ?? item.description ?? item.summary ?? item.body ?? "Details coming soon.";

      card.innerHTML = `
        ${item.bannerBase64 ? `<img src="${item.bannerBase64}" style="width:100%; border-radius:5px; margin-bottom:10px;">` : ""}
        <h3>${item.title}</h3>
        ${meta ? `<div style="color:#666; margin-bottom:5px;">${meta}</div>` : ""}
        <p>${description}</p>
      `;
    } else {
      const author = item.author || "Community";
      const category = item.category || "General";
      const title = item.title ?? item.heading ?? "";
      const content = item.content ?? item.description ?? item.summary ?? item.body ?? "Stay tuned for more details.";

      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
          <div>${author}</div>
          <div style="background:#eee; padding:2px 6px; border-radius:3px;">${category}</div>
        </div>
        ${title ? `<h3>${title}</h3>` : ""}
        <p>${content}</p>
      `;
    }

    container.appendChild(card);
  });
}


// --- Helper to render dots ---
function renderDots(dotContainer, count) {
  dotContainer.innerHTML = "";
  if (count <= 1) {
    return;
  }

  for (let i = 0; i < count; i++) {
    const dot = document.createElement("div");
    dot.classList.add("dot");
    if (i === 0) dot.classList.add("active");
    dotContainer.appendChild(dot);

    dot.addEventListener("click", () => {
      const container = dotContainer.parentElement.querySelector(
        ".events-container, .post-container, .poll-container"
      );
      container.scrollTo({ left: i * container.clientWidth, behavior: "smooth" });
      Array.from(dotContainer.children).forEach(d => d.classList.remove("active"));
      dot.classList.add("active");
    });
  }
}

// --- Navigation Setup ---
function setupNavigation(prevBtn, nextBtn, container, dotContainer) {
  const total = container.children.length;
  if (prevBtn) prevBtn.removeAttribute("disabled");
  if (nextBtn) nextBtn.removeAttribute("disabled");
  if (total <= 1) {
    if (prevBtn) prevBtn.setAttribute("disabled", "disabled");
    if (nextBtn) nextBtn.setAttribute("disabled", "disabled");
    return;
  }

  let index = 0;

  function updateDots() {
    Array.from(dotContainer.children).forEach((d, i) => {
      d.classList.toggle("active", i === index);
    });
  }

  prevBtn.addEventListener("click", () => {
    index = (index - 1 + total) % total;
    container.scrollTo({ left: index * container.clientWidth, behavior: "smooth" });
    updateDots();
  });

  nextBtn.addEventListener("click", () => {
    index = (index + 1) % total;
    container.scrollTo({ left: index * container.clientWidth, behavior: "smooth" });
    updateDots();
  });
}

// --- Initialize Campus News ---
// --- Loading helpers ---
function setLoading(container, message = "Loading...") {
  if (!container) return;
  container.innerHTML = `<div class="loading-state">${message}</div>`;
}

function setError(container, message = "Something went wrong.") {
  if (!container) return;
  container.innerHTML = `<div class="error-state">${message}</div>`;
}

function setEmpty(container, message = "No data available yet.") {
  if (!container) return;
  container.innerHTML = `<div class="empty-state">${message}</div>`;
}

// --- Section renderers ---
function initializeNews(news = []) {
  const container = document.getElementById("eventsContainer");
  const dots = document.getElementById("newsDots");
  const prevBtn = document.getElementById("prevNewsBtn");
  const nextBtn = document.getElementById("nextNewsBtn");

  if (!container || !dots) {
    return;
  }

  if (!Array.isArray(news) || news.length === 0) {
    setEmpty(container, "No campus news yet. Check back soon!");
    dots.innerHTML = "";
    if (prevBtn) prevBtn.setAttribute("disabled", "disabled");
    if (nextBtn) nextBtn.setAttribute("disabled", "disabled");
    return;
  }

  renderCards(container, news, "news");
  renderDots(dots, news.length);
  setupNavigation(prevBtn, nextBtn, container, dots);
}

function initializeCommunityHighlights(events = []) {
  const container = document.getElementById("postContainer");
  const dots = document.getElementById("postDots");
  const prevBtn = document.getElementById("prevPostBtn");
  const nextBtn = document.getElementById("nextPostBtn");

  if (!container || !dots) {
    return;
  }

  if (!Array.isArray(events) || events.length === 0) {
    setEmpty(container, "No community highlights yet. Share something awesome!");
    dots.innerHTML = "";
    if (prevBtn) prevBtn.setAttribute("disabled", "disabled");
    if (nextBtn) nextBtn.setAttribute("disabled", "disabled");
    return;
  }

  renderCards(container, events, "post");
  renderDots(dots, events.length);
  setupNavigation(prevBtn, nextBtn, container, dots);
}
function getLoggedInUser() {
  const userStr = localStorage.getItem("musAuthUser");
  if (!userStr) return null;
  try {
    return JSON.parse(userStr);
  } catch {
    return null;
  }
}

const loggedInUser = getLoggedInUser();
if (!loggedInUser) {
  alert("User not logged in.");
}

// --- Poll Helpers ---
function sanitizeText(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function formatPollDeadline(deadline) {
  if (!deadline) return "No deadline";
  const parsed = new Date(deadline);
  if (Number.isNaN(parsed.getTime())) return deadline;
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function normalizePollOption(option, index) {
  const voteCount = Math.max(0, Math.round(option.voteCount ?? option.votes ?? 0));
  return {
    ...option,
    name: sanitizeText(option.name ?? option.label ?? option.option ?? `Option ${index + 1}`),
    voteCount,
    percent: option.percent ?? null
  };
}

function buildClientPoll(poll, fallbackId) {
  const normalizedOptions = (poll.options ?? []).map(normalizePollOption);
  const totalVotes = Math.max(
    poll.totalVotes ?? normalizedOptions.reduce((sum, o) => sum + o.voteCount, 0),
    0
  );
  const optionsWithPercentages = normalizedOptions.map(opt => ({
    ...opt,
    percent: opt.percent !== null
      ? Math.min(Math.max(Math.round(opt.percent), 0), 100)
      : totalVotes > 0 ? Math.round((opt.voteCount / totalVotes) * 100) : 0
  }));
  return {
    ...poll,
    id: poll.id ?? poll.pollId ?? fallbackId,
    title: sanitizeText(poll.title ?? poll.question ?? "Poll question"),
    description: sanitizeText(poll.description ?? ""),
    totalVotes,
    options: optionsWithPercentages
  };
}

function updatePollCardFromState(pollCard, poll) {
  if (!pollCard) return;
  const totalVotesLabel = pollCard.querySelector(".poll-footer span");
  if (totalVotesLabel) totalVotesLabel.textContent = `👥 ${poll.totalVotes} total votes`;

  const optionNodes = pollCard.querySelectorAll(".poll-option");
  poll.options.forEach((option, index) => {
    const optionNode = optionNodes[index];
    if (!optionNode) return;
    const percentLabel = optionNode.querySelector(".option-label span:last-child");
    if (percentLabel) percentLabel.textContent = `${option.percent}%`;
    const progressFill = optionNode.querySelector(".progress-fill");
    if (progressFill) progressFill.style.width = `${option.percent}%`;
  });
}

// --- Vote Poll Function (Fixed) ---
async function votePoll(pollId, optionId) {
  const token = localStorage.getItem("musAuthToken");
  if (!token) {
    alert("User not logged in");
    return null;
  }

  try {
    // Fixed: Changed endpoint from /votess/ to /votes/
    const res = await fetch(`${API_BASE_URL}/votess/${pollId}/vote`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json", 
        "Authorization": `Bearer ${token}` 
      },
      body: JSON.stringify({ option_id: optionId })
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`Vote failed: ${res.status} - ${errorText}`);
      
      // Better error handling
      let errorMessage = "Failed to submit vote.";
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.message) {
          errorMessage = errorData.message;
        }
      } catch (e) {
        // If parsing fails, use default message
      }
      
      throw new Error(errorMessage);
    }

    const data = await res.json();
    console.log("Vote response:", data);
    alert("Vote successful!");
    
    // Reload to show updated votes
    window.location.reload();
    return data.poll;
    
  } catch (err) {
    console.error("Error voting:", err);
    alert(err.message || "Failed to submit vote. Please try again.");
    return null;
  }
}

// --- Handle vote click ---
function handleVoteClick(poll, pollCard, optionIndex) {
  const selectedOption = poll.options[optionIndex];
  votePoll(poll.id, selectedOption.id);
}

// --- Initialize polls ---
function initializePolls(polls = []) {
  const container = document.getElementById("pollContainer");
  const dots = document.getElementById("pollDots");
  const prevBtn = document.getElementById("prevPollBtn");
  const nextBtn = document.getElementById("nextPollBtn");
  const pollCount = document.getElementById("pollCount");
  if (!container || !dots) return;

  container.innerHTML = "";
  if (pollCount) pollCount.textContent = `${polls.length} Active ${polls.length === 1 ? "Poll" : "Polls"}`;

  polls.forEach((poll, index) => {
    const clientPoll = buildClientPoll(poll, `poll-${index + 1}`);
    const pollCard = document.createElement("div");
    pollCard.classList.add("poll-card");
    pollCard.id = `poll-${clientPoll.id}`;

    const deadline = formatPollDeadline(clientPoll.deadline);
    const optionsHTML = clientPoll.options.map((opt, idx) => `
      <div class="poll-option">
        <div class="option-label"><span>${opt.name}</span><span>${opt.percent}%</span></div>
        <div class="progress-bar"><div class="progress-fill" style="width:${opt.percent}%;"></div></div>
        <button class="option-vote-btn" data-option-index="${idx}">Vote</button>
      </div>
    `).join("");

    pollCard.innerHTML = `
      <div class="poll-header">
        <div class="poll-title">${clientPoll.title}</div>
        <div class="poll-deadline">🗓 Ends ${deadline}</div>
      </div>
      ${clientPoll.description ? `<p class="poll-description">${clientPoll.description}</p>` : ""}
      <div class="poll-options">${optionsHTML}</div>
      <div class="poll-footer"><span>👥 ${clientPoll.totalVotes} total votes</span></div>
    `;

    container.appendChild(pollCard);

    // Add click listeners for each option
    pollCard.querySelectorAll(".option-vote-btn").forEach(btn => {
      btn.addEventListener("click", () => handleVoteClick(clientPoll, pollCard, parseInt(btn.dataset.optionIndex)));
    });
  });
}

// Example: fetch polls from backend and initialize
async function loadPolls() {
  try {
    const res = await fetch("/api/polls"); // Your backend endpoint returning polls
    const polls = await res.json();
    initializePolls(polls);
  } catch (err) {
    console.error(err);
  }
}

// Load polls on page load
loadPolls();
const calendarState = {
  items: [],
  currentDate: new Date(),
  typeColors: {},
  initialized: false
};

const CALENDAR_COLOR_PALETTE = [
  "#22c55e",
  "#ef4444",
  "#a855f7",
  "#3b82f6",
  "#f97316",
  "#0ea5e9",
  "#facc15"
];

const PREDEFINED_CALENDAR_COLORS = {
  poll: "#e84a5f",
  deadline: "#e84a5f",
  "poll deadline": "#e84a5f",
  competition: "#8a2c57",
  event: "#4caf50",
  "campus event": "#4caf50"
};

const PREDEFINED_CALENDAR_CLASSES = {
  poll: "red",
  deadline: "red",
  "poll deadline": "red",
  competition: "purple",
  event: "green",
  "campus event": "green"
};

const calendarModalState = {
  modal: null,
  listContainer: null,
  titleEl: null,
  typeEl: null,
  timeEl: null,
  descriptionEl: null,
  dateEl: null,
};

function normalizeCalendarType(type) {
  return (type || "event").toLowerCase();
}

function resolveCalendarColor(type) {
  const normalizedType = (type || "event").toLowerCase();

  const predefinedColor = PREDEFINED_CALENDAR_COLORS[normalizedType];
  if (predefinedColor) {
    calendarState.typeColors[normalizedType] = predefinedColor;
    return predefinedColor;
  }
  if (!calendarState.typeColors[normalizedType]) {
    const paletteIndex = Object.keys(calendarState.typeColors).length % CALENDAR_COLOR_PALETTE.length;
    calendarState.typeColors[normalizedType] = CALENDAR_COLOR_PALETTE[paletteIndex];
  }
  return calendarState.typeColors[normalizedType];
}

function formatCalendarTypeLabel(type) {
  if (!type) return "Event";
  return type
    .split(/[_-\s]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function ensureCalendarEventModal() {
  if (calendarModalState.modal) {
    return calendarModalState;
  }

  const modal = document.createElement("div");
  modal.id = "calendarEventModal";
  modal.className = "calendar-modal";
  modal.innerHTML = `
    <div class="calendar-modal__backdrop"></div>
    <div class="calendar-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="calendarModalTitle">
      <button class="calendar-modal__close" type="button" aria-label="Close">&times;</button>
      <div class="calendar-modal__header">
        <div>
          <p class="calendar-modal__date">&nbsp;</p>
          <h3 id="calendarModalTitle" class="calendar-modal__heading">Event details</h3>
        </div>
        <div class="calendar-modal__pill" data-type="event">Event</div>
      </div>
      <div class="calendar-modal__content">
        <div class="calendar-modal__list" aria-label="Events on this day"></div>
        <div class="calendar-modal__body">
          <p class="calendar-modal__time">&nbsp;</p>
          <h4 class="calendar-modal__title">&nbsp;</h4>
          <p class="calendar-modal__description">&nbsp;</p>
        </div>
      </div>
    </div>
  `;

  const closeModal = () => {
    modal.classList.remove("calendar-modal--open");
  };

  modal.querySelector(".calendar-modal__close")?.addEventListener("click", closeModal);
  modal.querySelector(".calendar-modal__backdrop")?.addEventListener("click", closeModal);

  document.body.appendChild(modal);

  calendarModalState.modal = modal;
  calendarModalState.listContainer = modal.querySelector(".calendar-modal__list");
  calendarModalState.titleEl = modal.querySelector(".calendar-modal__title");
  calendarModalState.typeEl = modal.querySelector(".calendar-modal__pill");
  calendarModalState.timeEl = modal.querySelector(".calendar-modal__time");
  calendarModalState.descriptionEl = modal.querySelector(".calendar-modal__description");
  calendarModalState.dateEl = modal.querySelector(".calendar-modal__date");

  return calendarModalState;
}

function renderCalendarEventDetails(selectedEvent = {}) {
  const { titleEl, typeEl, timeEl, descriptionEl, dateEl } = ensureCalendarEventModal();

  const normalizedType = normalizeCalendarType(selectedEvent.type);
  const title = sanitizeText(selectedEvent.title, "Untitled Event");
  const description = sanitizeText(selectedEvent.description || selectedEvent.details, "No description provided.");
  const time = sanitizeText(selectedEvent.time, "All day");
  const rawDate = sanitizeText(selectedEvent.date, "");
  let formattedDate = "";
  if (rawDate) {
    const parsedDate = new Date(rawDate);
    formattedDate = Number.isNaN(parsedDate.getTime()) ? rawDate : parsedDate.toDateString();
  }

  if (titleEl) titleEl.textContent = title;
  if (typeEl) {
    typeEl.textContent = formatCalendarTypeLabel(normalizedType);
    typeEl.setAttribute("data-type", normalizedType);
  }
  if (timeEl) timeEl.textContent = time;
  if (descriptionEl) descriptionEl.textContent = description;
  if (dateEl) dateEl.textContent = formattedDate;
}

function renderCalendarEventList(events, selectedEvent) {
  const { listContainer } = ensureCalendarEventModal();
  if (!listContainer) return;

  listContainer.innerHTML = "";

  (events || []).forEach((event) => {
    const normalizedType = normalizeCalendarType(event.type);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "calendar-modal__list-item";
    button.innerHTML = `
      <span class="calendar-modal__list-type calendar-entry--${normalizedType}">
        ${formatCalendarTypeLabel(normalizedType)}
      </span>
      <span class="calendar-modal__list-title">${sanitizeText(event.title, "Untitled Event")}</span>
      ${event.time ? `<span class="calendar-modal__list-time">${sanitizeText(event.time)}</span>` : ""}
    `;

    if (selectedEvent === event) {
      button.classList.add("is-active");
    }

    button.addEventListener("click", () => {
      renderCalendarEventDetails(event);
      listContainer.querySelectorAll(".calendar-modal__list-item").forEach((item) => item.classList.remove("is-active"));
      button.classList.add("is-active");
    });

    listContainer.appendChild(button);
  });
}

function openCalendarEventModal(events = [], selectedEvent = null) {
  const validEvents = Array.isArray(events) ? events : [];
  const initialEvent = selectedEvent || validEvents[0] || {};
  const { modal } = ensureCalendarEventModal();

  renderCalendarEventDetails(initialEvent);
  renderCalendarEventList(validEvents, initialEvent);

  if (modal) {
    modal.classList.add("calendar-modal--open");
  }
}

function updateCalendarLegend() {
  const legend = document.querySelector(".calendar-legend");
  if (!legend) {
    return;
  }

   legend.innerHTML = `
    <span><span class="dot red"></span> Poll Deadline</span>
    <span><span class="dot purple"></span> Competition</span>
    <span><span class="dot green"></span> Campus Event</span>
  `;
}

function renderCalendar() {
  const monthYear = document.getElementById("monthYear");
  const grid = document.getElementById("calendarGrid");

  if (!monthYear || !grid) {
    return;
  }

  const { currentDate, items } = calendarState;

  grid.innerHTML = "";

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  monthYear.textContent = currentDate.toLocaleString("default", { month: "long", year: "numeric" });

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement("div");
    grid.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const cell = document.createElement("div");
    cell.classList.add("day");

    const dateLabel = document.createElement("div");
    dateLabel.classList.add("date");
    dateLabel.textContent = day;

    const dotsContainer = document.createElement("div");
    dotsContainer.classList.add("indicators");

    const fullDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const eventsToday = items.filter((item) => item.date === fullDate);
    const joinedEvents = eventsToday.filter(
      (event) => event.joined || event.isJoined || event.userJoined
    );

    const eventsForEntries = joinedEvents.length ? joinedEvents : eventsToday;

    const eventsToRender = Array.from(
      new Map(
        eventsForEntries.map((event) => [
          (event.type || "event").toLowerCase(),
          event
        ])
      ).values()
    );

    eventsToRender.forEach((event) => {
      const dot = document.createElement("div");
      dot.classList.add("dot");
      const type = (event.type || "event").toLowerCase();
      const typeClass = PREDEFINED_CALENDAR_CLASSES[type];
      if (typeClass) {
        dot.classList.add(typeClass);
      } else {
        dot.style.backgroundColor = resolveCalendarColor(type);
      }
      dot.title = event.time ? `${event.title} — ${event.time}` : event.title;
      dotsContainer.appendChild(dot);
    });

    if (eventsToday.length === 0) {
      dotsContainer.classList.add("empty");
    }

    if (eventsForEntries.length > 0) {
      cell.addEventListener("click", () => openCalendarEventModal(eventsForEntries));
    }

    cell.appendChild(dateLabel);
    cell.appendChild(dotsContainer);
    grid.appendChild(cell);
  }

  updateCalendarLegend();
}

function initializeCalendar(items = []) {
  const prevMonthBtn = document.getElementById("prevMonth");
  const nextMonthBtn = document.getElementById("nextMonth");
  const monthYear = document.getElementById("monthYear");
  const grid = document.getElementById("calendarGrid");

  if (!monthYear || !grid) {
    return;
  }

  calendarState.items = Array.isArray(items)
    ? items
        .map((item) => ({
          ...item,
          date: item.date ?? "",
          type: (item.type || "event").toLowerCase()
        }))
        .filter((item) => item.date)
    : [];

  calendarState.currentDate = new Date();
  calendarState.typeColors = {};
  updateCalendarLegend();

  if (!calendarState.initialized) {
    if (prevMonthBtn) {
      prevMonthBtn.addEventListener("click", () => {
        calendarState.currentDate.setMonth(calendarState.currentDate.getMonth() - 1);
        renderCalendar();
      });
    }

    if (nextMonthBtn) {
      nextMonthBtn.addEventListener("click", () => {
        calendarState.currentDate.setMonth(calendarState.currentDate.getMonth() + 1);
        renderCalendar();
      });
    }

    calendarState.initialized = true;
  }

  if (calendarState.items.length === 0) {
    grid.innerHTML = `<div class="empty-state">No events on the calendar yet.</div>`;
    monthYear.textContent = new Date().toLocaleString("default", { month: "long", year: "numeric" });
    updateCalendarLegend();
    return;
  }

  renderCalendar();
}

function loadStudentSpotlight(data) {
  const nameEl = document.getElementById("spotlightName");
  const monthEl = document.getElementById("spotlightMonth");
  const pointsEl = document.getElementById("spotlightPoints");
  const awardEl = document.getElementById("spotlightAward");
  const descriptionEl = document.getElementById("spotlightDescription");

  if (!nameEl || !monthEl || !pointsEl || !awardEl || !descriptionEl) {
    return;
  }

  if (!data) {
    nameEl.textContent = "Student Spotlight";
    monthEl.textContent = "";
    pointsEl.textContent = "";
    awardEl.textContent = "";
    descriptionEl.textContent = "No spotlight selected.";
    return;
  }

  const displayName = sanitizeText(
      data.name || data.fullName || data.user_name || data.userName,
      "Student Spotlight"
    );

    nameEl.textContent = displayName;
    monthEl.textContent = "";
    pointsEl.textContent = data.points ? `${data.points} Points` : "";
    awardEl.textContent = "";
    descriptionEl.textContent = "Top reward points for the month.";
}

function formatSpotlightMonth(month) {
  if (!month) return "";

  if (/^\d{4}-\d{2}$/.test(month)) {
    const [year, monthPart] = month.split("-");
    const parsedDate = new Date(Number(year), Number(monthPart) - 1, 1);
    if (!Number.isNaN(parsedDate.getTime())) {
      return parsedDate.toLocaleString(undefined, { month: "long", year: "numeric" });
    }
  }

  return month;
}



function loadRewardPoints(rewardPoints) {
  const pointsEl = document.getElementById("rewardPoints");
  const progressEl = document.getElementById("rewardProgress");

  if (!pointsEl || !progressEl) return;

  const userDataRaw = localStorage.getItem("musAuthUser");
  if (!userDataRaw) {
    pointsEl.textContent = "0 Points";
    progressEl.textContent = "";
    return;
  }

  let userId;
  try {
    const userObj = JSON.parse(userDataRaw);
    userId = userObj.id;
  } catch {
    pointsEl.textContent = "0 Points";
    progressEl.textContent = "";
    return;
  }

  if (!Array.isArray(rewardPoints) || rewardPoints.length === 0) {
    pointsEl.textContent = "0 Points";
    progressEl.textContent = "";
    return;
  }

  // Use loose equality to avoid type issues
  const matching = rewardPoints.find(r => r.user_id == userId);

  if (!matching) {
    pointsEl.textContent = "0 Points";
    progressEl.textContent = "";
    return;
  }

  const pointsValue = Number(matching.points) || 0;
  pointsEl.textContent = `${pointsValue} Points`;
  progressEl.textContent = "";
}



const DASHBOARD_LIMITS = {
  newsLimit: 5,
  eventsLimit: 6,
  pollsLimit: 3,
  spotlightLimit: 1,
  rewardLimit: 5,
  calendarLimit: 12
};
async function initializeDashboard() {
  const eventsContainer = document.getElementById("eventsContainer");
  const postContainer = document.getElementById("postContainer");
  const pollContainer = document.getElementById("pollContainer");
  const calendarGrid = document.getElementById("calendarGrid");
  const spotlightDescription = document.getElementById("spotlightDescription");
  const spotlightName = document.getElementById("spotlightName");
  const spotlightMonth = document.getElementById("spotlightMonth");
  const spotlightPoints = document.getElementById("spotlightPoints");
  const spotlightAward = document.getElementById("spotlightAward");
  const rewardPointsEl = document.getElementById("rewardPoints");
  const rewardProgressEl = document.getElementById("rewardProgress");

  setLoading(eventsContainer, "Loading campus news...");
  setLoading(postContainer, "Loading community highlights...");
  setLoading(pollContainer, "Loading polls...");
  setLoading(calendarGrid, "Loading calendar...");

  if (spotlightName) spotlightName.textContent = "Loading spotlight...";
  if (spotlightMonth) spotlightMonth.textContent = "";
  if (spotlightPoints) spotlightPoints.textContent = "";
  if (spotlightAward) spotlightAward.textContent = "";
  if (spotlightDescription) spotlightDescription.textContent = "Fetching the latest spotlight.";

  if (rewardPointsEl) rewardPointsEl.textContent = "Loading...";
  if (rewardProgressEl) rewardProgressEl.textContent = "";

  try {
    const response = await fetch(`${API_BASE_URL}/dashboard`, getDashboardRequestOptions());
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const data = await response.json();

    // Merge competitions and campus events into one array
    const competitions = data.competitions || [];
    const events = data.event || [];
    const merged = [...competitions, ...events];

    // Render merged items
    initializeNews(merged);
    
    initializeCommunityHighlights(data.events || []);
    initializePolls(data.polls || []);
    initializeCalendar(data.calendar || []);

    const rewardPoints = Array.isArray(data.rewardPoints) ? data.rewardPoints : [];
    const topReward = rewardPoints
      .slice()
      .sort((a, b) => (Number(b.points) || 0) - (Number(a.points) || 0))[0] || null;

    loadStudentSpotlight(topReward);
    loadRewardPoints(data.rewardPoints || null);
  } catch (error) {
    console.error("Failed to load dashboard data", error);
    setError(eventsContainer, "Unable to load campus news.");
    setError(postContainer, "Unable to load community highlights.");
    setError(pollContainer, "Unable to load polls right now.");
    setError(calendarGrid, "Unable to load calendar events.");
    loadStudentSpotlight(null);
    loadRewardPoints(null);
  }
}

// UPDATE your renderCards function - change the type checking:
function renderCards(container, data, type) {
  container.innerHTML = "";
  data.forEach(item => {
    const card = document.createElement("div");
    card.classList.add(type === "news" ? "event-card" : "post-card");
    card.style.cursor = "pointer";
    card.style.border = "1px solid #ccc";
    card.style.padding = "10px";
    card.style.marginBottom = "10px";
    card.style.borderRadius = "5px";
    card.style.background = "#fff";

    const evtId = String(item.id ?? item.event_id ?? item.post_id ?? "");

    if (evtId) {
      card.setAttribute("data-event-id", evtId);
      _aiViewObserver.observe(card);
      card.addEventListener("click", () => {
        if (typeof logEventInteraction === 'function') {
          logEventInteraction(evtId, "click");
        }
        if (
          card.classList.contains("event-card") &&
          window.location.pathname.endsWith("Frontend/studentdashboard.html")
        ) {
          showEventDetailUI(item);
        }
      });
    }

    // Check if it's a competition (has hosts, due, description) or campus event (has content, category)
    const isCompetition = item.hosts || item.due || item.rewardText;
    const isCampusEvent = item.content && item.category === "Event";

    if (type === "news") {
      if (isCampusEvent) {
        // Render as campus event
        const title = sanitizeText(item.title, "Untitled Event");
        const category = sanitizeText(item.category, "Event");
        const content = sanitizeText(item.content, "No details available.");
        const imageUrl = item.image_url;

        card.innerHTML = `
          ${imageUrl ? `<img src="${imageUrl}" style="width:100%; border-radius:5px; margin-bottom:10px;" alt="${title}">` : ""}
          <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
            <h3 style="margin:0; flex-grow:1;">${title}</h3>
            <div style="background:#4CAF50; color:white; padding:2px 6px; border-radius:3px; font-size:0.85rem;">${category}</div>
          </div>
          <p style="margin-top:8px;">${content}</p>
        `;
      } else {
        // Render as competition/news
        const publishedLabel = item.publishedAt
          ? new Date(item.publishedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
          : "";
        const authorLabel = item.author ? item.author : "";
        const meta = [authorLabel, publishedLabel].filter(Boolean).join(" • ");
        const description = item.desc ?? item.description ?? item.summary ?? item.body ?? "Details coming soon.";

        card.innerHTML = `
          ${item.bannerBase64 ? `<img src="${item.bannerBase64}" style="width:100%; border-radius:5px; margin-bottom:10px;">` : ""}
          <h3>${item.title}</h3>
          ${meta ? `<div style="color:#666; margin-bottom:5px;">${meta}</div>` : ""}
          <p>${description}</p>
        `;
      }
    } else {
      // Community posts (original logic)
      const author = item.author || "Community";
      const category = item.category || "General";
      const title = item.title ?? item.heading ?? "";
      const content = item.content ?? item.description ?? item.summary ?? item.body ?? "Stay tuned for more details.";

      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
          <div>${author}</div>
          <div style="background:#eee; padding:2px 6px; border-radius:3px;">${category}</div>
        </div>
        ${title ? `<h3>${title}</h3>` : ""}
        <p>${content}</p>
      `;
    }

    container.appendChild(card);
  });
}


// Load everything when the page is ready
document.addEventListener("DOMContentLoaded", () => {
  initializeDashboard();
  setupSharePostModal();
});
