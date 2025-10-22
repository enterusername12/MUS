document.addEventListener("DOMContentLoaded", () => {
  const pollContainer = document.getElementById("pollContainer");
  const competitionContainer = document.getElementById("competitionContainer");

  // 🟩 Demo Poll Data (Replace later with backend data)
  const polls = [
    { id: 1, title: "Best Campus Food Option", votes: 234, status: "active", ends: "Oct 20" },
    { id: 2, title: "Favorite Study Spot", votes: 189, status: "active", ends: "Oct 18" },
    { id: 3, title: "Preferred Library Hours", votes: 456, status: "ended", ends: "Oct 10" }
  ];

  // 🟦 Demo Competition Data (Replace later with backend data)
  const competitions = [
    { id: 1, title: "Hackathon 2025", participants: 45, status: "ongoing", due: "Nov 1" },
    { id: 2, title: "Photography Contest", participants: 67, status: "upcoming", due: "Oct 30" },
    { id: 3, title: "Essay Writing Competition", participants: 89, status: "enrolled", due: "Oct 5" }
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
    card.innerHTML = `
      <div class="card-header">
        <span>Competition #${comp.id}</span>
        <span class="status ${comp.status}">${comp.status}</span>
        <span class="ends">Due: ${comp.due}</span>
      </div>
      <h3>${comp.title}</h3>
      <p>${comp.participants} participants</p>
    `;
    competitionContainer.appendChild(card);
  });
});
