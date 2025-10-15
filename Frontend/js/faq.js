function toggleFaq(element) {
    const faqItem = element.parentElement;
    const isActive = faqItem.classList.contains('active');
    
    document.querySelectorAll('.faq-item').forEach(item => {
        item.classList.remove('active');
    });
    
    if (!isActive) {
        faqItem.classList.add('active');
    }
}

// --- Recommended Search Suggestions ---
const recommendations = [
  "Posts & Community",
  "How do I like or comment on a post?",
  "How do I share a post?",
  "How do I edit my profile?",
  "Polls & Voting",
  "Calendar & Events",
  "Feedback",
  "Rewards & Points",
  "Campus News",
  "Contact Support"
];

const suggestionsBox = document.getElementById("suggestions");

function showSuggestions(value) {
  const input = value.toLowerCase();
  suggestionsBox.innerHTML = "";

  let filtered = recommendations.filter(r => r.toLowerCase().includes(input));
  if (input === "") filtered = recommendations; // Show all if empty

  if (filtered.length === 0) {
    suggestionsBox.innerHTML = "<li>No results found</li>";
  } else {
    filtered.forEach(r => addSuggestion(r));
  }

  suggestionsBox.classList.remove("hidden");
}

function addSuggestion(text) {
  const li = document.createElement("li");
  li.textContent = text;
  li.onclick = () => {
    document.getElementById("searchInput").value = text;
    suggestionsBox.classList.add("hidden");
    // Optionally scroll to section if it matches
    scrollToFaq(text);
  };
  suggestionsBox.appendChild(li);
}

function toggleSuggestions(show) {
  if (show) {
    showSuggestions(document.getElementById("searchInput").value);
  } else {
    suggestionsBox.classList.add("hidden");
  }
}

function hideSuggestionsDelayed() {
  setTimeout(() => suggestionsBox.classList.add("hidden"), 150);
}

// Optional: Scroll to section when suggestion clicked
function scrollToFaq(keyword) {
  const sectionTitles = document.querySelectorAll(".section-title, .faq-question");
  for (let el of sectionTitles) {
    if (el.textContent.toLowerCase().includes(keyword.toLowerCase())) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.style.backgroundColor = "#fff7cc";
      setTimeout(() => el.style.backgroundColor = "", 1500);
      break;
    }
  }
}