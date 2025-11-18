// Dashboard widgets are hydrated from the backend API and rendered client-side.
const API_BASE_URL = "http://localhost:3000/api";
const LOGIN_PAGE_PATH = "/Frontend/index.html";

let _authRedirectInProgress = false;

const registrationState = {
  events: new Set(),
  competitions: new Set()
};

const EVENT_JOIN_SELECTOR = '[data-join-event-id]';

function updateJoinButtonState(button, joined) {
  if (!button) return;
  if (joined) {
    button.dataset.joined = 'true';
    button.classList.add('joined');
    button.textContent = 'Joined';
  } else {
    button.dataset.joined = 'false';
    button.classList.remove('joined');
    button.textContent = 'Join Event';
  }
}

function refreshRegistrationButtons() {
  document.querySelectorAll(EVENT_JOIN_SELECTOR).forEach((button) => {
    const eventId = button.getAttribute('data-join-event-id');
    updateJoinButtonState(button, registrationState.events.has(String(eventId)));
  });
}

function resolveLoginUrl() {
  try {
    return new URL(LOGIN_PAGE_PATH, window.location.origin).href;
  } catch (error) {
    console.warn("Unable to resolve login URL, falling back to relative path.", error);
    return LOGIN_PAGE_PATH;
  }
}

function redirectToLogin(reason) {
  if (_authRedirectInProgress) {
    return;
  }
  _authRedirectInProgress = true;
  if (reason) {
    console.warn(reason);
  }
  try {
    localStorage.removeItem("musAuthToken");
    localStorage.removeItem("musAuthUser");
    localStorage.removeItem("userId");
  } catch (error) {
    console.warn("Unable to clear auth storage during redirect.", error);
  }
  window.location.href = resolveLoginUrl();
}

function getStoredAuthToken() {
  try {
    return localStorage.getItem("musAuthToken");
  } catch (error) {
    console.warn("Unable to access auth token in storage.", error);
    return null;
  }
}

function requireAuthToken() {
  const token = getStoredAuthToken();
  if (!token) {
    redirectToLogin("Missing authentication token. Redirecting to sign in.");
    return null;
  }
  return token;
}

function buildAuthHeaders({ token, json = false } = {}) {
  const headers = {};
  if (json) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function handleUnauthorizedResponse(message) {
  redirectToLogin(message || "Session expired. Please sign in again.");
}

// === AI interaction helpers ===
function getUserId() {
  // Option A: stored auth payload
  const rawAuthUser = localStorage.getItem("musAuthUser");
  if (rawAuthUser) {
    try {
      const parsed = JSON.parse(rawAuthUser);
      if (parsed && parsed.id != null) {
        return String(parsed.id);
      }
    } catch (_) {
      // fall through to other strategies
    }
  }
  // Adjust if store it differently; this is a safe no-op fallback.
  // Option B: localStorage
  const ls = localStorage.getItem("userId");
  if (ls) return ls;

  // Option C: meta tag injected by backend template (if add it later)
  const meta = document.querySelector('meta[name="user-id"]');
  if (meta && meta.content) return meta.content;

  return null; // guests or unknown
}

async function logEventInteraction(eventId, action) {
  const userId = getUserId();
  if (!userId || !eventId) return; // skip for guests or missing id
  const token = getStoredAuthToken();
  if (!token) {
    return;
  }
  try {
      const response = await fetch(`${API_BASE_URL.replace(/\/api$/, "")}/api/reco/interact`, {
      method: "POST",
      headers: buildAuthHeaders({ token, json: true }),
      credentials: "include",
      body: JSON.stringify({
        user_id: String(userId),
        event_id: String(eventId),
        action
      })
    });
      if (response.status === 401) {
        handleUnauthorizedResponse("Interaction logging is unauthorized. Redirecting to sign in.");
      }
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

function formatEventSchedule(startTime, endTime) {
  if (!startTime) {
    return "";
  }
  const startDate = new Date(startTime);
  if (Number.isNaN(startDate.getTime())) {
    return "";
  }
  const startLabel = startDate.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });

  if (!endTime) {
    return startLabel;
  }

  const endDate = new Date(endTime);
  if (Number.isNaN(endDate.getTime())) {
    return startLabel;
  }

  const sameDay = startDate.toDateString() === endDate.toDateString();
  const endLabel = endDate.toLocaleString(undefined, sameDay
    ? { hour: "numeric", minute: "2-digit" }
    : { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
  );
  return sameDay ? `${startLabel} – ${endLabel}` : `${startLabel} – ${endLabel}`;
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
        <h3>${item.title}</h3>
        ${meta ? `<div class="news-meta">${meta}</div>` : ""}
        <p>${description}</p>
      `;
    } else {
    const author = item.author || "Community";
    const category = item.category || "General";
    const title = sanitizeText(item.title ?? item.heading ?? "");
    const content = sanitizeText(
      item.content ?? item.description ?? item.summary ?? item.body,
      "Stay tuned for more details."
    );
    const isCampusEvent = Boolean(item.start_time);

    if (isCampusEvent) {
      const eventId = String(item.id ?? "");
      const schedule = formatEventSchedule(item.start_time, item.end_time);
      const location = sanitizeText(item.location ?? "");
      card.classList.add('campus-event-card');
      card.innerHTML = `
        <div class="post-header">
          <div class="post-author">${author}</div>
          <div class="category-badge">${category}</div>
        </div>
        ${title ? `<h3 class="post-title">${title}</h3>` : ""}
        ${schedule ? `<p class="event-schedule">🗓️ ${schedule}</p>` : ""}
        ${location ? `<p class="event-location">📍 ${location}</p>` : ""}
        <p class="post-content">${content}</p>
        <div class="event-actions">
          <button type="button" class="join-event-btn" data-join-event-id="${eventId}">Join Event</button>
        </div>
      `;
      const joinButton = card.querySelector('.join-event-btn');
      if (joinButton) {
        updateJoinButtonState(joinButton, registrationState.events.has(eventId));
        joinButton.addEventListener('click', (event) => {
          event.stopPropagation();
          handleEventJoinToggle(eventId, joinButton);
        });
      }
    } else {
      card.innerHTML = `
        <div class="post-header">
          <div class="post-author">${author}</div>
          <div class="category-badge">${category}</div>
        </div>
        ${title ? `<h3 class="post-title">${title}</h3>` : ""}
        <p class="post-content">${content}</p>
      `;
    }
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

async function registerForEvent(eventId) {
  const token = requireAuthToken();
  if (!token) {
    throw new Error('Authentication required.');
  }

  const response = await fetch(`${API_BASE_URL}/events/${encodeURIComponent(eventId)}/register`, {
    method: 'POST',
    headers: buildAuthHeaders({ token }),
    credentials: 'include'
  });

  if (response.status === 401) {
    handleUnauthorizedResponse('Session expired while joining this event.');
    throw new Error('Session expired.');
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message || 'Unable to register for this event.');
  }
  return payload;
}

async function unregisterFromEvent(eventId) {
  const token = requireAuthToken();
  if (!token) {
    throw new Error('Authentication required.');
  }

  const response = await fetch(`${API_BASE_URL}/events/${encodeURIComponent(eventId)}/register`, {
    method: 'DELETE',
    headers: buildAuthHeaders({ token }),
    credentials: 'include'
  });

  if (response.status === 401) {
    handleUnauthorizedResponse('Session expired while leaving this event.');
    throw new Error('Session expired.');
  }

  if (response.status === 404) {
    return null;
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message || 'Unable to update your registration right now.');
  }
  return payload;
}

async function handleEventJoinToggle(eventId, button) {
  if (!eventId || !button) {
    return;
  }

  const joined = registrationState.events.has(String(eventId));
  button.disabled = true;
  button.textContent = joined ? 'Leaving…' : 'Joining…';

  try {
    if (joined) {
      await unregisterFromEvent(eventId);
    } else {
      await registerForEvent(eventId);
    }
    await refreshUserCalendarItems({ silent: true });
  } catch (error) {
    console.error('Failed to update event registration', error);
    alert(error?.message || 'Unable to update your registration right now.');
  } finally {
    button.disabled = false;
    refreshRegistrationButtons();
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
  baseItems: [],
  userItems: [],
  currentDate: new Date(),
  typeColors: {},
  initialized: false
};

let userCalendarItems = [];

function syncRegistrationStateFromCalendar() {
  registrationState.events.clear();
  registrationState.competitions.clear();

  userCalendarItems.forEach((item) => {
    if (!item || !item.source_type || item.source_id == null) {
      return;
    }
    const sourceId = String(item.source_id);
    if (item.source_type === 'event') {
      registrationState.events.add(sourceId);
    } else if (item.source_type === 'competition') {
      registrationState.competitions.add(sourceId);
    }
  });

  refreshRegistrationButtons();
}

const CALENDAR_COLOR_PALETTE = [
  "#22c55e",
  "#ef4444",
  "#a855f7",
  "#3b82f6",
  "#f97316",
  "#0ea5e9",
  "#facc15"
];

const MAX_VISIBLE_CALENDAR_EVENTS = 3;

function applyAlphaToColor(hexColor, alpha = 0.2) {
  if (!hexColor || typeof hexColor !== "string" || !hexColor.startsWith("#")) {
    return hexColor;
  }

  let hex = hexColor.slice(1);
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((char) => char + char)
      .join("");
  }

  const numeric = Number.parseInt(hex, 16);
  if (Number.isNaN(numeric)) {
    return hexColor;
  }

  const r = (numeric >> 16) & 255;
  const g = (numeric >> 8) & 255;
  const b = numeric & 255;

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

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

  const categories = Array.isArray(calendarState.items)
    ? Array.from(new Set(calendarState.items.map((item) => item.type || item.category || "event")))
    : [];

  legend.innerHTML = "";

  const placeholder = document.createElement("span");
  placeholder.className = "legend-empty";
  placeholder.textContent = "Event types will appear here.";
  legend.appendChild(placeholder);

  if (categories.length === 0) {
    return;
  }

  categories.forEach((type) => {
    const color = resolveCalendarColor(type);
    const wrapper = document.createElement("span");

    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.backgroundColor = color;

    const label = document.createElement("span");
    label.textContent = formatCalendarTypeLabel(type);

    wrapper.appendChild(dot);
    wrapper.appendChild(label);
    legend.appendChild(wrapper);
  });
}

function renderCalendar() {
  const monthYear = document.getElementById("monthYear");
  const grid = document.getElementById("calendarGrid");

  if (!monthYear || !grid) {
    return;
  }

  const { currentDate, items } = calendarState;
  const calendarItems = Array.isArray(items) ? items : [];

  grid.innerHTML = "";

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const hasItems = calendarItems.length > 0;

  monthYear.textContent = currentDate.toLocaleString("default", { month: "long", year: "numeric" });

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  let emptyBanner = document.getElementById("calendarEmptyBanner");
  if (!emptyBanner) {
    emptyBanner = document.createElement("div");
    emptyBanner.id = "calendarEmptyBanner";
    emptyBanner.classList.add("empty-state", "calendar-empty-banner");
    grid.insertAdjacentElement("afterend", emptyBanner);
  }
  emptyBanner.textContent = "No events on the calendar yet.";
  emptyBanner.style.display = hasItems ? "none" : "block";

  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement("div");
    empty.classList.add("day", "placeholder");
    grid.appendChild(empty);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let day = 1; day <= daysInMonth; day++) {
    const cell = document.createElement("div");
    cell.classList.add("day");
    cell.setAttribute("role", "gridcell");
    cell.tabIndex = 0;

    const dateLabel = document.createElement("div");
    dateLabel.classList.add("date");
    dateLabel.textContent = day;

    const dotsContainer = document.createElement("div");
    dotsContainer.classList.add("indicators");
    dotsContainer.setAttribute("aria-hidden", "true");

    const fullDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const eventsToday = calendarItems.filter((item) => item.date === fullDate);
    const cellDate = new Date(year, month, day);

    if (cellDate.toDateString() === today.toDateString()) {
      cell.classList.add("today");
    }

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

    if (eventsToday.length > 0) {
      const accentColor = resolveCalendarColor(eventsToday[0].type);
      cell.classList.add("has-events");
      cell.style.setProperty("--event-accent", applyAlphaToColor(accentColor, 0.35));
      cell.dataset.eventCount = eventsToday.length;

      const chipsWrapper = document.createElement("div");
      chipsWrapper.classList.add("event-chips");

      eventsToday.slice(0, MAX_VISIBLE_CALENDAR_EVENTS).forEach((event) => {
        const color = resolveCalendarColor(event.type);
        const chip = document.createElement("div");
        chip.classList.add("event-chip");
        chip.style.setProperty("--chip-color", color);
        chip.style.backgroundColor = applyAlphaToColor(color, 0.15);
        chip.style.borderColor = applyAlphaToColor(color, 0.4);
        chip.style.borderLeftColor = color;
        chip.title = event.time ? `${event.title} — ${event.time}` : event.title;

        const chipDot = document.createElement("span");
        chipDot.classList.add("chip-dot");
        chipDot.style.backgroundColor = color;

        const chipTitle = document.createElement("span");
        chipTitle.classList.add("chip-title");
        chipTitle.textContent = event.title;

        chip.appendChild(chipDot);
        chip.appendChild(chipTitle);

        if (event.time) {
          const chipTime = document.createElement("span");
          chipTime.classList.add("chip-time");
          chipTime.textContent = event.time;
          chip.appendChild(chipTime);
        }

        chipsWrapper.appendChild(chip);
      });

      if (eventsToday.length > MAX_VISIBLE_CALENDAR_EVENTS) {
        const moreChip = document.createElement("div");
        moreChip.classList.add("event-chip", "more-chip");
        moreChip.textContent = `+${eventsToday.length - MAX_VISIBLE_CALENDAR_EVENTS} more`;
        chipsWrapper.appendChild(moreChip);
      }

      cell.appendChild(chipsWrapper);
    } else {
      cell.classList.add("no-events");
      const freeLabel = document.createElement("div");
      freeLabel.classList.add("free-day");
      freeLabel.textContent = "No events";
      cell.appendChild(freeLabel);
    }

    const ariaDate = cellDate.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric"
    });
    const ariaSummary =
      eventsToday.length === 0
        ? "No events scheduled."
        : `${eventsToday.length} ${eventsToday.length === 1 ? "event" : "events"}: ${eventsToday
            .map((event) => event.title)
            .join(", ")}.`;
    cell.setAttribute("aria-label", `${ariaDate}. ${ariaSummary}`);

    grid.appendChild(cell);
  }

  updateCalendarLegend();
}

const isUserCalendarItem = (item) => typeof item?.id === "string" && item.id.startsWith("user-calendar-");

function normalizeCalendarItems(items = []) {
  return Array.isArray(items)
    ? items
        .map((item) => ({
          ...item,
          date: item.date ?? "",
          type: (item.type || item.category || "event").toLowerCase()
        }))
        .filter((item) => item.date)
    : [];
}

function mapUserCalendarItemForCalendar(item = {}) {
  const category = item.category || item.source_type || "event";
  return {
    id: `user-calendar-${item.id}`,
    title: item.title || "Calendar Item",
    date: item.date || "",
    time: item.time || "",
    category,
    type: (category || "event").toLowerCase(),
    source_type: item.source_type,
    source_id: item.source_id
  };
}

function syncCalendarItems() {
  calendarState.items = [...calendarState.baseItems, ...calendarState.userItems];
  renderCalendar();
}

function initializeCalendar(items = []) {
  const prevMonthBtn = document.getElementById("prevMonth");
  const nextMonthBtn = document.getElementById("nextMonth");
  const monthYear = document.getElementById("monthYear");
  const grid = document.getElementById("calendarGrid");

  if (!monthYear || !grid) {
    return;
  }

  const normalizedItems = normalizeCalendarItems(items);
  calendarState.baseItems = normalizedItems.filter((item) => !isUserCalendarItem(item));
  calendarState.userItems = normalizedItems.filter((item) => isUserCalendarItem(item));

  calendarState.currentDate = new Date();
  calendarState.typeColors = {};

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

  syncCalendarItems();
}

const getCalendarSortTimestamp = (item) => {
  if (!item?.date) {
    return Number.POSITIVE_INFINITY;
  }
  const dateTime = `${item.date}T${item.time ? `${item.time}:00` : '00:00:00'}`;
  const parsed = new Date(dateTime);
  return Number.isNaN(parsed.valueOf()) ? Number.POSITIVE_INFINITY : parsed.valueOf();
};

function formatCalendarItemDate(date, time, category) {
  if (!date) {
    return category ? `Date TBD • ${category}` : 'Date to be announced';
  }

  const parsedDate = new Date(`${date}T00:00:00`);
  const readableDate = Number.isNaN(parsedDate.valueOf())
    ? date
    : parsedDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  const timeLabel = time ? time : 'All day';
  const categoryLabel = category ? ` • ${category}` : '';
  return `${readableDate} · ${timeLabel}${categoryLabel}`;
}

function renderCalendarItemsList() {
  const listEl = document.getElementById('calendarItemsList');
  if (!listEl) {
    return;
  }

  listEl.querySelectorAll('.calendar-item-row, .empty-state').forEach((node) => node.remove());

  if (!Array.isArray(userCalendarItems) || userCalendarItems.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'Add your first custom reminder to see it here.';
    listEl.appendChild(empty);
    return;
  }

  const sortedItems = [...userCalendarItems].sort((a, b) => getCalendarSortTimestamp(a) - getCalendarSortTimestamp(b));

  sortedItems.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'calendar-item-row';

    const meta = document.createElement('div');
    meta.className = 'calendar-item-meta';

    const titleEl = document.createElement('p');
    titleEl.className = 'calendar-item-title';
    titleEl.textContent = item.title || 'Calendar item';
    meta.appendChild(titleEl);

    const detailsEl = document.createElement('p');
    detailsEl.className = 'calendar-item-details';
    detailsEl.textContent = formatCalendarItemDate(item.date, item.time, item.category || item.source_type);
    meta.appendChild(detailsEl);

    const actions = document.createElement('div');
    actions.className = 'calendar-item-actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'edit-btn';
    editBtn.dataset.calendarAction = 'edit';
    editBtn.dataset.itemId = String(item.id);
    editBtn.textContent = 'Edit';
    actions.appendChild(editBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'danger';
    deleteBtn.dataset.calendarAction = 'delete';
    deleteBtn.dataset.itemId = String(item.id);
    deleteBtn.textContent = 'Delete';
    actions.appendChild(deleteBtn);

    row.appendChild(meta);
    row.appendChild(actions);
    listEl.appendChild(row);
  });
}

async function refreshUserCalendarItems({ silent = false } = {}) {
  try {
    const token = requireAuthToken();
    if (!token) {
      return;
    }

    const response = await fetch(`${API_BASE_URL}/calendar`, {
      headers: buildAuthHeaders({ token }),
      credentials: 'include'
    });

    if (response.status === 401) {
      handleUnauthorizedResponse('Session expired while loading calendar items.');
      return;
    }

    if (!response.ok) {
      throw new Error('Failed to load calendar items');
    }

    const data = await response.json();
    userCalendarItems = Array.isArray(data.items) ? data.items : [];
    syncRegistrationStateFromCalendar();
    calendarState.userItems = userCalendarItems.map((item) => mapUserCalendarItemForCalendar(item));
    syncCalendarItems();
    renderCalendarItemsList();
  } catch (error) {
    console.error('Failed to refresh calendar items', error);
    if (!silent) {
      alert('Unable to load your personal calendar items right now.');
    }
  }
}

function setupCalendarModal() {
  const modal = document.getElementById('calendarModal');
  const openBtn = document.getElementById('openCalendarModal');
  const closeBtn = document.getElementById('closeCalendarModal');
  const cancelBtn = document.getElementById('calendarCancelBtn');
  const form = document.getElementById('calendarForm');
  const titleInput = document.getElementById('calendarTitle');
  const dateInput = document.getElementById('calendarDate');
  const timeInput = document.getElementById('calendarTime');
  const categoryInput = document.getElementById('calendarCategory');
  const idInput = document.getElementById('calendarItemId');
  const modalTitle = document.getElementById('calendarModalTitle');
  const saveBtn = document.getElementById('calendarSaveBtn');
  const itemsList = document.getElementById('calendarItemsList');

  if (!modal || !openBtn || !closeBtn || !form) {
    return;
  }

  let feedbackRow = null;
  let confirmRow = null;
  let feedbackTimer = null;
  let pendingDeleteId = null;

  const ensureFeedbackRow = () => {
    if (!itemsList) {
      return null;
    }
    if (!feedbackRow) {
      feedbackRow = document.createElement('div');
      feedbackRow.className = 'calendar-feedback-row calendar-status-row hidden status-info';
      feedbackRow.innerHTML = `
        <div class="calendar-feedback-content">
          <p class="calendar-feedback-message"></p>
        </div>
        <button type="button" class="calendar-feedback-dismiss" aria-label="Dismiss message">&times;</button>
      `;
      const dismissBtn = feedbackRow.querySelector('.calendar-feedback-dismiss');
      dismissBtn.addEventListener('click', () => hideFeedback());
      itemsList.prepend(feedbackRow);
    }
    return feedbackRow;
  };

  const clearFeedbackTimer = () => {
    if (feedbackTimer) {
      clearTimeout(feedbackTimer);
      feedbackTimer = null;
    }
  };

  const hideFeedback = () => {
    clearFeedbackTimer();
    if (feedbackRow) {
      feedbackRow.classList.add('hidden');
    }
  };

  const showFeedback = (message, type = 'info', { persistent = false } = {}) => {
    const row = ensureFeedbackRow();
    if (!row) {
      return;
    }
    clearFeedbackTimer();
    row.classList.remove('status-info', 'status-success', 'status-error');
    row.classList.add(`status-${type}`);
    const messageEl = row.querySelector('.calendar-feedback-message');
    if (messageEl) {
      messageEl.textContent = message;
    }
    row.classList.remove('hidden');
    if (!persistent) {
      feedbackTimer = window.setTimeout(() => hideFeedback(), 4500);
    }
  };

  const ensureConfirmRow = () => {
    if (!itemsList) {
      return null;
    }
    if (!confirmRow) {
      confirmRow = document.createElement('div');
      confirmRow.className = 'calendar-confirm-row calendar-status-row hidden';
      confirmRow.innerHTML = `
        <p class="calendar-confirm-message"></p>
        <div class="calendar-confirm-actions">
          <button type="button" class="calendar-confirm-cancel" data-confirm-cancel>Keep Event</button>
          <button type="button" class="danger" data-confirm-delete>Delete</button>
        </div>
      `;
      const cancelBtnEl = confirmRow.querySelector('[data-confirm-cancel]');
      const deleteBtnEl = confirmRow.querySelector('[data-confirm-delete]');
      cancelBtnEl?.addEventListener('click', () => {
        hideDeleteConfirmation();
      });
      deleteBtnEl?.addEventListener('click', () => {
        if (pendingDeleteId) {
          handleDelete(pendingDeleteId);
        }
      });
      itemsList.prepend(confirmRow);
    }
    return confirmRow;
  };

  const hideDeleteConfirmation = () => {
    const row = ensureConfirmRow();
    if (!row) {
      return;
    }
    const deleteBtnEl = row.querySelector('[data-confirm-delete]');
    deleteBtnEl?.removeAttribute('disabled');
    row.classList.add('hidden');
    pendingDeleteId = null;
  };

  const showDeleteConfirmation = (itemId) => {
    const row = ensureConfirmRow();
    if (!row) {
      return;
    }
    pendingDeleteId = itemId;
    const item = userCalendarItems.find((calendarItem) => String(calendarItem.id) === String(itemId));
    const title = item?.title || 'this event';
    const messageEl = row.querySelector('.calendar-confirm-message');
    if (messageEl) {
      messageEl.textContent = `Delete "${title}"? This can't be undone.`;
    }
    const deleteBtnEl = row.querySelector('[data-confirm-delete]');
    deleteBtnEl?.removeAttribute('disabled');
    row.classList.remove('hidden');
  };

  const resetInlineNotices = () => {
    hideFeedback();
    hideDeleteConfirmation();
  };

  const setDefaultDate = () => {
    if (dateInput) {
      const today = new Date();
      today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
      dateInput.value = today.toISOString().slice(0, 10);
    }
  };

  const setFormState = (item = null) => {
    if (!titleInput || !dateInput || !timeInput || !categoryInput) {
      return;
    }
    hideDeleteConfirmation();

    if (item) {
      idInput.value = item.id;
      titleInput.value = item.title || '';
      dateInput.value = item.date || '';
      timeInput.value = item.time || '';
      categoryInput.value = item.category || '';
      modalTitle.textContent = 'Edit Calendar Event';
      saveBtn.textContent = 'Update Event';
    } else {
      idInput.value = '';
      form.reset();
      setDefaultDate();
      modalTitle.textContent = 'Add Custom Event';
      saveBtn.textContent = 'Save Event';
    }
  };

  const closeModal = () => {
    modal.classList.add('hidden');
    setFormState(null);
    resetInlineNotices();
  };

  const openModal = async () => {
    modal.classList.remove('hidden');
    resetInlineNotices();
    renderCalendarItemsList();
    await refreshUserCalendarItems({ silent: false });
    setFormState(null);
  };

  async function handleDelete(itemId) {
    if (!itemId) {
      return;
    }

    const token = requireAuthToken();
    if (!token) {
      return;
    }

    const row = ensureConfirmRow();
    const deleteBtnEl = row?.querySelector('[data-confirm-delete]');
    deleteBtnEl?.setAttribute('disabled', 'disabled');

    try {
      const response = await fetch(`${API_BASE_URL}/calendar/${itemId}`, {
        method: 'DELETE',
        headers: buildAuthHeaders({ token }),
        credentials: 'include'
      });

      if (response.status === 401) {
        handleUnauthorizedResponse('Session expired while deleting a calendar event.');
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to delete calendar event');
      }

      await refreshUserCalendarItems({ silent: false });
      if (idInput.value === String(itemId)) {
        setFormState(null);
      }
      hideDeleteConfirmation();
      showFeedback('Calendar event deleted.', 'success');
    } catch (error) {
      console.error('Unable to delete calendar item', error);
      showFeedback('Unable to delete this event right now.', 'error', { persistent: true });
    } finally {
      deleteBtnEl?.removeAttribute('disabled');
    }
  }

  openBtn.addEventListener('click', () => {
    openModal();
  });
  closeBtn.addEventListener('click', closeModal);
  if (cancelBtn) {
    cancelBtn.addEventListener('click', closeModal);
  }

  window.addEventListener('click', (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });

  if (itemsList) {
    itemsList.addEventListener('click', (event) => {
      const actionBtn = event.target?.closest('button[data-calendar-action]');
      if (!actionBtn) {
        return;
      }

      const itemId = actionBtn.dataset.itemId;
      if (!itemId) {
        return;
      }

      if (actionBtn.dataset.calendarAction === 'edit') {
        const existing = userCalendarItems.find((item) => String(item.id) === String(itemId));
        if (existing) {
          setFormState(existing);
        }
      } else if (actionBtn.dataset.calendarAction === 'delete') {
        showDeleteConfirmation(itemId);
      }
    });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const title = titleInput.value.trim();
    const date = dateInput.value;

    if (!title || !date) {
      showFeedback('Please provide a title and date for your event.', 'error');
      return;
    }

    const payload = {
      title,
      date,
      time: timeInput.value,
      category: categoryInput.value.trim()
    };

    const token = requireAuthToken();
    if (!token) {
      return;
    }

    const editingId = idInput.value ? Number(idInput.value) : null;
    const url = editingId ? `${API_BASE_URL}/calendar/${editingId}` : `${API_BASE_URL}/calendar`;

    try {
      const response = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: buildAuthHeaders({ token, json: true }),
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      if (response.status === 401) {
        handleUnauthorizedResponse('Session expired while saving your calendar event.');
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to save calendar event');
      }

      await response.json();
      await refreshUserCalendarItems({ silent: false });
      setFormState(null);
      showFeedback(editingId ? 'Calendar event updated.' : 'Calendar event added!', 'success');
    } catch (error) {
      console.error('Unable to save calendar event', error);
      showFeedback('Unable to save this event right now.', 'error', { persistent: true });
    }
  });
}

function loadStudentSpotlight(payload) {
  const nameEl = document.getElementById("spotlightName");
  const monthEl = document.getElementById("spotlightMonth");
  const pointsEl = document.getElementById("spotlightPoints");
  const awardEl = document.getElementById("spotlightAward");
  const descriptionEl = document.getElementById("spotlightDescription");
  const highlightListEl = document.getElementById("spotlightHighlightList");
  const highlightEmptyEl = document.getElementById("spotlightHighlightEmpty");

  if (!nameEl || !monthEl || !pointsEl || !awardEl || !descriptionEl) {
    return;
  }

  const highlights = Array.isArray(payload?.highlights) ? payload.highlights : [];
  const personalSpotlight = payload?.personal || null;
  const primarySpotlight = personalSpotlight || highlights[0] || null;
  const inspirationHighlights = personalSpotlight ? highlights : highlights.slice(1);

  if (!primarySpotlight) {
    nameEl.textContent = "Student Spotlight";
    monthEl.textContent = "Community inspiration";
    pointsEl.textContent = "";
    awardEl.textContent = "";
    descriptionEl.textContent = "No spotlight selected.";
    } else {
    const isPersonal = Boolean(personalSpotlight);
    nameEl.textContent = primarySpotlight.name || "Student Spotlight";
    monthEl.textContent = primarySpotlight.month
      ? `${formatSpotlightMonth(primarySpotlight.month)} Spotlight`
      : isPersonal
        ? "Your Spotlight"
        : "Community Spotlight";
    pointsEl.textContent = isPersonal ? "You're being celebrated!" : "Campus inspiration";
    awardEl.textContent = isPersonal ? "Personal Spotlight" : (primarySpotlight.award || "Spotlight");
    descriptionEl.textContent = primarySpotlight.description || "Keep shining bright.";
  }

  if (highlightListEl) {
    highlightListEl.innerHTML = "";
    inspirationHighlights.forEach((item) => {
      const listItem = document.createElement("li");
      listItem.className = "spotlight-highlight-item";

      const name = document.createElement("p");
      name.className = "spotlight-highlight-name";
      name.textContent = item.name || "Student";
      listItem.appendChild(name);

      const metaParts = [item.major, item.classYear].filter(Boolean);
      if (metaParts.length) {
        const meta = document.createElement("p");
        meta.className = "spotlight-highlight-meta";
        meta.textContent = metaParts.join(" • ");
        listItem.appendChild(meta);
      }

      if (item.description) {
        const detail = document.createElement("p");
        detail.className = "spotlight-highlight-detail";
        detail.textContent = item.description;
        listItem.appendChild(detail);
      }

      highlightListEl.appendChild(listItem);
    });
  }

  if (highlightEmptyEl) {
    highlightEmptyEl.style.display = inspirationHighlights.length ? "none" : "block";
  }
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

function formatRewardUpdatedAt(updatedAt) {
  if (!updatedAt) {
    return null;
  }

  const parsedDate = new Date(updatedAt);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function loadRewardPoints(reward) {
  const pointsEl = document.getElementById("rewardPoints");
  const progressEl = document.getElementById("rewardProgress");

  if (!pointsEl || !progressEl) return;

  if (!reward || !reward.currentUser) {
    pointsEl.textContent = "0 Points";
    progressEl.textContent = "Start earning points to unlock rewards.";
    return;
  }

  const currentUser = reward.currentUser;
  const points = typeof currentUser.points === "number" ? currentUser.points : Number(currentUser.points) || 0;
  const fallbackProgress = () => {
    if (points > 0) {
      const formattedDate = formatRewardUpdatedAt(currentUser.updatedAt);
      return formattedDate ? `Last updated ${formattedDate}` : "Lifetime points earned";
    }
    return "Start earning points to unlock rewards.";
  };
  const progress = currentUser.progress || fallbackProgress();

  pointsEl.textContent = `${points} Points`;
  progressEl.textContent = progress;
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
    const params = new URLSearchParams();
    Object.entries(DASHBOARD_LIMITS).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, value);
      }
    });

    const token = requireAuthToken();
    if (!token) {
      return;
    }

    const response = await fetch(`${API_BASE_URL}/dashboard?${params.toString()}`, {
    credentials: "include",
      headers: buildAuthHeaders({ token })
    });
    if (response.status === 401) {
      handleUnauthorizedResponse("Dashboard data request was unauthorized. Redirecting to sign in.");
      return;
    }
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const data = await response.json();

    const campusNews = Array.isArray(data.news) ? data.news : [];
    const campusEvents = Array.isArray(data.campusEvents) ? data.campusEvents : [];
    const communityHighlights = Array.isArray(data.communityHighlights) ? data.communityHighlights : [];

    const newsAndEvents = [...campusNews, ...campusEvents];

    initializeNews(newsAndEvents);
    initializeCommunityHighlights(communityHighlights);
    initializePolls(data.polls || []);
    initializeCalendar(data.calendar || []);

    loadStudentSpotlight(data.spotlights || null);

    loadRewardPoints(data.rewardLeaders || null);

    await refreshUserCalendarItems({ silent: true });
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

      const token = requireAuthToken();
      if (!token) {
        return;
      }

      const response = await fetch(`${API_BASE_URL}/community-posts`, {
        method: "POST",
        headers: buildAuthHeaders({ token, json: true }),
        credentials: "include",
        body: JSON.stringify(payload)
      });

      if (response.status === 401) {
        handleUnauthorizedResponse("Unable to share post because your session expired.");
        return;
      }

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
  setupCalendarModal();
});