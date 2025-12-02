// js/interests.js
// Handles "Declare / Update Interests" UI for student & guest dashboards.

// Resolve API base URL (re-use existing global if present)
const INTERESTS_API_BASE =
  typeof API_BASE_URL !== "undefined"
    ? API_BASE_URL
    : (window.getApiBaseUrl
        ? window.getApiBaseUrl() + "/api"
        : "http://localhost:3000/api");

// Default tags for Student and Guest roles
const DEFAULT_INTEREST_TAGS_STUDENT = [
  "AI & Data Science",
  "Software Development",
  "Cybersecurity",
  "Web Development",
  "Mobile Apps",
  "Cloud & DevOps",
  "Startups & Entrepreneurship",
  "Clubs & Societies",
  "Sports & Fitness",
  "Music & Arts",
  "Volunteering",
  "Career Fairs",
  "Workshops & Seminars"
];

const DEFAULT_INTEREST_TAGS_GUEST = [
  "Open House",
  "Short Courses",
  "Scholarships",
  "Career Talks",
  "Campus Tours",
  "Workshops",
  "Guest Lectures",
  "Networking Events"
];

function getStoredUser() {
  try {
    const raw =
      window.localStorage.getItem("musAuthUser") ||
      (document.cookie.match(/musAuthUser=([^;]+)/) || [])[1];
    if (!raw) return null;
    return typeof raw === "string" ? JSON.parse(decodeURIComponent(raw)) : raw;
  } catch (err) {
    console.warn("Unable to parse musAuthUser:", err);
    return null;
  }
}

function getCurrentRole() {
  const user = getStoredUser();
  if (!user || !user.role) return "student"; // sensible default
  return String(user.role).toLowerCase();
}

function getUserIdForInterest() {
  // Try to reuse existing helper if defined in studentdashboard.js
  if (typeof getUserId === "function") {
    return getUserId();
  }
  const user = getStoredUser();
  return user && user.id ? user.id : null;
}

function buildAuthHeaders() {
  const headers = { Accept: "application/json" };
  const token = window.localStorage.getItem("musAuthToken");
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const userId = getUserIdForInterest();
  if (userId) {
    headers["X-User-Id"] = String(userId);
  }
  return headers;
}

function renderInterestTags(tags) {
  const container = document.getElementById("interest-tags-container");
  if (!container) return;

  container.innerHTML = "";
  tags.forEach((tag) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "interest-tag";
    btn.textContent = tag;
    btn.dataset.selected = "false";

    btn.addEventListener("click", () => {
      const selected = btn.dataset.selected === "true";
      btn.dataset.selected = (!selected).toString();
      btn.classList.toggle("selected", !selected);
    });

    container.appendChild(btn);
  });
}

async function fetchUserInterests() {
  const banner = document.getElementById("interest-banner");
  if (!banner) return ""; // not on this page

  try {
    const res = await fetch(`${INTERESTS_API_BASE}/users/me`, {
      method: "GET",
      credentials: "include",
      headers: buildAuthHeaders()
    });

    if (!res.ok) {
      console.warn("Failed to load user profile:", res.status);
      return "";
    }

    const user = await res.json();
    return (user && (user.interests_text || user.interestsText)) || "";
  } catch (err) {
    console.error("Error loading user interests:", err);
    return "";
  }
}

function showInterestBanner() {
  const banner = document.getElementById("interest-banner");
  const summary = document.getElementById("interest-summary");
  if (banner) banner.classList.remove("hidden");
  if (summary) summary.classList.add("hidden");
}

function showInterestSummary(text) {
  const banner = document.getElementById("interest-banner");
  const summary = document.getElementById("interest-summary");
  const summaryText = document.getElementById("interest-summary-text");

  if (banner) banner.classList.add("hidden");
  if (summary) summary.classList.remove("hidden");
  if (summaryText) summaryText.textContent = text || "Not set yet";
}

async function saveInterests() {
  const statusEl = document.getElementById("interest-status");
  const freeformEl = document.getElementById("interest-freeform");

  const selectedTags = Array.from(
    document.querySelectorAll(".interest-tag.selected")
  ).map((el) => el.textContent.trim());

  const freeform = freeformEl ? freeformEl.value.trim() : "";

  const interestsText = [...selectedTags, freeform]
    .filter(Boolean)
    .join(", ")
    .trim();

  if (!interestsText) {
    if (statusEl) {
      statusEl.textContent = "Please select at least one tag or enter some interests.";
    }
    return;
  }

  if (statusEl) statusEl.textContent = "Saving your interests...";

  try {
    const res = await fetch(`${INTERESTS_API_BASE}/users/me/interests`, {
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders()
      },
      body: JSON.stringify({ interestsText })
    });

    if (!res.ok) {
      throw new Error(`Failed to save interests: ${res.status}`);
    }

    const data = await res.json();
    const finalText =
      (data && (data.interests_text || data.interestsText)) || interestsText;

    if (statusEl) {
      statusEl.textContent =
        "Saved! We’ll update your recommendations based on your interests.";
    }

    // Update local copy of musAuthUser if present (optional but nice)
    try {
      const user = getStoredUser() || {};
      user.interests_text = finalText;
      window.localStorage.setItem(
        "musAuthUser",
        JSON.stringify(user)
      );
    } catch (e) {
      console.warn("Unable to update musAuthUser in localStorage:", e);
    }

    showInterestSummary(finalText);
  } catch (err) {
    console.error(err);
    if (statusEl) {
      statusEl.textContent =
        "Sorry, something went wrong while saving. Please try again.";
    }
  }
}

function wireInterestEvents() {
  const saveBtn = document.getElementById("interest-save-btn");
  const skipBtn = document.getElementById("interest-skip-btn");
  const editBtn = document.getElementById("interest-edit-btn");
  const statusEl = document.getElementById("interest-status");

  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      if (statusEl) statusEl.textContent = "";
      saveInterests();
    });
  }

  if (skipBtn) {
    skipBtn.addEventListener("click", () => {
      const banner = document.getElementById("interest-banner");
      if (banner) banner.classList.add("hidden");
    });
  }

  if (editBtn) {
    editBtn.addEventListener("click", () => {
      const status = document.getElementById("interest-status");
      if (status) status.textContent = "";
      showInterestBanner();
    });
  }
}

async function initInterestsComponent() {
  const banner = document.getElementById("interest-banner");
  if (!banner) return; // not on this page

  const role = getCurrentRole();
  const tags =
    role === "guest" || role === "external"
      ? DEFAULT_INTEREST_TAGS_GUEST
      : DEFAULT_INTEREST_TAGS_STUDENT;

  renderInterestTags(tags);
  wireInterestEvents();

  const interestsText = await fetchUserInterests();

  if (!interestsText) {
    // New or interest not set yet: show full banner
    showInterestBanner();
  } else {
    // Interests exist: show compact summary with "Update" button
    showInterestSummary(interestsText);
  }
}

// Initialise when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  initInterestsComponent();
});
