// Dashboard widgets are hydrated from the backend API and rendered client-side.
const API_BASE_URL = "http://localhost:3000/api";

// === AI interaction helpers ===
function getUserId() {
  // Adjust if store it differently; this is a safe no-op fallback.
  // Option A: localStorage
  const ls = localStorage.getItem("userId");
  if (ls) return ls;

  // Option B: meta tag injected by backend template (if add it later)
  const meta = document.querySelector('meta[name="user-id"]');
  if (meta && meta.content) return meta.content;

  return null; // guests or unknown
}

async function logEventInteraction(eventId, action) {
  const userId = getUserId();
  if (!userId || !eventId) return; // skip for guests or missing id
  try {
    await fetch(`${API_BASE_URL.replace(/\/api$/, "")}/api/reco/interact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        user_id: String(userId),
        event_id: String(eventId),
        action
      })
    });
  } catch (_) {
    // non-blocking; ignore errors
  }
}

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

function renderCards(container, data, type) {
  container.innerHTML = "";
  data.forEach(item => {
    const card = document.createElement("div");
    card.classList.add(type === "news" ? "event-card" : "post-card");


    // ✅ Attach the event/post id when present so we can log interactions
    // backend returns `id` for events/community posts. If it's a different key, map it here.
    if (item && (item.id || item.event_id || item.post_id)) {
      const evtId = String(item.id ?? item.event_id ?? item.post_id);
      card.setAttribute("data-event-id", evtId);
      // log 'view' when the card is visible
      _aiViewObserver.observe(card);
      // log 'click' if the card is clicked (can refine to specific buttons if add them)
      card.addEventListener("click", (ev) => {
        // Avoid double-firing if user clicks on a link; still harmless if it does
        logEventInteraction(evtId, "click");
      });
    }
    
    if (type === "news") {
      const publishedLabel = item.publishedAt
        ? new Date(item.publishedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
        : "";
      const authorLabel = item.author ? `<span class="news-author">${item.author}</span>` : "";
      const meta = [authorLabel, publishedLabel].filter(Boolean).join(" • ");
      const description = sanitizeText(
        item.desc ?? item.description ?? item.summary ?? item.body,
        "Details coming soon."
      );
      card.innerHTML = `
        ${item.bannerBase64 ? `<img src="${item.bannerBase64}" class="banner-img"/>` : ""}
        <h3>${item.title}</h3>
        ${meta ? `<div class="news-meta">${meta}</div>` : ""}
        <p>${description}</p>
        <p><p>
      `;
    } else {
      const author = item.author || "Community";
      const category = item.category || "General";
      const title = sanitizeText(item.title ?? item.heading ?? "");
      const content = sanitizeText(
        item.content ?? item.description ?? item.summary ?? item.body,
        "Stay tuned for more details."
      );
      card.innerHTML = `
        <div class="post-header">
          <div class="post-author">${author}</div>
          <div class="category-badge">${category}</div>
        </div>
        ${title ? `<h3 class="post-title">${title}</h3>` : ""}
        <p class="post-content">${content}</p>
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

function formatPollDeadline(deadline) {
  if (!deadline) return "No deadline";
  const parsed = new Date(deadline);
  if (Number.isNaN(parsed.getTime())) {
    return deadline;
  }
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function normalizePollOption(option, index) {
  const rawVotes =
    typeof option.voteCount === "number" && Number.isFinite(option.voteCount)
      ? option.voteCount
      : typeof option.votes === "number" && Number.isFinite(option.votes)
        ? option.votes
        : 0;
  const voteCount = Math.max(0, Math.round(rawVotes));
  const rawPercent =
    typeof option.percent === "number" && !Number.isNaN(option.percent)
      ? option.percent
      : null;

  return {
    ...option,
    name: sanitizeText(option.name ?? option.label ?? option.option ?? `Option ${index + 1}`),
    voteCount,
    percent: rawPercent
  };
}

function buildClientPoll(poll, fallbackId) {
  const rawOptions = Array.isArray(poll?.options) ? poll.options : [];
  const normalizedOptions = rawOptions.map((option, index) => normalizePollOption(option, index));

  const roundedTotal =
    typeof poll.totalVotes === "number" && Number.isFinite(poll.totalVotes)
      ? Math.max(0, Math.round(poll.totalVotes))
      : null;

  const votesFromOptions = normalizedOptions.reduce((sum, option) => sum + (option.voteCount || 0), 0);
  const totalVotes = roundedTotal !== null ? roundedTotal : votesFromOptions;

  const optionsWithPercentages = normalizedOptions.map((option) => {
    if (option.percent !== null) {
      const bounded = Math.min(Math.max(Math.round(option.percent), 0), 100);
      return { ...option, percent: bounded };
    }

    const computedPercent = totalVotes > 0 ? Math.round((option.voteCount / totalVotes) * 100) : 0;
    return { ...option, percent: computedPercent };
  });

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
  if (!pollCard) {
    return;
  }

  const totalVotesLabel = pollCard.querySelector(".poll-footer span");
  if (totalVotesLabel) {
    totalVotesLabel.textContent = `👥 ${poll.totalVotes} total votes`;
  }

  const optionNodes = pollCard.querySelectorAll(".poll-option");
  poll.options.forEach((option, index) => {
    const optionNode = optionNodes[index];
    if (!optionNode) {
      return;
    }

    const percentLabel = optionNode.querySelector(".option-label span:last-child");
    if (percentLabel) {
      percentLabel.textContent = `${option.percent}%`;
    }

    const progressFill = optionNode.querySelector(".progress-fill");
    if (progressFill) {
      progressFill.style.width = `${option.percent}%`;
    }
  });
}

function handleSimulatedVote(poll, pollCard) {
  if (!poll || !Array.isArray(poll.options) || poll.options.length === 0) {
    window.alert("Voting is unavailable for this poll right now.");
    return;
  }

  if (!Number.isFinite(poll.totalVotes)) {
    poll.totalVotes = poll.options.reduce((sum, option) => sum + (option.voteCount || 0), 0);
  }

  const optionsList = poll.options.map((option, index) => `${index + 1}. ${option.name}`).join("\n");
  const response = window.prompt(
    `Cast your vote for "${poll.title}" by entering an option number:\n${optionsList}`,
    "1"
  );

  if (response === null) {
    return;
  }

  const trimmed = response.trim();
  const selectedIndex = Number(trimmed) - 1;
  if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= poll.options.length) {
    window.alert("Please enter a valid option number from the list.");
    return;
  }

  const selectedOption = poll.options[selectedIndex];
  selectedOption.voteCount += 1;
  poll.totalVotes += 1;

  poll.options.forEach((option) => {
    option.percent = poll.totalVotes > 0 ? Math.round((option.voteCount / poll.totalVotes) * 100) : 0;
  });

  updatePollCardFromState(pollCard, poll);
  window.alert(`Thanks for voting for "${selectedOption.name}"!`);
}

function initializePolls(polls = []) {
  const container = document.getElementById("pollContainer");
  const dots = document.getElementById("pollDots");
  const prevBtn = document.getElementById("prevPollBtn");
  const nextBtn = document.getElementById("nextPollBtn");
  const pollCount = document.getElementById("pollCount");

  if (!container || !dots) {
    return;
  }

  const incomingPolls = Array.isArray(polls) ? polls : [];

  if (pollCount) {
    const count = incomingPolls.length;
    pollCount.textContent = `${count} Active ${count === 1 ? "Poll" : "Polls"}`;
  }

  if (incomingPolls.length === 0) {
    setEmpty(container, "No active polls right now.");
    dots.innerHTML = "";
    if (prevBtn) prevBtn.setAttribute("disabled", "disabled");
    if (nextBtn) nextBtn.setAttribute("disabled", "disabled");
    return;
  }

  container.innerHTML = "";

  incomingPolls.forEach((poll, index) => {
    const clientPoll = buildClientPoll(poll, `poll-${index + 1}`);
    const pollCard = document.createElement("div");
    pollCard.classList.add("poll-card");

    const deadline = formatPollDeadline(clientPoll.deadline);
    const totalVotes = Number.isFinite(clientPoll.totalVotes) ? clientPoll.totalVotes : 0;
    const options = Array.isArray(clientPoll.options) ? clientPoll.options : [];
    const description = clientPoll.description;

    pollCard.innerHTML = `
      <div class="poll-header">
        <div class="poll-icon">📈</div>
        <div>
          <div class="poll-title">${clientPoll.title}</div>
          <div class="poll-subtitle">${options.length} option${options.length === 1 ? "" : "s"} available</div>
        </div>
        <div class="poll-deadline" style="margin-left:auto; color:#b33a3a; font-size:0.85rem;">
          🗓 Ends ${deadline}
        </div>
      </div>
      ${description ? `<p class="poll-description">${description}</p>` : ""}
      <div class="poll-options">
        ${options.length > 0
          ? options
              .map((opt) => {
                const percent = typeof opt.percent === "number" && !Number.isNaN(opt.percent) ? opt.percent : 0;
                return `
                  <div class="poll-option">
                    <div class="option-label">
                      <span>${opt.name}</span>
                      <span>${percent}%</span>
                    </div>
                    <div class="progress-bar">
                      <div class="progress-fill" style="width:${percent}%;"></div>
                    </div>
                  </div>
                `;
              })
              .join("")
          : '<div class="empty-state">Poll options coming soon.</div>'}
      </div>
      <div class="poll-footer">
        <span>👥 ${totalVotes} total votes</span>
        <button class="vote-btn">Vote Now</button>
      </div>
    `;

    container.appendChild(pollCard);

    updatePollCardFromState(pollCard, clientPoll);

    const voteBtn = pollCard.querySelector(".vote-btn");
    if (voteBtn) {
      voteBtn.addEventListener("click", () => handleSimulatedVote(clientPoll, pollCard));
    }
  });

  renderDots(dots, incomingPolls.length);
  setupNavigation(prevBtn, nextBtn, container, dots);
}

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

function resolveCalendarColor(type) {
  const normalizedType = type || "event";
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

function updateCalendarLegend() {
  const legend = document.querySelector(".calendar-legend");
  if (!legend) {
    return;
  }

  const entries = Object.entries(calendarState.typeColors);
  if (entries.length === 0) {
    legend.innerHTML = '<span class="legend-empty">Event types will appear here.</span>';
    return;
  }

  legend.innerHTML = entries
    .map(
      ([type, color]) => `
        <span>
          <span class="dot" style="background-color:${color};"></span>
          ${formatCalendarTypeLabel(type)}
        </span>
      `
    )
    .join("");
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

    eventsToday.forEach((event) => {
      const dot = document.createElement("div");
      dot.classList.add("dot");
      dot.style.backgroundColor = resolveCalendarColor(event.type);
      dot.title = event.time ? `${event.title} — ${event.time}` : event.title;
      dotsContainer.appendChild(dot);
    });

    if (eventsToday.length === 0) {
      dotsContainer.classList.add("empty");
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

  nameEl.textContent = data.name;
  monthEl.textContent = data.month ? `${formatSpotlightMonth(data.month)} Spotlight` : "Student Spotlight";
  pointsEl.textContent = data.points ? `${data.points} points earned` : "";
  awardEl.textContent = data.award || "";
  descriptionEl.textContent = data.description || "";
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

function loadRewardPoints(reward) {
  const pointsEl = document.getElementById("rewardPoints");
  const progressEl = document.getElementById("rewardProgress");

  if (!pointsEl || !progressEl) return;

  if (!reward) {
    pointsEl.textContent = "0 Points";
    progressEl.textContent = "";
    return;
  }

  const points =
    reward.points ??
    (reward.currentUser && reward.currentUser.points !== undefined ? reward.currentUser.points : 0);
  const progress =
    reward.progress ??
    (reward.currentUser && reward.currentUser.progress !== undefined ? reward.currentUser.progress : "");

  pointsEl.textContent = `${points} Points`;
  progressEl.textContent = progress || "";
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
    // const params = new URLSearchParams();
    // Object.entries(DASHBOARD_LIMITS).forEach(([key, value]) => {
    //   if (value !== undefined && value !== null) {
    //     params.append(key, value);
    //   }
    // });

    const response = await fetch(`${API_BASE_URL}/dashboard`, {
      // credentials: "include"
    });
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const data = await response.json();

    initializeNews(data.competitions || []);
    initializeCommunityHighlights(data.events || []);
    initializePolls(data.polls || []);
    initializeCalendar(data.calendar || []);

    const spotlight = Array.isArray(data.spotlights) ? data.spotlights[0] : null;
    loadStudentSpotlight(spotlight);

    loadRewardPoints(data.rewardLeaders || null);
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
function setupSharePostModal() {
  const shareModal = document.getElementById("sharePostModal");
  const openShareModalBtn = document.getElementById("createPost");
  const closeShareModalBtn = document.getElementById("closeShareModal");
  const cancelPostBtn = document.getElementById("cancelPostBtn");
  const form = document.getElementById("sharePostForm");
  const photoInput = document.getElementById("postPhoto");

  if (!shareModal || !form) {
    return;
  }

  const openModal = (event) => {
    if (event) {
      event.preventDefault();
    }
    shareModal.classList.remove("hidden");
  };

  const closeModal = () => {
    shareModal.classList.add("hidden");
  };

  if (openShareModalBtn) {
    openShareModalBtn.addEventListener("click", openModal);
  }

  if (closeShareModalBtn) {
    closeShareModalBtn.addEventListener("click", closeModal);
  }

  if (cancelPostBtn) {
    cancelPostBtn.addEventListener("click", closeModal);
  }

  if (photoInput) {
    photoInput.setAttribute("disabled", "disabled");
    photoInput.setAttribute("aria-disabled", "true");
    photoInput.title = "Image uploads are not supported yet.";

    const photoGroup = photoInput.closest(".form-group, .input-group, label");
    if (photoGroup && !photoGroup.querySelector(".form-helper-text")) {
      const helper = document.createElement("p");
      helper.className = "form-helper-text";
      helper.textContent = "Image uploads are not supported yet.";
      photoGroup.appendChild(helper);
    }
  }

  window.addEventListener("click", (event) => {
    if (event.target === shareModal) {
      closeModal();
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const title = document.getElementById("postTitle")?.value.trim();
    const category = document.getElementById("postCategory")?.value;
    const tags = document.getElementById("postTags")?.value.trim();
    const description = document.getElementById("postDescription")?.value.trim();

    if (!title || !description) {
      alert("Please fill out the required fields.");
      return;
    }

    try {
      const payload = {
        title,
        category: category || "General",
        tags: tags || "",
        description
      };

      const response = await fetch(`${API_BASE_URL}/community-posts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "include",
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error("Failed to share post");
      }

      alert("✅ Post shared successfully!");
      closeModal();
      form.reset();
    } catch (error) {
      console.error("Error sharing post:", error);
      alert(`❌ Error: ${error.message}`);
    }
  });
}

// Load everything when the page is ready
document.addEventListener("DOMContentLoaded", () => {
  initializeDashboard();
  setupSharePostModal();
});
