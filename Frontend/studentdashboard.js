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

// --- Helper to render cards ---
function renderCards(container, data, type) {
    container.innerHTML = "";
    data.forEach(item => {
        const card = document.createElement("div");
        card.classList.add(type === "news" ? "event-card" : "post-card");
        if(type === "news"){
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
function renderDots(dotContainer, count){
    dotContainer.innerHTML = "";
    for(let i=0;i<count;i++){
        const dot = document.createElement("div");
        dot.classList.add("dot");
        if(i===0) dot.classList.add("active");
        dotContainer.appendChild(dot);

        dot.addEventListener("click", ()=>{
            const container = dotContainer.parentElement.querySelector(".events-container, .post-container");
            container.scrollTo({ left: i*container.clientWidth, behavior:"smooth" });
            Array.from(dotContainer.children).forEach(d=>d.classList.remove("active"));
            dot.classList.add("active");
        });
    }
}

// --- Navigation Setup ---
function setupNavigation(prevBtn, nextBtn, container, dotContainer){
    const total = container.children.length;
    let index = 0;

    function updateDots(){
        Array.from(dotContainer.children).forEach((d,i)=>{
            d.classList.toggle("active", i===index);
        });
    }

    prevBtn.addEventListener("click", ()=>{
        index = (index - 1 + total) % total;
        container.scrollTo({ left: index * container.clientWidth, behavior:"smooth" });
        updateDots();
    });

    nextBtn.addEventListener("click", ()=>{
        index = (index + 1) % total;
        container.scrollTo({ left: index * container.clientWidth, behavior:"smooth" });
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

// --- Optional: Create Post Button ---
document.getElementById("createPost").addEventListener("click", (e)=>{
    e.preventDefault();
    alert("Create post functionality to be implemented.");
});
