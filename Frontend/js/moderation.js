document.addEventListener("DOMContentLoaded", () => {
  const API_BASE_URL = window.getApiBaseUrl
    ? window.getApiBaseUrl()
    : window.__CONFIG?.apiBaseUrl?.replace(/\/$/, "") || "http://localhost:3000";
  const tabs = document.querySelectorAll(".tab");
  const container = document.querySelector(".card-container");
  const pageTitle = document.getElementById("page-title");
  const itemsCount = document.getElementById("items-count");

  let data = {
    abnormal: [],
    feedback: [],
    reports: []
  };
  let isLoading = false;
  let isActionPending = false;
  let hasError = false;

  const blobUrlCache = new Map();
  const MAX_RESPONSE_LENGTH = 2000;

  const titles = {
    abnormal: "Abnormal Content Review",
    feedback: "Student Feedback Management",
    reports: "Facility Reports Review"
  };

  const emptyStateMessages = {
    abnormal: "No abnormal content is waiting for review.",
    feedback: "There are no feedback submissions right now.",
    reports: "No facility or lost & found reports have been submitted."
  };

  const REPORT_CATEGORY_LABELS = Object.freeze(
    new Set([
      "facilities damages",
      "facility damages",
      "facility damage",
      "facilities damage",
      "lost",
      "lost & found",
      "lost and found",
      "missing item",
      "found",
      "found item",
      "found items"
    ])
  );
  const REPORT_CATEGORY_KEYWORDS = Object.freeze([
    "facility",
    "facilities",
    "maintenance",
    "repair",
    "damage",
    "lost",
    "found",
    "incident",
    "report"
  ]);
  const ABNORMAL_CATEGORY_KEYWORDS = Object.freeze([
    "abnormal",
    "violation",
    "harassment",
    "abuse",
    "threat",
    "spam"
  ]);

  let currentTab = "abnormal";
  let currentIndex = 0;

  initialize();

  async function initialize() {
    setLoadingState();
    await fetchModerationQueue();
    updateTabCounters();
    loadTab(currentTab);
  }

  async function fetchModerationQueue() {
    isLoading = true;
    hasError = false;
    try {
      // Fetch Feedback & Reports
      const feedbackReq = fetch(`${API_BASE_URL}/api/feedback/moderation?status=pending`, { credentials: "include" });
      
      // Fetch Abnormal Content (Queued Posts)
      const postsReq = fetch(`${API_BASE_URL}/api/community-posts?status=queue`, { credentials: "include" });

      const [feedbackRes, postsRes] = await Promise.all([feedbackReq, postsReq]);

      const feedbackData = await feedbackRes.json();
      const postsData = await postsRes.json();

      const submissions = Array.isArray(feedbackData?.submissions) ? feedbackData.submissions : [];
      const abnormalPosts = Array.isArray(postsData?.posts) ? postsData.posts : [];

      // Combine them: Normalize posts to match submission structure
      const normalizedPosts = abnormalPosts.map(p => ({
        id: p.id,
        type: "post", // Mark as post
        category: "Abnormal Content",
        message: p.description, // Map description to message for UI
        content: p.description,
        createdAt: p.created_at,
        details: `Title: ${p.title} (Score: ${p.moderation_score})`
      }));

      // Merge data
      data = normalizeSubmissions([...submissions, ...normalizedPosts]);

    } catch (error) {
      console.error("Failed to load moderation queue", error);
      hasError = true;
      showErrorState("Failed to load moderation items.");
    } finally {
      isLoading = false;
    }
  }

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      currentTab = tab.dataset.tab;
      currentIndex = 0;
      loadTab(currentTab);
    });
  });

  function loadTab(tabName) {
    if (isLoading) {
      setLoadingState();
      return;
    }

    if (hasError) {
      return;
    }

    container.innerHTML = "";
    const items = data[tabName] || [];
    pageTitle.textContent = titles[tabName];
    itemsCount.textContent = `${items.length} items in queue`;

    if (!items || items.length === 0) {
      itemsCount.textContent = "0 items in queue";
      renderEmptyState(tabName);
      return;
    }

    renderCard(items[currentIndex], tabName);
  }

  function renderCard(item, tabName) {
    container.innerHTML = "";
    let cardHTML = "";

    // --- ABNORMAL CONTENT ---
    if (tabName === "abnormal") {
      cardHTML = `
        <div class="card">
          <div class="card-header">
            <div class="card-field"><label>User</label><div class="value">${formatUser(item)}</div></div>
            <div class="card-field"><label>Date & Time</label><div class="value">${formatDateTime(item)}</div></div>
            <div class="card-field"><label>Reason</label><div class="value"><span class="badge inappropriate">${item.category || "Abnormal Content"}</span></div></div>
          </div>
          <div class="section-label">Content</div>
          <div class="text-box">${item.message || item.content || "No message provided."}</div>
          <div class="section-label">Attachment</div>
          <div class="attachment">${renderAttachment(item)}</div>
          <div class="actions">
            <div class="nav-btns">
              <button id="prev-btn" ${currentIndex === 0 ? "disabled" : ""}>◀ Prev</button>
              <span>${currentIndex + 1} / ${data[tabName].length}</span>
              <button id="next-btn" ${currentIndex === data[tabName].length - 1 ? "disabled" : ""}>Next ▶</button>
            </div>
            <div class="action-btns">
              <button class="btn reject" id="reject-btn">Reject</button>
              <button class="btn approve" id="approve-btn">Approve</button>
            </div>
          </div>
        </div>`;
    }

    // --- FEEDBACK (editable text box for response) ---
    if (tabName === "feedback") {
      const responsePrefill = escapeHtml(item.moderatorResponse || "");
      const responseTimestamp = item.moderatorResponseUpdatedAt || item.moderatedAt || null;
      const savedResponseSection = item.moderatorResponse
        ? `
          <div class="section-label">Saved Response</div>
          <div class="text-box saved-response">
            ${formatMultilineText(item.moderatorResponse)}
            ${responseTimestamp ? `<div class="response-meta">Last updated ${formatTimestamp(responseTimestamp)}</div>` : ""}
          </div>`
        : "";
      cardHTML = `
        <div class="card">
          <div class="card-header">
            <div class="card-field"><label>User</label><div class="value">${formatUser(item)}</div></div>
            <div class="card-field"><label>Date & Time</label><div class="value">${formatDateTime(item)}</div></div>
            <div class="card-field"><label>Category</label><div class="value"><span class="badge feature-request">${item.category || "General Feedback"}</span></div></div>
          </div>
          <div class="section-label">Context</div>
          <div class="text-box">${item.context || item.details || "No additional context provided."}</div>
          <div class="section-label">Feedback</div>
          <div class="text-box">${item.message || item.feedback || "No feedback text available."}</div>
          ${hasRenderableAttachment(item) ? `
          <div class="section-label">Attachment</div>
          <div class="attachment">${renderAttachment(item)}</div>` : ""}
          ${savedResponseSection}
          <div class="section-label">Your Response</div>
          <textarea id="response-box" class="feedback-box" placeholder="Write your response here..." rows="4">${responsePrefill}</textarea>
          <div class="actions">
            <div class="nav-btns">
              <button id="prev-btn" ${currentIndex === 0 ? "disabled" : ""}>◀ Prev</button>
              <span>${currentIndex + 1} / ${data[tabName].length}</span>
              <button id="next-btn" ${currentIndex === data[tabName].length - 1 ? "disabled" : ""}>Next ▶</button>
            </div>
            <div class="action-btns">
              <button class="btn skip">Skip</button>
              <button class="btn send" id="send-btn">Send Response</button>
            </div>
          </div>
        </div>`;
    }

    // --- FACILITY REPORTS ---
    if (tabName === "reports") {
      const facilityLocationLabel = escapeHtml(
        item.facilityLocation || item.location || "Not specified"
      );
      const issueLabel = escapeHtml(item.issue || item.category || "Facility Report");
      const reportDescription =
        item.desc || item.message || "No description provided.";
      cardHTML = `
        <div class="card">
          <div class="card-header">
            <div class="card-field"><label>User</label><div class="value">${formatUser(item)}</div></div>
            <div class="card-field"><label>Date & Time</label><div class="value">${formatDateTime(item)}</div></div>
            <div class="card-field"><label>Location</label><div class="value"><span class="badge location">${facilityLocationLabel}</span></div></div>
          </div>
          <div class="section-label">Issue Type</div>
          <div class="text-box"><strong>${issueLabel}</strong></div>
          <div class="section-label">Description</div>
          <div class="text-box">${reportDescription}</div>
          ${hasRenderableAttachment(item) ? `
          <div class="section-label">Attachment</div>
          <div class="attachment">${renderAttachment(item)}</div>` : ""}
          <div class="actions">
            <div class="nav-btns">
              <button id="prev-btn" ${currentIndex === 0 ? "disabled" : ""}>◀ Prev</button>
              <span>${currentIndex + 1} / ${data[tabName].length}</span>
              <button id="next-btn" ${currentIndex === data[tabName].length - 1 ? "disabled" : ""}>Next ▶</button>
            </div>
            <div class="action-btns">
              <button class="btn skip">Skip</button>
              <button class="btn resolve" id="resolve-btn">Mark as Resolved</button>
            </div>
          </div>
        </div>`;
    }

    container.insertAdjacentHTML("beforeend", cardHTML);

    // --- Navigation logic ---
    const card = container.querySelector(".card");
    const nextBtn = card?.querySelector("#next-btn");
    const prevBtn = card?.querySelector("#prev-btn");
    const skipBtn = card?.querySelector(".btn.skip");
    nextBtn?.addEventListener("click", () => {
      if (currentIndex < data[tabName].length - 1) {
        currentIndex++;
        renderCard(data[tabName][currentIndex], tabName);
      }
    });
    prevBtn?.addEventListener("click", () => {
      if (currentIndex > 0) {
        currentIndex--;
        renderCard(data[tabName][currentIndex], tabName);
      }
    });
    skipBtn?.addEventListener("click", () => handleSkip(tabName, item));

    // --- Action button logic ---
    document.getElementById("approve-btn")?.addEventListener("click", () => handleAction("approve", tabName, item));
    document.getElementById("reject-btn")?.addEventListener("click", () => handleAction("reject", tabName, item));
    document.getElementById("send-btn")?.addEventListener("click", () => {
      const responseField = document.getElementById("response-box");
      const response = responseField?.value?.trim() || "";
      if (response.length > MAX_RESPONSE_LENGTH) {
        showToast(`Responses must be ${MAX_RESPONSE_LENGTH} characters or fewer.`, "error");
        return;
      }
      handleAction("sendResponse", tabName, { ...item, response });
    });
    document.getElementById("resolve-btn")?.addEventListener("click", () => handleAction("resolve", tabName, item));
  }

  // --- ✅ Action handler (with backend integration + optimistic UI) ---
  async function handleAction(type, tabName, item) {
    if (!item?.id) {
      showToast("Unable to update this submission. Missing identifier.", "error");
      return;
    }

    if (isActionPending) {
      return;
    }

    const requestConfig = buildActionRequest(type, item);
    if (!requestConfig) {
      showToast("Unsupported action. Please refresh and try again.", "error");
      return;
    }

    const card = container.querySelector(".card");
    const actionButtons = card?.querySelectorAll(".action-btns button") || [];
    const spinner = toggleActionSpinner(card, true, requestConfig.loadingLabel);
    setButtonsDisabled(actionButtons, true);
    isActionPending = true;

    try {
      const response = await fetch(requestConfig.url, {
        method: requestConfig.method,
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "include",
        body: JSON.stringify(requestConfig.body)
      });

      if (!response.ok) {
        const errorPayload = await safeParseJson(response);
        const errorMessage = errorPayload?.message || "Failed to update submission.";
        throw new Error(errorMessage);
      }

      const payload = await safeParseJson(response);
      const updatedSubmission = payload?.submission || payload || null;
      reconcileLocalData(tabName, item.id, updatedSubmission);
      updateTabCounters();
      const responseSnippet =
        type === "sendResponse"
          ? updatedSubmission?.moderatorResponse || item.response || ""
          : "";
      const successMessage = responseSnippet
        ? `${requestConfig.successMessage} Saved response: "${truncateText(responseSnippet)}"`
        : requestConfig.successMessage;

      showToast(successMessage, "success");
      loadTab(tabName);
    } catch (error) {
      console.error("Moderation action failed", error);
      showToast(error?.message || "Unable to complete the action. Please try again.", "error");
    } finally {
      toggleActionSpinner(card, false);
      setButtonsDisabled(actionButtons, false);
      isActionPending = false;
    }
  }

  async function handleSkip(tabName, item) {
    if (!item?.id || isActionPending || isLoading) {
      return;
    }

    const items = data[tabName] || [];
    if (!items.length) {
      loadTab(tabName);
      return;
    }

    const card = container.querySelector(".card");
    const cardButtons = card?.querySelectorAll(".actions button") || [];
    setButtonsDisabled(cardButtons, true);
    isActionPending = true;

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/feedback/${encodeURIComponent(item.id)}/skip`,
        {
          method: "PATCH",
          credentials: "include"
        }
      );

      if (!response.ok) {
        const errorPayload = await safeParseJson(response);
        const errorMessage = errorPayload?.error || "Failed to skip feedback.";
        throw new Error(errorMessage);
      }

      const payload = await safeParseJson(response);
      const updatedSubmission = payload?.submission || payload || { status: "skipped" };

      reconcileLocalData(tabName, item.id, {
        ...updatedSubmission,
        status: "skipped"
      });
      updateTabCounters();

      if (!data[tabName]?.length) {
        showToast("Feedback skipped and removed from the queue.", "success");
        loadTab(tabName);
        return;
      }

      if (currentIndex >= data[tabName].length) {
        currentIndex = Math.max(0, data[tabName].length - 1);
      }

      showToast("Feedback skipped and removed from the queue.", "success");
      renderCard(data[tabName][currentIndex], tabName);
    } catch (error) {
      console.error("Failed to skip feedback", error);
      showToast(error?.message || "Unable to skip this item. Please try again.", "error");
      renderCard(items[currentIndex], tabName);
    } finally {
      setButtonsDisabled(cardButtons, false);
      isActionPending = false;
    }
  }

  function buildActionRequest(type, item) {
    // Determine Endpoint based on Item Type
    let baseUrl;
    if (item.type === "post") {
       baseUrl = `${API_BASE_URL}/api/community-posts/${item.id}`;
    } else {
       baseUrl = `${API_BASE_URL}/api/feedback/${encodeURIComponent(item.id)}`;
    }

    switch (type) {
      case "approve":
        return {
          url: item.type === "post" ? `${baseUrl}/approve` : baseUrl, // Posts use /approve
          method: "PATCH",
          body: item.type === "post" ? {} : { status: "in_review" }, // Posts don't need body
          successMessage: "Submission approved.",
          loadingLabel: "Approving..."
        };
      case "reject": // Maps to "block" for posts
        return {
          url: item.type === "post" ? `${baseUrl}/block` : baseUrl,
          method: "PATCH",
          body: item.type === "post" ? {} : { status: "resolved" },
          successMessage: "Submission rejected.",
          loadingLabel: "Rejecting..."
        };
      case "resolve":
        return {
          url: baseUrl,
          method: "PATCH",
          body: { status: "resolved" },
          successMessage: "Report marked as resolved.",
          loadingLabel: "Resolving..."
        };
      // ... (sendResponse logic stays the same) ...
      default:
        return null;
    }
  }

  function reconcileLocalData(tabName, itemId, updatedItem) {
    if (!tabName || !itemId) {
      return;
    }

    const list = data[tabName];
    if (!Array.isArray(list)) {
      return;
    }

    const index = list.findIndex(entry => String(entry.id) === String(itemId));
    if (index === -1) {
      return;
    }

    if (updatedItem?.status && updatedItem.status !== "pending") {
      list.splice(index, 1);
    } else {
      list[index] = { ...list[index], ...updatedItem };
    }

    if (currentIndex >= list.length) {
      currentIndex = Math.max(0, list.length - 1);
    }
  }

  function setButtonsDisabled(buttons, disabled) {
    buttons.forEach(button => {
      button.disabled = disabled;
      if (disabled) {
        button.dataset.originalText = button.dataset.originalText || button.textContent;
      } else if (button.dataset.originalText) {
        button.textContent = button.dataset.originalText;
        delete button.dataset.originalText;
      }
    });
  }

  function toggleActionSpinner(card, isVisible, label = "Processing...") {
    if (!card) return null;
    let spinner = card.querySelector(".card-spinner");
    if (isVisible) {
      if (!spinner) {
        spinner = document.createElement("div");
        spinner.className = "card-spinner visible";
        spinner.innerHTML = `<div class="spinner"></div><span>${label}</span>`;
        card.appendChild(spinner);
      } else {
        spinner.querySelector("span").textContent = label;
        spinner.classList.add("visible");
      }
    } else if (spinner) {
      spinner.classList.remove("visible");
    }
    return spinner;
  }

  async function safeParseJson(response) {
    try {
      return await response.json();
    } catch (error) {
      return null;
    }
  }

  function showToast(message, type = "info") {
    if (!message) return;
    let toastContainer = document.querySelector(".toast-container");
    if (!toastContainer) {
      toastContainer = document.createElement("div");
      toastContainer.className = "toast-container";
      document.body.appendChild(toastContainer);
    }

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add("visible");
    }, 10);

    setTimeout(() => {
      toast.classList.remove("visible");
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  function normalizeSubmissions(submissions) {
    const normalized = {
      abnormal: [],
      feedback: [],
      reports: []
    };

    submissions.forEach(submission => {
      const tabKey = mapSubmissionToTab(submission);
      if (!normalized[tabKey]) {
        normalized[tabKey] = [];
      }
      normalized[tabKey].push(submission);
    });

    return normalized;
  }

  function mapSubmissionToTab(submission) {
    const normalizedCategory = normalizeCategory(submission?.category);
    if (isAbnormalCategory(normalizedCategory)) {
      return "abnormal";
    }

    if (isReportCategory(normalizedCategory, submission)) {
      return "reports";
    }

    return "feedback";
  }

 function normalizeCategory(category) {
    if (typeof category !== "string") {
      return "";
    }
    return category.trim().toLowerCase();
  }

  function isAbnormalCategory(categoryLabel) {
    if (!categoryLabel) {
      return false;
    }
    return ABNORMAL_CATEGORY_KEYWORDS.some(keyword => categoryLabel.includes(keyword));
  }

  function isReportCategory(categoryLabel, submission) {
    if (typeof submission?.type === "string" && submission.type.trim().toLowerCase() === "report") {
      return true;
    }

    if (!categoryLabel) {
      return false;
    }

    if (REPORT_CATEGORY_LABELS.has(categoryLabel)) {
      return true;
    }

    return REPORT_CATEGORY_KEYWORDS.some(keyword => categoryLabel.includes(keyword));
  }

  function renderAttachment(item) {
    if (!item) {
      return `<span>No attachment provided.</span>`;
    }

    const fileName = escapeHtml(item?.attachmentOriginalName || 'Download attachment');
    const mimeType = item?.attachmentMimeType || '';
    const base64 = item?.attachmentBase64;

    if (base64) {
      if (isImageAttachment(mimeType, base64)) {
        return `<img src="${base64}" alt="${fileName}" loading="lazy">`;
      }

      const downloadUrl = createBlobUrlFromDataUri(base64) || base64;
      const sizeLabel = formatFileSize(item?.attachmentSize);
      const sizeText = sizeLabel ? ` <small>(${sizeLabel})</small>` : '';

      return `
        <div class="attachment-download">
          <p>${fileName}${sizeText}</p>
          <a class="btn download" href="${downloadUrl}" download="${fileName}">Download attachment</a>
        </div>`;
    }

    if (item?.attachmentPath) {
      const url = buildAttachmentUrl(item.attachmentPath);
      const isImage = isImageAttachment(mimeType, url);

      if (isImage) {
        return `<img src="${url}" alt="${fileName}" loading="lazy">`;
      }

      return `<a href="${url}" download="${fileName}" target="_blank" rel="noopener">Download ${fileName}</a>`;
    }

    if (item?.img) {
      const url = buildAttachmentUrl(item.img);
      return `<img src="${url}" alt="attachment" loading="lazy">`;
    }

    return `<span>No attachment provided.</span>`;
  }

  function hasRenderableAttachment(item) {
    if (!item) return false;
    return Boolean(item.attachmentBase64 || item.attachmentPath || item.img);
  }

  function buildAttachmentUrl(pathValue) {
    if (!pathValue || typeof pathValue !== 'string') return '';
    const normalised = pathValue.replace(/\\/g, '/');
    if (/^https?:\/\//i.test(normalised)) {
      return normalised;
    }

    const prefixed = normalised.startsWith('/') ? normalised : `/${normalised}`;
    return encodeURI(prefixed);
  }

  function isImageAttachment(mimeType, url) {
    if (typeof mimeType === 'string' && mimeType.toLowerCase().startsWith('image/')) {
      return true;
    }
    if (typeof url === 'string' && url.startsWith('data:image/')) {
      return true;
    }
    return /\.(png|jpe?g|gif|bmp|webp|svg)$/i.test(url);
  }

 function createBlobUrlFromDataUri(dataUri) {
    if (typeof dataUri !== 'string' || !dataUri.startsWith('data:')) {
      return null;
    }

    if (blobUrlCache.has(dataUri)) {
      return blobUrlCache.get(dataUri);
    }

    try {
      const matches = dataUri.match(/^data:(.*?);base64,(.*)$/);
      if (!matches) {
        return null;
      }

      const mimeType = matches[1] || 'application/octet-stream';
      const base64Data = matches[2];
      const byteString = atob(base64Data);
      const byteNumbers = new Array(byteString.length);
      for (let i = 0; i < byteString.length; i += 1) {
        byteNumbers[i] = byteString.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: mimeType });
      const blobUrl = URL.createObjectURL(blob);
      blobUrlCache.set(dataUri, blobUrl);
      return blobUrl;
    } catch (error) {
      console.error('Failed to create Blob URL from attachment data.', error);
      return null;
    }
  }

  function formatFileSize(bytes) {
    if (typeof bytes !== 'number' || Number.isNaN(bytes) || bytes <= 0) {
      return '';
    }
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }
    return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
  }

  function escapeHtml(value = '') {
    return value.replace(/[&<>"']/g, (char) => {
      const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      };
      return map[char] || char;
    });
  }

  function formatUser(item) {
    return item?.submittedBy || item?.user || "Anonymous";
  }

  function formatDateTime(item) {
    if (!item) return "";
    const date = item?.createdAt || item?.date;
    const formatted = formatTimestamp(date);
    return formatted || "Not available";
  }

  function formatTimestamp(value) {
    if (!value) {
      return '';
    }
    try {
      return new Date(value).toLocaleString();
    } catch (error) {
      return value;
    }
  }

  function formatMultilineText(value = '') {
    if (!value) {
      return '';
    }
    return escapeHtml(value).replace(/\n/g, '<br>');
  }

  function truncateText(value = '', maxLength = 140) {
    if (!value) {
      return '';
    }
    if (value.length <= maxLength) {
      return value;
    }
    return `${value.slice(0, maxLength - 1)}…`;
  }

  function setLoadingState() {
    container.innerHTML = `<div class="loading-state"><p>Loading moderation queue...</p></div>`;
    itemsCount.textContent = "Loading items...";
  }

  function showErrorState(message) {
    container.innerHTML = `<div class="error-state"><p>${message}</p></div>`;
    itemsCount.textContent = "0 items in queue";
  }

  function renderEmptyState(tabName) {
    const message = emptyStateMessages[tabName] || `No ${tabName} items found.`;
    container.innerHTML = `<div class="empty-state"><p>${message}</p></div>`;
  }

  function updateTabCounters() {
    tabs.forEach(tab => {
      const type = tab.dataset.tab;
      const count = data[type]?.length || 0;
      const badge = tab.querySelector(".count");
      if (badge) badge.textContent = count;
    });
  }
});
