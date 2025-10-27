// Base API configuration for all dashboard-related requests.
const API_BASE_URL = 'http://localhost:3000/api';

const DASHBOARD_ENDPOINT = `${API_BASE_URL}/dashboard`;

// Safely returns the first non-empty string from a list of candidates.
function pickFirstString(...values) {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }
  return '';
}

// Safely returns the first numeric value (or numeric string) from a list of candidates.
function pickFirstNumber(...values) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

// Restricts a value so it cannot exceed the provided minimum/maximum bounds.
function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

// Displays a lightweight status or error message inside the provided container.
function setStatusMessage(container, message, variant = 'muted') {
  if (!container) return;
  container.innerHTML = '';
  const status = document.createElement('div');
  status.className = `status-message${variant ? ` status-${variant}` : ''}`;
  status.textContent = message;
  container.appendChild(status);
}

// Renders pagination dots and wires click handlers for slider navigation.
function renderDots(dotContainer, count, onSelect) {
  if (!dotContainer) return;
  dotContainer.innerHTML = '';

  if (count <= 1) {
    dotContainer.style.display = 'none';
    return;
  }

  dotContainer.style.display = '';

  for (let i = 0; i < count; i += 1) {
    const dot = document.createElement('div');
    dot.classList.add('dot');
    dot.dataset.index = String(i);
    dot.addEventListener('click', () => {
      onSelect?.(i);
    });
    dotContainer.appendChild(dot);
  }
}

// Sets up slider navigation controls (prev/next buttons and dots) for a scrollable container.
function setupNavigation(prevBtn, nextBtn, container, dotContainer) {
  if (!container || !dotContainer) {
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    return {
      refresh: () => {}
    };
  }

  let index = 0;
  let totalItems = 0;

  const updateDots = () => {
    Array.from(dotContainer.children).forEach((dot, dotIndex) => {
      dot.classList.toggle('active', dotIndex === index);
    });
  };

  const updateButtons = () => {
    const disable = totalItems <= 1;
    [prevBtn, nextBtn].forEach(btn => {
      if (!btn) return;
      btn.disabled = disable;
      btn.classList.toggle('disabled', disable);
    });
  };

  const scrollToIndex = targetIndex => {
    if (totalItems === 0) {
      return;
    }
    index = (targetIndex + totalItems) % totalItems;
    container.scrollTo({
      left: index * container.clientWidth,
      behavior: 'smooth'
    });
    updateDots();
  };

  prevBtn?.addEventListener('click', () => {
    if (totalItems <= 1) return;
    scrollToIndex(index - 1);
  });

  nextBtn?.addEventListener('click', () => {
    if (totalItems <= 1) return;
    scrollToIndex(index + 1);
  });

  const refresh = (count = container.children.length) => {
    totalItems = count;
    index = 0;
    renderDots(dotContainer, totalItems, dotIndex => {
      scrollToIndex(dotIndex);
    });
    updateDots();
    updateButtons();
    if (totalItems === 0) {
      container.scrollTo({ left: 0 });
    }
  };

  refresh(0);

  return { refresh };
}

// Renders either news cards or community highlight cards based on the provided dataset.
function renderCards(container, data, type) {
  if (!container) return 0;

  const items = Array.isArray(data) ? data : [];
  if (items.length === 0) {
    setStatusMessage(
      container,
      type === 'news' ? 'No campus news available yet.' : 'No community highlights available yet.',
      'muted'
    );
    return 0;
  }

  container.innerHTML = '';

  items.forEach(item => {
    const card = document.createElement('div');
    if (type === 'news') {
      card.classList.add('event-card');
      const titleEl = document.createElement('h3');
      titleEl.textContent = pickFirstString(item.title, 'Untitled update');
      const descEl = document.createElement('p');
      descEl.textContent = pickFirstString(item.desc, item.description, 'Details coming soon.');
      card.appendChild(titleEl);
      card.appendChild(descEl);
    } else {
      card.classList.add('post-card');
      const header = document.createElement('div');
      header.classList.add('post-header');

      const author = document.createElement('div');
      author.classList.add('post-author');
      author.textContent = pickFirstString(item.author, 'Community');

      const badge = document.createElement('div');
      badge.classList.add('category-badge');
      badge.textContent = pickFirstString(item.category, 'Highlight');

      header.appendChild(author);
      header.appendChild(badge);
      card.appendChild(header);

      const title = pickFirstString(item.title);
      if (title) {
        const titleEl = document.createElement('h3');
        titleEl.classList.add('post-title');
        titleEl.textContent = title;
        card.appendChild(titleEl);
      }

      const contentEl = document.createElement('p');
      contentEl.classList.add('post-content');
      contentEl.textContent = pickFirstString(item.content, 'Stay tuned for more details.');
      card.appendChild(contentEl);
    }

    container.appendChild(card);
  });

  return items.length;
}

// Normalizes campus news items into the structure expected by the renderer.
function normalizeNewsItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item, index) => ({
    title: pickFirstString(item?.title, item?.headline, item?.name, `Campus Update ${index + 1}`),
    desc: pickFirstString(item?.desc, item?.description, item?.summary, item?.content)
  }));
}

// Normalizes community highlight entries so they always include consistent fields.
function normalizeHighlightItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item, index) => ({
    title: pickFirstString(item?.title, item?.name, item?.headline, `Community Highlight ${index + 1}`),
    author: pickFirstString(item?.author, item?.organizer, item?.host, item?.createdBy, item?.owner, 'Community'),
    category: pickFirstString(item?.category, item?.type, item?.tag, 'Event'),
    content: pickFirstString(item?.content, item?.description, item?.summary, item?.details, item?.title)
  }));
}

// Normalizes poll payloads into a consistent shape (title, options, totals, etc.).
function normalizePolls(items) {
  if (!Array.isArray(items)) return [];

  return items.map((poll, pollIndex) => {
    const options = Array.isArray(poll?.options) ? poll.options : [];
    const fallbackTotal = options.reduce((sum, option) => {
      const votes = pickFirstNumber(option?.votes, option?.count, option?.total, option?.value) || 0;
      return sum + votes;
    }, 0);

    const totalVotes = pickFirstNumber(
      poll?.totalVotes,
      poll?.voteCount,
      poll?.total_votes,
      poll?.votes
    );

    const resolvedTotal = totalVotes ?? fallbackTotal;

    const normalizedOptions = options.map((option, optionIndex) => {
      const percentValue = pickFirstNumber(option?.percent);
      const votes = percentValue === null
        ? pickFirstNumber(option?.votes, option?.count, option?.total, option?.value)
        : null;

      const computedPercent = percentValue !== null
        ? percentValue
        : resolvedTotal > 0 && votes !== null
          ? (votes / resolvedTotal) * 100
          : 0;

      return {
        name: pickFirstString(option?.name, option?.label, option?.option, `Option ${optionIndex + 1}`),
        percent: Math.round(clamp(computedPercent, 0, 100))
      };
    });

    return {
      title: pickFirstString(poll?.title, poll?.question, poll?.prompt, `Poll ${pollIndex + 1}`),
      options: normalizedOptions,
      totalVotes: resolvedTotal || 0,
      deadline: pickFirstString(poll?.deadline, poll?.endsAt, poll?.closesAt, poll?.endDate, poll?.closeDate)
    };
  });
}

// Normalizes spotlight data and selects the most relevant student entry.
function normalizeSpotlight(spotlights) {
  if (!spotlights) return null;
  const entries = Array.isArray(spotlights) ? spotlights : [spotlights];
  if (entries.length === 0) return null;

  const candidate = entries.find(item => item?.isCurrent || item?.current || item?.active) || entries[0];
  if (!candidate || typeof candidate !== 'object') return null;

  const rawMonth = pickFirstString(candidate.month, candidate.period, candidate.cohort);
  let formattedMonth = rawMonth;
  if (rawMonth && /^\d{4}-\d{2}/.test(rawMonth)) {
    const parsed = new Date(rawMonth);
    if (!Number.isNaN(parsed.getTime())) {
      formattedMonth = parsed.toLocaleString('default', { month: 'long' });
    }
  }

  return {
    name: pickFirstString(candidate.name, candidate.studentName, candidate.title, 'Student Spotlight'),
    month: formattedMonth || new Date().toLocaleString('default', { month: 'long' }),
    points: pickFirstNumber(candidate.points, candidate.score, candidate.totalPoints, candidate.rewardPoints) || 0,
    award: pickFirstString(candidate.award, candidate.recognition, candidate.honor, 'Spotlight Award'),
    description: pickFirstString(candidate.description, candidate.summary, candidate.reason, 'Keep up the amazing work!')
  };
}

// Normalizes reward data so the UI can display the user's points and progress summary.
function normalizeReward(rewardData) {
  if (!rewardData) return null;

  if (Array.isArray(rewardData)) {
    const selfEntry = rewardData.find(item => item?.isSelf || item?.self || item?.currentUser || item?.me);
    const entry = selfEntry || rewardData[0];
    if (entry) {
      return normalizeReward(entry);
    }
    return null;
  }

  if (typeof rewardData === 'object') {
    if (rewardData.currentUser) return normalizeReward(rewardData.currentUser);
    if (rewardData.self) return normalizeReward(rewardData.self);
    return {
      points: pickFirstNumber(
        rewardData.points,
        rewardData.total,
        rewardData.score,
        rewardData.rewardPoints,
        rewardData.balance
      ) || 0,
      progress: pickFirstString(
        rewardData.progress,
        rewardData.delta,
        rewardData.change,
        rewardData.trend,
        rewardData.weeklyChange
      )
    };
  }

  return null;
}

// Normalizes calendar entries so they can be rendered as monthly indicator dots.
function normalizeCalendarEntries(entries) {
  if (!Array.isArray(entries)) return [];

  return entries
    .map(entry => {
      const date = pickFirstString(entry?.date, entry?.day, entry?.scheduledFor);
      if (!date) return null;
      return {
        date,
        type: pickFirstString(entry?.type, entry?.category, entry?.kind, 'event').toLowerCase(),
        title: pickFirstString(entry?.title, entry?.name, entry?.summary, entry?.description),
        time: pickFirstString(entry?.time, entry?.startTime, entry?.startsAt, entry?.timeRange)
      };
    })
    .filter(Boolean);
}

// Renders poll cards and updates the poll counter shown next to the section header.
function renderPolls(container, polls, pollCountEl) {
  if (!container) return 0;

  const items = Array.isArray(polls) ? polls : [];
  if (items.length === 0) {
    setStatusMessage(container, 'No active polls right now.', 'muted');
    if (pollCountEl) {
      pollCountEl.textContent = '0 Active';
    }
    return 0;
  }

  container.innerHTML = '';

  items.forEach(poll => {
    const pollCard = document.createElement('div');
    pollCard.classList.add('poll-card');

    const header = document.createElement('div');
    header.classList.add('poll-header');

    const icon = document.createElement('div');
    icon.classList.add('poll-icon');
    icon.textContent = '📈';

    const titleWrapper = document.createElement('div');
    const titleEl = document.createElement('div');
    titleEl.classList.add('poll-title');
    titleEl.textContent = pickFirstString(poll.title, 'Poll');

    const subtitleEl = document.createElement('div');
    subtitleEl.classList.add('poll-subtitle');
    subtitleEl.textContent = `${poll.options.length} options available`;

    titleWrapper.appendChild(titleEl);
    titleWrapper.appendChild(subtitleEl);

    header.appendChild(icon);
    header.appendChild(titleWrapper);

    const deadlineText = pickFirstString(poll.deadline);
    if (deadlineText) {
      const deadlineEl = document.createElement('div');
      deadlineEl.classList.add('poll-deadline');
      deadlineEl.style.marginLeft = 'auto';
      deadlineEl.style.color = '#b33a3a';
      deadlineEl.style.fontSize = '0.85rem';
      deadlineEl.textContent = `🗓 Ends ${deadlineText}`;
      header.appendChild(deadlineEl);
    }

    pollCard.appendChild(header);

    const optionsWrapper = document.createElement('div');
    optionsWrapper.classList.add('poll-options');

    poll.options.forEach(option => {
      const optionEl = document.createElement('div');
      optionEl.classList.add('poll-option');

      const label = document.createElement('div');
      label.classList.add('option-label');

      const nameSpan = document.createElement('span');
      nameSpan.textContent = option.name;

      const percentSpan = document.createElement('span');
      percentSpan.textContent = `${option.percent}%`;

      label.appendChild(nameSpan);
      label.appendChild(percentSpan);

      const progressBar = document.createElement('div');
      progressBar.classList.add('progress-bar');

      const progressFill = document.createElement('div');
      progressFill.classList.add('progress-fill');
      progressFill.style.width = `${option.percent}%`;

      progressBar.appendChild(progressFill);

      optionEl.appendChild(label);
      optionEl.appendChild(progressBar);

      optionsWrapper.appendChild(optionEl);
    });

    pollCard.appendChild(optionsWrapper);

    const footer = document.createElement('div');
    footer.classList.add('poll-footer');

    const totalVotesEl = document.createElement('span');
    totalVotesEl.textContent = `👥 ${poll.totalVotes} total votes`;

    const voteButton = document.createElement('button');
    voteButton.classList.add('vote-btn');
    voteButton.textContent = 'Vote Now';

    footer.appendChild(totalVotesEl);
    footer.appendChild(voteButton);

    pollCard.appendChild(footer);

    container.appendChild(pollCard);
  });

  if (pollCountEl) {
    pollCountEl.textContent = `${items.length} Active`;
  }

  return items.length;
}

// Updates the student spotlight module with loading, error, or populated states.
function loadStudentSpotlight(data, { loading = false, error = false } = {}) {
  const nameEl = document.getElementById('spotlightName');
  const monthEl = document.getElementById('spotlightMonth');
  const pointsEl = document.getElementById('spotlightPoints');
  const awardEl = document.getElementById('spotlightAward');
  const descriptionEl = document.getElementById('spotlightDescription');

  if (!nameEl || !monthEl || !pointsEl || !awardEl || !descriptionEl) {
    return;
  }

  if (!data) {
    if (loading) {
      nameEl.textContent = 'Loading spotlight…';
      monthEl.textContent = 'Student Spotlight';
      pointsEl.textContent = '';
      awardEl.textContent = '';
      descriptionEl.textContent = '';
      return;
    }

    if (error) {
      nameEl.textContent = 'Unable to load spotlight data';
      monthEl.textContent = 'Student Spotlight';
      pointsEl.textContent = '--';
      awardEl.textContent = '';
      descriptionEl.textContent = 'Please try again later.';
      return;
    }

    nameEl.textContent = 'Spotlight coming soon';
    monthEl.textContent = 'Student Spotlight';
    pointsEl.textContent = '--';
    awardEl.textContent = 'Stay tuned';
    descriptionEl.textContent = 'We will highlight an outstanding student shortly.';
    return;
  }

  nameEl.textContent = data.name;
  monthEl.textContent = `${data.month} Spotlight`;
  pointsEl.textContent = `${data.points} points earned`;
  awardEl.textContent = data.award;
  descriptionEl.textContent = data.description;
}

// Updates the reward points widget so students can see their current progress.
function loadRewardPoints(data, { loading = false, error = false } = {}) {
  const pointsEl = document.getElementById('rewardPoints');
  const progressEl = document.getElementById('rewardProgress');

  if (!pointsEl || !progressEl) return;

  if (!data) {
    if (loading) {
      pointsEl.textContent = 'Loading…';
      progressEl.textContent = 'Fetching your progress…';
      return;
    }

    if (error) {
      pointsEl.textContent = '--';
      progressEl.textContent = 'Unable to load reward progress.';
      return;
    }

    pointsEl.textContent = '--';
    progressEl.textContent = 'No reward progress available yet.';
    return;
  }

  const points = pickFirstNumber(data.points) ?? 0;
  const progressText = pickFirstString(
    data.progress,
    data.delta,
    data.change,
    data.trend,
    data.weeklyChange,
    '+0 this week'
  );

  pointsEl.textContent = `${points} Points`;
  progressEl.textContent = progressText;
}

// Generates the headers for authenticated requests, including a stored token if available.
function buildAuthHeaders() {
  const headers = {
    Accept: 'application/json'
  };
  try {
    const token = window.localStorage.getItem('musAuthToken');
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  } catch (error) {
    console.warn('Unable to access localStorage for auth token.', error);
  }
  return headers;
}

// Attempts to parse a response body as JSON, returning null if parsing fails.
async function safeParseJSON(response) {
  try {
    return await response.json();
  } catch (error) {
    return null;
  }
}

// Sets up the interactive calendar widget and returns a method to refresh its data.
function initializeCalendar() {
  const monthYear = document.getElementById('monthYear');
  const grid = document.getElementById('calendarGrid');
  if (!monthYear || !grid) {
    return () => {};
  }

  const prevButton = document.getElementById('prevMonth');
  const nextButton = document.getElementById('nextMonth');

  let currentDate = new Date();
  let events = [];

  const colorMap = {
    poll: 'red',
    competition: 'purple',
    event: 'green'
  };

  const renderCalendar = () => {
    grid.innerHTML = '';

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    monthYear.textContent = currentDate.toLocaleString('default', {
      month: 'long',
      year: 'numeric'
    });

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDay; i += 1) {
      const empty = document.createElement('div');
      grid.appendChild(empty);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const cell = document.createElement('div');
      cell.classList.add('day');

      const dateLabel = document.createElement('div');
      dateLabel.classList.add('date');
      dateLabel.textContent = String(day);

      const dotsContainer = document.createElement('div');
      dotsContainer.classList.add('indicators');

      const fullDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const eventsToday = events.filter(event => event.date === fullDate);

      eventsToday.forEach(event => {
        const dot = document.createElement('div');
        dot.classList.add('dot', colorMap[event.type] || 'green');
        if (event.title || event.time) {
          const label = [event.title, event.time].filter(Boolean).join(' — ');
          if (label) {
            dot.title = label;
          }
        }
        dotsContainer.appendChild(dot);
      });

      cell.appendChild(dateLabel);
      cell.appendChild(dotsContainer);
      grid.appendChild(cell);
    }
  };

  prevButton?.addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar();
  });

  nextButton?.addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar();
  });

  renderCalendar();

  return newEvents => {
    events = normalizeCalendarEntries(newEvents);
    renderCalendar();
  };
}

// Bootstraps all dashboard widgets once the DOM has fully loaded.
document.addEventListener('DOMContentLoaded', () => {
  const eventsContainer = document.getElementById('eventsContainer');
  const newsDots = document.getElementById('newsDots');
  const newsSlider = setupNavigation(
    document.getElementById('prevNewsBtn'),
    document.getElementById('nextNewsBtn'),
    eventsContainer,
    newsDots
  );

  const postContainer = document.getElementById('postContainer');
  const postDots = document.getElementById('postDots');
  const postSlider = setupNavigation(
    document.getElementById('prevPostBtn'),
    document.getElementById('nextPostBtn'),
    postContainer,
    postDots
  );

  const pollContainer = document.getElementById('pollContainer');
  const pollDots = document.getElementById('pollDots');
  const pollSlider = setupNavigation(
    document.getElementById('prevPollBtn'),
    document.getElementById('nextPollBtn'),
    pollContainer,
    pollDots
  );

  const pollCount = document.getElementById('pollCount');

  if (eventsContainer) {
    setStatusMessage(eventsContainer, 'Loading campus news…', 'muted');
    newsSlider.refresh(0);
  }

  if (postContainer) {
    setStatusMessage(postContainer, 'Loading community highlights…', 'muted');
    postSlider.refresh(0);
  }

  if (pollContainer) {
    setStatusMessage(pollContainer, 'Loading polls…', 'muted');
    pollSlider.refresh(0);
  }

  if (pollCount) {
    pollCount.textContent = 'Loading…';
  }

  loadStudentSpotlight(null, { loading: true });
  loadRewardPoints(null, { loading: true });

  const updateCalendar = initializeCalendar();

  // Fetches dashboard data from the backend and hydrates each widget with live results.
  const fetchDashboardData = async () => {
    try {
      const response = await fetch(DASHBOARD_ENDPOINT, {
        method: 'GET',
        credentials: 'include',
        headers: buildAuthHeaders()
      });

      const payload = await safeParseJSON(response);

      if (!response.ok) {
        const message = payload?.message || 'Unable to load dashboard data. Please try again later.';
        throw new Error(message);
      }

      const data = payload || {};

      const newsItems = normalizeNewsItems(data.news);
      const newsCount = renderCards(eventsContainer, newsItems, 'news');
      newsSlider.refresh(newsCount);

      const highlights = normalizeHighlightItems(data.events);
      const postCount = renderCards(postContainer, highlights, 'post');
      postSlider.refresh(postCount);

      const polls = normalizePolls(data.polls);
      const pollItemCount = renderPolls(pollContainer, polls, pollCount);
      pollSlider.refresh(pollItemCount);

      const spotlight = normalizeSpotlight(data.spotlights);
      if (spotlight) {
        loadStudentSpotlight(spotlight);
      } else {
        loadStudentSpotlight(null);
      }

      const reward = normalizeReward(data.rewardLeaders);
      if (reward) {
        loadRewardPoints(reward);
      } else {
        loadRewardPoints(null);
      }

      updateCalendar(data.calendar);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);

      setStatusMessage(eventsContainer, 'Unable to load campus news right now.', 'error');
      newsSlider.refresh(0);

      if (postContainer) {
        setStatusMessage(postContainer, 'Unable to load community highlights right now.', 'error');
        postSlider.refresh(0);
      }

      if (pollContainer) {
        setStatusMessage(pollContainer, 'Unable to load polls right now.', 'error');
        pollSlider.refresh(0);
      }

      if (pollCount) {
        pollCount.textContent = '0 Active';
      }

      loadStudentSpotlight(null, { error: true });
      loadRewardPoints(null, { error: true });
      updateCalendar([]);
    }
  };

  fetchDashboardData();

  // Handles the share-post modal workflow, including open/close actions and submission.
  const shareModal = document.getElementById('sharePostModal');
  const openShareModalBtn = document.getElementById('createPost');
  const closeShareModalBtn = document.getElementById('closeShareModal');
  const cancelPostBtn = document.getElementById('cancelPostBtn');
  const form = document.getElementById('sharePostForm');

  openShareModalBtn?.addEventListener('click', event => {
    event.preventDefault();
    shareModal?.classList.remove('hidden');
  });

  closeShareModalBtn?.addEventListener('click', () => {
    shareModal?.classList.add('hidden');
  });

  cancelPostBtn?.addEventListener('click', () => {
    shareModal?.classList.add('hidden');
  });

  window.addEventListener('click', event => {
    if (shareModal && event.target === shareModal) {
      shareModal.classList.add('hidden');
    }
  });

  form?.addEventListener('submit', async event => {
    event.preventDefault();

    const title = document.getElementById('postTitle')?.value.trim();
    const category = document.getElementById('postCategory')?.value;
    const tags = document.getElementById('postTags')?.value.trim();
    const description = document.getElementById('postDescription')?.value.trim();
    const photo = document.getElementById('postPhoto')?.files?.[0];

    if (!title || !description) {
      alert('Please fill out the required fields.');
      return;
    }

    const formData = new FormData();
    formData.append('title', title);
    formData.append('category', category || '');
    formData.append('tags', tags || '');
    formData.append('description', description);
    if (photo) {
      formData.append('photo', photo);
    }

    try {
      const response = await fetch(`${API_BASE_URL}/posts`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('Failed to share post');
      }

      alert('✅ Post shared successfully!');
      shareModal?.classList.add('hidden');
      form.reset();
    } catch (error) {
      console.error('❌ Error sharing post:', error);
      alert(`❌ Error: ${error.message}`);
    }
  });
});
