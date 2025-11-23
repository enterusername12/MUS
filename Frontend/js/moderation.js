document.addEventListener("DOMContentLoaded", () => {
  const tabs = document.querySelectorAll(".tab");
  const container = document.querySelector(".card-container");
  const pageTitle = document.getElementById("page-title");
  const itemsCount = document.getElementById("items-count");

  const data = {
    abnormal: [],
    feedback: [],
    reports: []
  };

  const REPORT_CATEGORIES = new Set(["Facilities Damages", "Lost", "Found"]);

  const titles = {
    abnormal: "Abnormal Content Review",
    feedback: "Student Feedback Management",
    reports: "Facility Reports Review"
  };

  let currentTab = document.querySelector(".tab.active")?.dataset.tab || "abnormal";
  let currentIndex = 0;

  setLoadingState("Loading moderation queue...");
  fetchModerationData();

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      setActiveTabButton(tab.dataset.tab);
      currentTab = tab.dataset.tab;
      currentIndex = 0;
      loadTab(currentTab);
    });
  });

    async function fetchModerationData() {
    try {
      const response = await fetch("/api/feedback/moderation");
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const payload = await response.json();
      const submissions = Array.isArray(payload.submissions) ? payload.submissions : [];

      data.abnormal = [];
      data.feedback = [];
      data.reports = [];

      submissions.forEach((submission) => {
        const mapped = mapSubmission(submission);
        if (REPORT_CATEGORIES.has(mapped.category)) {
          data.reports.push(mapped);
        } else {
          data.feedback.push(mapped);
        }
      });

      updateTabCounts();

      if (!data[currentTab]?.length) {
        const nextTab = ["feedback", "reports", "abnormal"].find((name) => data[name]?.length) || currentTab;
        currentTab = nextTab;
        setActiveTabButton(currentTab);
      }

      currentIndex = 0;
      loadTab(currentTab);
    } catch (error) {
      console.error("Failed to load moderation data", error);
      itemsCount.textContent = "Unable to load items";
      container.innerHTML = `<div class="empty-state"><p>Failed to load moderation data.</p></div>`;
    }
  }

  function setActiveTabButton(tabName) {
    tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === tabName));
  }

  function updateTabCounts() {
    tabs.forEach((tab) => {
      const type = tab.dataset.tab;
      const count = data[type]?.length || 0;
      const badge = tab.querySelector(".count");
      if (badge) badge.textContent = count;
    });
  }

  function setLoadingState(message) {
    itemsCount.textContent = message;
    container.innerHTML = `<div class="empty-state"><p>${message}</p></div>`;
  }

  function mapSubmission(submission) {
    const createdAt = submission.createdAt || submission.created_at;
    const attachmentUrl =
      submission.attachmentByteaUrl || submission.attachmentUrl || (submission.id ? `/api/feedback/${submission.id}/attachment` : null);
    const hasAttachment = submission.attachmentPath || submission.attachmentOriginalName || attachmentUrl;

    return {
      id: submission.id,
      user: submission.userId ? `User #${submission.userId}` : submission.contactEmail || "Anonymous",
      date: formatDate(createdAt),
      category: submission.category || "General",
      context: submission.contactEmail ? `Contact email: ${submission.contactEmail}` : "Submitted via portal",
      feedback: submission.message || "",
      status: submission.status || "pending",
      attachment: hasAttachment
        ? {
            url: attachmentUrl,
            name: submission.attachmentOriginalName || "attachment",
            mimeType: submission.attachmentMimeType || "",
            size: submission.attachmentSize || submission.attachment_size || 0
          }
        : null
    };
  }

  function formatDate(dateValue) {
    if (!dateValue) return "Unknown date";
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return "Unknown date";
    return date.toLocaleString();
  }

  function renderAttachmentSection(attachment) {
    if (!attachment) {
      return `<div class="text-box">No attachment provided.</div>`;
    }

    const isImage = attachment.mimeType?.startsWith("image/");
    const fileLabel = `${attachment.name}${attachment.size ? ` (${Math.round(attachment.size / 1024)} KB)` : ""}`;

    const preview = isImage
      ? `<div class="attachment"><img src="${attachment.url}" alt="${attachment.name}"></div>`
      : `<div class="text-box"><strong>${fileLabel}</strong></div>`;

    return `
      ${preview}
      <div class="text-box">
        <a href="${attachment.url}" download="${attachment.name}" target="_blank" rel="noopener">Download attachment</a>
      </div>
    `;
  }

  function loadTab(tabName) {
    container.innerHTML = "";
    const items = data[tabName] || [];
    pageTitle.textContent = titles[tabName];
    itemsCount.textContent = `${items.length} item${items.length === 1 ? "" : "s"} in queue`;

    if (!items || items.length === 0) {
      container.innerHTML = `<div class="empty-state"><p>No ${tabName} items found.</p></div>`;
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
            <div class="card-field"><label>User</label><div class="value">${item.user}</div></div>
            <div class="card-field"><label>Date & Time</label><div class="value">${item.date}</div></div>
            <div class="card-field"><label>Status</label><div class="value"><span class="badge inappropriate">${item.status}</span></div></div>
          </div>
          <div class="section-label">Submitted Content</div>
          <div class="text-box">${item.feedback || "No content provided."}</div>
          <div class="section-label">Attachment</div>
          ${renderAttachmentSection(item.attachment)}
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
      cardHTML = `
        <div class="card">
          <div class="card-header">
            <div class="card-field"><label>User</label><div class="value">${item.user}</div></div>
            <div class="card-field"><label>Date & Time</label><div class="value">${item.date}</div></div>
            <div class="card-field"><label>Category</label><div class="value"><span class="badge feature-request">${item.category}</span></div></div>
            <div class="card-field"><label>Status</label><div class="value"><span class="badge feature-request">${item.status}</span></div></div>
          </div>
          <div class="section-label">Context</div>
          <div class="text-box">${item.context}</div>
          <div class="section-label">Feedback</div>
          <div class="text-box">${item.feedback}</div>
          <div class="section-label">Attachment</div>
          ${renderAttachmentSection(item.attachment)}
          <div class="section-label">Your Response</div>
          <textarea id="response-box" placeholder="Write your response here..." rows="4" style="width:100%;"></textarea>
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
      cardHTML = `
        <div class="card">
          <div class="card-header">
            <div class="card-field"><label>User</label><div class="value">${item.user}</div></div>
            <div class="card-field"><label>Date & Time</label><div class="value">${item.date}</div></div>
            <div class="card-field"><label>Category</label><div class="value"><span class="badge location">${item.category}</span></div></div>
            <div class="card-field"><label>Status</label><div class="value"><span class="badge location">${item.status}</span></div></div>
          </div>
          <div class="section-label">Report Details</div>
          <div class="text-box">${item.feedback}</div>
          <div class="section-label">Attachment</div>
          ${renderAttachmentSection(item.attachment)}
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
    const nextBtn = document.getElementById("next-btn");
    const prevBtn = document.getElementById("prev-btn");
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

    // --- Action button logic ---
    document.getElementById("approve-btn")?.addEventListener("click", () => handleAction("approve", tabName, item));
    document.getElementById("reject-btn")?.addEventListener("click", () => handleAction("reject", tabName, item));
    document.getElementById("send-btn")?.addEventListener("click", () => {
      const response = document.getElementById("response-box").value.trim();
      handleAction("sendResponse", tabName, { ...item, response });
    });
    document.getElementById("resolve-btn")?.addEventListener("click", () => handleAction("resolve", tabName, item));
  }

  // --- ✅ Action handler (for backend) ---
  function handleAction(type, tabName, item) {
    console.log(`Action triggered: ${type}`, item);

    // Example backend request (replace with your API call)
    // fetch('/api/moderation', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ type, tabName, item })
    // }).then(res => res.json()).then(data => console.log(data));

    alert(`"${type}" action submitted for ${item.user}. (connect backend here)`);
  }
});