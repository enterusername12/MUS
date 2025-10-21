// all the data are dummy data for now, to be replaced with backend API calls later

// --- Mock Data (replace with backend API later) ---
const newsData = [
  { title: "Orientation Week", desc: "Welcome new students to campus!" },
  { title: "AI Seminar", desc: "Join our discussion on AI and learning." },
  { title: "Sports Finals", desc: "Support your faculty in the finals!" }
];

const postData = [
  { author: "Sarah Johnson", content: "Just finished my presentation on sustainable design!", category: "Academic" },
  { author: "John Lim", content: "Excited for the upcoming hackathon event!", category: "Tech" },
  { author: "Aisha Tan", content: "My art project got selected for the student gallery!", category: "Creative" }
];

const polls = [
  {
    title: "Best Campus Food Option",
    options: [
      { name: "Pizza Place", percent: 38 },
      { name: "Sandwich Bar", percent: 29 },
      { name: "Asian Cuisine", percent: 23 }
    ],
    totalVotes: 234,
    deadline: "Oct 20"
  },
  {
    title: "Favorite Study Spot",
    options: [
      { name: "Library", percent: 45 },
      { name: "Café Lounge", percent: 32 },
      { name: "Outdoor Benches", percent: 23 }
    ],
    totalVotes: 178,
    deadline: "Oct 25"
  }
];

// --- Helper to render cards ---
function renderCards(container, data, type) {
  container.innerHTML = "";
  data.forEach(item => {
    const card = document.createElement("div");
    card.classList.add(type === "news" ? "event-card" : "post-card");
    if (type === "news") {
      card.innerHTML = `<h3>${item.title}</h3><p>${item.desc}</p>`;
    } else {
      card.innerHTML = `
        <div class="post-header">
          <div class="post-author">${item.author}</div>
          <div class="category-badge">${item.category}</div>
        </div>
        <p class="post-content">${item.content}</p>
      `;
    }
    container.appendChild(card);
  });
}

// --- Helper to render dots ---
function renderDots(dotContainer, count) {
  dotContainer.innerHTML = "";
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
const eventsContainer = document.getElementById("eventsContainer");
const newsDots = document.getElementById("newsDots");
renderCards(eventsContainer, newsData, "news");
renderDots(newsDots, newsData.length);
setupNavigation(
  document.getElementById("prevNewsBtn"),
  document.getElementById("nextNewsBtn"),
  eventsContainer,
  newsDots
);

// --- Initialize Community Highlights ---
const postContainer = document.getElementById("postContainer");
const postDots = document.getElementById("postDots");
renderCards(postContainer, postData, "post");
renderDots(postDots, postData.length);
setupNavigation(
  document.getElementById("prevPostBtn"),
  document.getElementById("nextPostBtn"),
  postContainer,
  postDots
);


// --- Initialize Active Polls ---
const pollContainer = document.getElementById("pollContainer");
const pollDots = document.getElementById("pollDots");
const pollCount = document.getElementById("pollCount");

pollCount.textContent = `${polls.length} Active`;

pollContainer.innerHTML = "";
polls.forEach(poll => {
  const pollCard = document.createElement("div");
  pollCard.classList.add("poll-card");

  pollCard.innerHTML = `
    <div class="poll-header">
      <div class="poll-icon">📈</div>
      <div>
        <div class="poll-title">${poll.title}</div>
        <div class="poll-subtitle">${poll.options.length} options available</div>
      </div>
      <div class="poll-deadline" style="margin-left:auto; color:#b33a3a; font-size:0.85rem;">
        🗓 Ends ${poll.deadline}
      </div>
    </div>

    <div class="poll-options">
      ${poll.options.map(opt => `
        <div class="poll-option">
          <div class="option-label">
            <span>${opt.name}</span>
            <span>${opt.percent}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width:${opt.percent}%;"></div>
          </div>
        </div>
      `).join("")}
    </div>

    <div class="poll-footer">
      <span>👥 ${poll.totalVotes} total votes</span>
      <button class="vote-btn">Vote Now</button>
    </div>
  `;
  pollContainer.appendChild(pollCard);
});

// ✅ Add indicator dots and navigation
renderDots(pollDots, polls.length);
setupNavigation(
  document.getElementById("prevPollBtn"),
  document.getElementById("nextPollBtn"),
  pollContainer,
  pollDots
);

// === 📅 Calendar Logic ===
const monthYear = document.getElementById("monthYear");
const grid = document.getElementById("calendarGrid");

if (monthYear && grid) {
  let currentDate = new Date();

  // Simulated backend data
  const backendEvents = [
    { date: "2025-10-19", type: "poll", title: "AI Feedback Poll", time: "5:00 PM" },
    { date: "2025-10-19", type: "event", title: "Campus Cleanup", time: "10:00 AM" },
    { date: "2025-10-20", type: "competition", title: "Photo Competition", time: "2:00 PM" },
    { date: "2025-10-21", type: "event", title: "Coding Workshop", time: "1:00 PM" },
    { date: "2025-10-23", type: "event", title: "Open Mic Night", time: "6:00 PM" }
  ];

  const colorMap = {
    poll: "red",
    competition: "purple",
    event: "green"
  };

  function renderCalendar() {
    grid.innerHTML = "";

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    monthYear.textContent = currentDate.toLocaleString("default", { month: "long", year: "numeric" });

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Empty slots before start of month
    for (let i = 0; i < firstDay; i++) {
      const empty = document.createElement("div");
      grid.appendChild(empty);
    }

    // Populate days
    for (let d = 1; d <= daysInMonth; d++) {
      const cell = document.createElement("div");
      cell.classList.add("day");

      const dateLabel = document.createElement("div");
      dateLabel.classList.add("date");
      dateLabel.textContent = d;

      const dotsContainer = document.createElement("div");
      dotsContainer.classList.add("indicators");

      const fullDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const eventsToday = backendEvents.filter(e => e.date === fullDate);

      eventsToday.forEach(ev => {
        const dot = document.createElement("div");
        dot.classList.add("dot", colorMap[ev.type]);
        dot.title = `${ev.title} — ${ev.time}`;
        dotsContainer.appendChild(dot);
      });

      cell.appendChild(dateLabel);
      cell.appendChild(dotsContainer);
      grid.appendChild(cell);
    }
  }

  document.getElementById("prevMonth").addEventListener("click", () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar();
  });

  document.getElementById("nextMonth").addEventListener("click", () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar();
  });

  renderCalendar();
}


// === Dummy Student Spotlight Data ===
const spotlightData = {
  name: "Emily Rodriguez",
  month: "October",
  points: 1500,
  award: "Innovation Award",
  description:
    "Outstanding achievement in the Campus Innovation Challenge. Emily developed a sustainable waste management app that has been adopted by the university administration."
};

// === Dummy Reward Points Data (for current user) ===
const rewardData = {
  points: 850,
  progress: "+45 this week"
};

// === Render Spotlight Data ===
function loadStudentSpotlight(data) {
  document.getElementById('spotlightName').textContent = data.name;
  document.getElementById('spotlightMonth').textContent = `${data.month} Spotlight`;
  document.getElementById('spotlightPoints').textContent = `${data.points} points earned`;
  document.getElementById('spotlightAward').textContent = data.award;
  document.getElementById('spotlightDescription').textContent = data.description;
}

// === Render Reward Data ===
function loadRewardPoints(data) {
  document.getElementById('rewardPoints').textContent = `${data.points} Points`;
  document.getElementById('rewardProgress').textContent = data.progress;
}

// Load everything when the page is ready
document.addEventListener('DOMContentLoaded', () => {
  loadStudentSpotlight(spotlightData);
  loadRewardPoints(rewardData);
});


// actual working button
// ✅ MODAL OPEN/CLOSE HANDLING
// Make sure the script runs after page is ready
document.addEventListener('DOMContentLoaded', function() {

  // === MODAL OPEN/CLOSE ===
  const shareModal = document.getElementById('sharePostModal');
  const openShareModalBtn = document.getElementById('createPost');
  const closeShareModalBtn = document.getElementById('closeShareModal');
  const cancelPostBtn = document.getElementById('cancelPostBtn');

  // Open modal when "+ Create Post" is clicked
  openShareModalBtn.addEventListener('click', (e) => {
    e.preventDefault();
    console.log("✅ Create Post clicked");
    shareModal.classList.remove('hidden');
  });

  // Close modal (x)
  closeShareModalBtn.addEventListener('click', () => {
    console.log("❌ Close clicked");
    shareModal.classList.add('hidden');
  });

  // Close modal (Cancel button)
  cancelPostBtn.addEventListener('click', () => {
    console.log("❌ Cancel clicked");
    shareModal.classList.add('hidden');
  });

  // Close when clicking outside the modal content
  window.addEventListener('click', (e) => {
    if (e.target === shareModal) {
      shareModal.classList.add('hidden');
    }
  });


  // === SHARE POST FORM ===
  const form = document.getElementById('sharePostForm');

  form.addEventListener('submit', async function(e) {
    e.preventDefault();
    console.log("🚀 Share Post clicked");

    const title = document.getElementById('postTitle').value.trim();
    const category = document.getElementById('postCategory').value;
    const tags = document.getElementById('postTags').value.trim();
    const description = document.getElementById('postDescription').value.trim();
    const photo = document.getElementById('postPhoto').files[0];

    if (!title || !description) {
      alert("Please fill out the required fields.");
      return;
    }

    const formData = new FormData();
    formData.append('title', title);
    formData.append('category', category);
    formData.append('tags', tags);
    formData.append('description', description);
    if (photo) formData.append('photo', photo);

    try {
      const response = await fetch('https://your-backend-url.com/api/posts', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) throw new Error('Failed to share post');

      alert('✅ Post shared successfully!');
      shareModal.classList.add('hidden');
      form.reset();

    } catch (error) {
      console.error('❌ Error sharing post:', error);
      alert('❌ Error: ' + error.message);
    }
  });
});
