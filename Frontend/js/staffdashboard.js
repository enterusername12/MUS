document.addEventListener("DOMContentLoaded", () => {
  const pollContainer = document.getElementById("pollContainer");
  const competitionContainer = document.getElementById("competitionContainer");
  const eventContainer = document.getElementById("eventContainer");

  // 🟩 Demo Poll Data
  const polls = [
    { id: 1, title: "Best Campus Food Option", votes: 234, status: "active", ends: "Oct 20" },
    { id: 2, title: "Favorite Study Spot", votes: 189, status: "active", ends: "Oct 18" },
    { id: 3, title: "Preferred Library Hours", votes: 456, status: "ended", ends: "Oct 10" }
  ];

  // 🟦 Demo Competition Data
  const competitions = [
    { id: 1, title: "Hackathon 2025", participants: 45, status: "ongoing", due: "Nov 1", reward: "1000 points" },
    { id: 2, title: "Photography Contest", participants: 67, status: "upcoming", due: "Oct 30", reward: "500 points" },
    { id: 3, title: "Essay Writing Competition", participants: 89, status: "enrolled", due: "Oct 5", reward: "300 points" }
  ];

  // 🟧 Demo Event Data
  const events = [
    { id: 1, type: "Workshop", title: "Resume Workshop 2025", date: "Nov 10", venue: "Library Room 203", status: "upcoming" },
    { id: 2, type: "Seminar", title: "AI in Education", date: "Nov 20", venue: "Online (Zoom)", status: "active" },
    { id: 3, type: "Networking Event", title: "Industry Night", date: "Dec 1", venue: "Main Hall", status: "upcoming" }
  ];

  // ✅ Create Poll Cards
  polls.forEach(poll => {
    const card = document.createElement("div");
    card.className = "card poll-card";
    card.innerHTML = `
      <div class="card-header">
        <span>Poll #${poll.id}</span>
        <span class="status ${poll.status}">${poll.status}</span>
        <span class="ends">Ends: ${poll.ends}</span>
      </div>
      <h3>${poll.title}</h3>
      <p>${poll.votes} votes</p>
    `;
    pollContainer.appendChild(card);
  });

  // ✅ Create Competition Cards
  competitions.forEach(comp => {
    const card = document.createElement("div");
    card.className = "card competition-card";
    card.dataset.reward = comp.reward;
    card.innerHTML = `
      <div class="card-header">
        <span>Competition #${comp.id}</span>
        <span class="status ${comp.status}">${comp.status}</span>
        <span class="ends">Due: ${comp.due}</span>
      </div>
      <h3>${comp.title}</h3>
      <p>${comp.participants} participants</p>
      <p class="reward">Reward: ${comp.reward}</p>
    `;
    competitionContainer.appendChild(card);
  });

  // ✅ Create Event Cards
  events.forEach(event => {
    const card = document.createElement("div");
    card.className = "card event-card";
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
});

// 🟢 Modal Elements
const modal = document.getElementById('createModal');
const closeModalBtn = document.getElementById('closeModal');
const addBtns = document.querySelectorAll('.add-btn');
const tabBtns = document.querySelectorAll('.tab-btn');
const pollForm = document.getElementById('pollForm');
const competitionForm = document.getElementById('competitionForm');
const eventForm = document.getElementById('eventForm'); // 🆕
const modalDescription = document.getElementById('modalDescription');

// ✅ QR Modal Elements
const qrModal = document.getElementById('qrModal');
const qrContainer = document.getElementById('qrContainer');
const qrTitle = document.getElementById('qrTitle');
const qrTypeDesc = document.getElementById('qrTypeDesc');
const rewardText = document.getElementById('rewardText');
const closeQrModal = document.getElementById('closeQrModal');

// 🟣 Close QR Modal
closeQrModal.addEventListener('click', () => qrModal.classList.add('hidden'));
qrModal.addEventListener('click', (e) => {
  if (e.target === qrModal) qrModal.classList.add('hidden');
});

// 🟠 Open modal
addBtns.forEach(btn => btn.addEventListener('click', () => modal.classList.remove('hidden')));

// 🔴 Close modal
closeModalBtn.addEventListener('click', () => modal.classList.add('hidden'));
modal.addEventListener('click', (e) => {
  if (e.target === modal) modal.classList.add('hidden');
});

// 🟡 Tab switching (Poll / Competition / Event)
tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    tabBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    [pollForm, competitionForm, eventForm].forEach(f => f.classList.remove('active'));

    if (tab === 'poll') {
      pollForm.classList.add('active');
      modalDescription.textContent = 'Create and manage polls by entering a title, expiry date, and context. Add multiple selection options for students to participate.';
    } else if (tab === 'competition') {
      competitionForm.classList.add('active');
      modalDescription.textContent = 'Create competitions by entering essential details such as title, reward, venue, and maximum participants.';
    } else if (tab === 'event') {
      eventForm.classList.add('active');
      modalDescription.textContent = 'Create events by specifying the type, title, date, venue, and description.';
    }
  });
});

// 🟢 Add more poll options
let pollOptionCount = 2;
document.getElementById('addPollOption').addEventListener('click', () => {
  if (pollOptionCount < 10) {
    pollOptionCount++;
    const container = document.getElementById('pollOptionsContainer');
    const newOption = document.createElement('div');
    newOption.className = 'form-group';
    newOption.innerHTML = `
      <label>Option ${pollOptionCount} *</label>
      <input type="text" placeholder="e.g., Event ${String.fromCharCode(64 + pollOptionCount)}" required>
    `;
    container.appendChild(newOption);
  }
});

// 🟢 Add more hosts
let hostCount = 1;
document.getElementById('addHost').addEventListener('click', () => {
  if (hostCount < 5) {
    hostCount++;
    const container = document.getElementById('hostContainer');
    const newHost = document.createElement('input');
    newHost.type = 'text';
    newHost.placeholder = `Host ${hostCount} (e.g., Dr. Johnson, Student Council)`;
    newHost.style.marginTop = '8px';
    container.appendChild(newHost);
  }
});

// 🖼️ Banner upload
document.getElementById('bannerUpload').addEventListener('click', () => {
  document.getElementById('bannerInput').click();
});

// 📝 Character count
document.getElementById('competitionDesc').addEventListener('input', (e) => {
  const count = e.target.value.length;
  document.querySelector('.char-count').textContent = `${count}/500`;
});

// 🚮 Discard buttons
document.querySelectorAll('.btn-discard').forEach(btn => {
  btn.addEventListener('click', () => {
    modal.classList.add('hidden');
    pollForm.reset();
    competitionForm.reset();
    eventForm?.reset();
  });
});

// 📨 Form submissions
pollForm.addEventListener('submit', (e) => {
  e.preventDefault();
  alert('Poll created successfully!');
  modal.classList.add('hidden');
  pollForm.reset();
});

competitionForm.addEventListener('submit', (e) => {
  e.preventDefault();
  alert('Competition created successfully!');
  modal.classList.add('hidden');
  competitionForm.reset();
});

// 🆕 Event form submit
eventForm.addEventListener('submit', (e) => {
  e.preventDefault();
  alert('Event created successfully!');
  modal.classList.add('hidden');
  eventForm.reset();
});

// ⚙️ Card action menu (Edit/Delete/QR)
const pollContainer = document.getElementById("pollContainer");
const competitionContainer = document.getElementById("competitionContainer");
const eventContainer = document.getElementById("eventContainer");

[pollContainer, competitionContainer, eventContainer].forEach(container => {
  container.addEventListener("click", (e) => {
    const card = e.target.closest(".card");
    if (!card) return;

    // Remove old menu
    const existingMenu = card.querySelector(".card-action-menu");
    if (existingMenu) {
      existingMenu.remove();
      return;
    }

    const isCompetition = container.id === "competitionContainer";
    const isEvent = container.id === "eventContainer";
    const menu = document.createElement("div");
    menu.classList.add("card-action-menu");

    // Dynamic menu content
    if (isCompetition) {
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

    // ✏️ Edit
    menu.querySelector(".edit-btn").addEventListener("click", () => {
      modal.classList.remove("hidden");
      tabBtns.forEach(btn => {
        const tabType = isCompetition ? "competition" : isEvent ? "event" : "poll";
        btn.classList.toggle("active", btn.dataset.tab === tabType);
      });
      [pollForm, competitionForm, eventForm].forEach(f => f.classList.remove("active"));
      if (isCompetition) competitionForm.classList.add("active");
      else if (isEvent) eventForm.classList.add("active");
      else pollForm.classList.add("active");

      const titleInput = isCompetition
        ? competitionForm.querySelector("input[type='text']")
        : isEvent
          ? eventForm.querySelector("input[type='text']")
          : pollForm.querySelector("input[type='text']");
      titleInput.value = card.querySelector("h3").textContent;
      menu.remove();
    });

    // 🗑️ Delete
    menu.querySelector(".delete-btn").addEventListener("click", () => {
      if (confirm("Are you sure you want to delete this item?")) card.remove();
      menu.remove();
    });

    // 📱 QR Buttons (Competitions only)
    if (isCompetition) {
      const compName = card.querySelector("h3").textContent;
      const reward = card.dataset.reward || "500 points";

      menu.querySelector(".qr-participate").addEventListener("click", () => {
        qrModal.classList.remove("hidden");
        qrContainer.innerHTML = "";
        qrTitle.textContent = "Participation QR";
        qrTypeDesc.textContent = `Scan this to join "${compName}".`;
        rewardText.textContent = "";
        new QRCode(qrContainer, {
          text: `http://localhost:5500/competition/${encodeURIComponent(compName)}/join`,
          width: 250,
          height: 250,
        });
      });

      menu.querySelector(".qr-reward").addEventListener("click", () => {
        qrModal.classList.remove("hidden");
        qrContainer.innerHTML = "";
        qrTitle.textContent = "Reward QR";
        qrTypeDesc.textContent = `Scan this to claim your reward for "${compName}".`;
        rewardText.textContent = `Reward: ${reward}`;
        new QRCode(qrContainer, {
          text: `http://localhost:5500/competition/${encodeURIComponent(compName)}/reward`,
          width: 250,
          height: 250,
        });
      });
    }

    // Close menu when clicking outside
    document.addEventListener("click", function handleOutside(e2) {
      if (!menu.contains(e2.target) && !card.contains(e2.target)) {
        menu.remove();
        document.removeEventListener("click", handleOutside);
      }
    });
  });
});

