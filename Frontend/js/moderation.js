document.addEventListener("DOMContentLoaded", () => {
  const tabs = document.querySelectorAll(".tab");
  const container = document.querySelector(".card-container");
  const pageTitle = document.getElementById("page-title");
  const itemsCount = document.getElementById("items-count");

  const data = {
    abnormal: [
      {
        user: "john_doe123",
        date: "2025-10-12 14:32",
        reason: "Inappropriate language",
        content: "This post contains profanity and violates community guidelines. The user has been flagged multiple times for similar behavior.",
        img: "https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=400"
      },
      {
        user: "mike_chen88",
        date: "2025-10-13 09:15",
        reason: "Spam content",
        content: "User has posted the same promotional message across multiple forums repeatedly, which violates our spam policy.",
        img: "https://images.unsplash.com/photo-1551434678-e076c223a692?w=400"
      },
      {
        user: "lisa_parker",
        date: "2025-10-13 11:45",
        reason: "Harassment",
        content: "Multiple reports received about this user targeting and harassing other students in discussion threads.",
        img: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=400"
      },
      {
        user: "david_kim",
        date: "2025-10-13 16:20",
        reason: "Inappropriate language",
        content: "User posted offensive language in the student help forum. This is their second violation this month.",
        img: "https://images.unsplash.com/photo-1531482615713-2afd69097998?w=400"
      }
    ],
    feedback: [
      {
        user: "sarah_williams",
        date: "2025-10-12 15:20",
        category: "Feature Request",
        context: "Student submitted feedback regarding the portal interface after using it during late-night study sessions. This is a common request from students who frequently access the portal in the evening hours.",
        feedback: "It would be great if we could have a dark mode option for the portal. Many students study late at night and find the bright interface straining on the eyes."
      },
      {
        user: "jason_rodriguez",
        date: "2025-10-13 08:30",
        category: "Bug Report",
        context: "Student encountered technical issues while submitting assignment through the portal. Multiple similar reports received.",
        feedback: "The file upload feature crashes when trying to upload PDF files larger than 10MB. I had to compress my assignment to submit it."
      }
    ],
    reports: [
      {
        user: "alex_martinez",
        date: "2025-10-12 16:10",
        location: "Main Library - 3rd Floor",
        issue: "Broken Equipment",
        desc: "The air conditioning unit in the study room is making loud noises and not cooling properly. Multiple students have complained about the uncomfortable temperature.",
        img: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=400"
      },
      {
        user: "rachel_brown",
        date: "2025-10-13 07:45",
        location: "Science Building - Room 204",
        issue: "Cleanliness Issue",
        desc: "Several desks in the lecture hall have not been cleaned. There are drink spills and food residue from yesterday's classes.",
        img: "https://images.unsplash.com/photo-1562564055-71e051d33c19?w=400"
      }
    ]
  };

  const titles = {
    abnormal: "Abnormal Content Review",
    feedback: "Student Feedback Management",
    reports: "Facility Reports Review"
  };

  let currentTab = "abnormal";
  let currentIndex = 0;

  // ✅ Initialize tab counters
  tabs.forEach(tab => {
    const type = tab.dataset.tab;
    const count = data[type]?.length || 0;
    const badge = tab.querySelector(".count");
    if (badge) badge.textContent = count;
  });

  // ✅ Load default tab
  loadTab("abnormal");

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
    container.innerHTML = "";
    const items = data[tabName];
    pageTitle.textContent = titles[tabName];
    itemsCount.textContent = `${items.length} items in queue`;

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
            <div class="card-field"><label>Reason</label><div class="value"><span class="badge inappropriate">${item.reason}</span></div></div>
          </div>
          <div class="section-label">Content</div>
          <div class="text-box">${item.content}</div>
          <div class="section-label">Attachment</div>
          <div class="attachment"><img src="${item.img}" alt="attachment"></div>
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
          </div>
          <div class="section-label">Context</div>
          <div class="text-box">${item.context}</div>
          <div class="section-label">Feedback</div>
          <div class="text-box">${item.feedback}</div>
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
            <div class="card-field"><label>Location</label><div class="value"><span class="badge location">${item.location}</span></div></div>
          </div>
          <div class="section-label">Issue Type</div>
          <div class="text-box"><strong>${item.issue}</strong></div>
          <div class="section-label">Description</div>
          <div class="text-box">${item.desc}</div>
          <div class="section-label">Attachment</div>
          <div class="attachment"><img src="${item.img}" alt="attachment"></div>
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
