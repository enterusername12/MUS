const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_FILE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);
const ALLOWED_FILE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'pdf', 'txt', 'doc', 'docx']);

const API_BASE_URL = window.getApiBaseUrl ? window.getApiBaseUrl() : 'http://10.51.33.36:3000';
const form = document.getElementById('feedbackForm');
const feedback = document.getElementById('feedback');
const charCount = document.querySelector('.char-count');
const uploadArea = document.getElementById('uploadArea');
const uploadInput = document.getElementById('upload');
const fileName = document.getElementById('file-name');
const categorySelect = document.getElementById('category');
const facilityLocationField = document.getElementById('facilityLocationField');
const facilityLocationInput = document.getElementById('facilityLocation');
const contactEmailInput = document.getElementById('contactEmail');

const LOCATION_REQUIRED_CATEGORIES = new Set(['facilities damages', 'lost', 'found']);

const requiresFacilityLocation = (category) =>
  LOCATION_REQUIRED_CATEGORIES.has((category || '').trim().toLowerCase());

const toggleFacilityLocationField = () => {
  if (!facilityLocationField || !facilityLocationInput || !categorySelect) {
    return;
  }

  const needsLocation = requiresFacilityLocation(categorySelect.value);
  facilityLocationField.style.display = needsLocation ? 'block' : 'none';
  facilityLocationInput.required = needsLocation;

  if (!needsLocation) {
    facilityLocationInput.value = '';
  }
};

categorySelect?.addEventListener('change', toggleFacilityLocationField);
toggleFacilityLocationField();

const setFileMessage = (message = '', isError = false) => {
  fileName.textContent = message;
  fileName.style.color = isError ? '#b3261e' : '';
};

const resetFileInput = () => {
  uploadInput.value = '';
};

const getFileExtension = (file) => {
  const fileName = file?.name || '';
  const lastDot = fileName.lastIndexOf('.');
  return lastDot >= 0 ? fileName.slice(lastDot + 1).toLowerCase() : '';
};

const isAllowedFileType = (file) => {
  const mimeType = (file?.type || '').toLowerCase();
  if (ALLOWED_FILE_MIME_TYPES.has(mimeType)) {
    return true;
  }
  const extension = getFileExtension(file);
  return ALLOWED_FILE_EXTENSIONS.has(extension);
};

const validateFile = (file, { reportErrors = true } = {}) => {
  if (!file) {
    return true;
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    if (reportErrors) {
      setFileMessage('File must be 10MB or smaller.', true);
      resetFileInput();
    }
    return false;
  }

  if (!isAllowedFileType(file)) {
    if (reportErrors) {
      setFileMessage('Unsupported file type. Upload JPG, PNG, GIF, PDF, TXT, DOC or DOCX files.', true);
      resetFileInput();
    }
    return false;
  }

  return true;
};

const handleFileSelection = (file) => {
  if (!file) {
    setFileMessage('');
    return;
  }

  if (!validateFile(file, { reportErrors: true })) {
    return;
  }

  setFileMessage(`Attached: ${file.name}`);
};


// ✅ Live character counter
feedback.addEventListener('input', () => {
  charCount.innerHTML = `${feedback.value.length} / 500 characters`;
});

// ✅ Upload interaction
uploadArea.addEventListener('click', () => uploadInput.click());

uploadInput.addEventListener('change', () => {
  handleFileSelection(uploadInput.files[0]);
});

// ✅ Drag & drop
uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadArea.style.borderColor = '#A12262';
  uploadArea.style.background = '#fef6fa';
});

uploadArea.addEventListener('dragleave', () => {
  uploadArea.style.borderColor = '#ccc';
  uploadArea.style.background = '#fafafa';
});

uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.style.borderColor = '#ccc';
  uploadArea.style.background = '#fafafa';
  uploadInput.files = e.dataTransfer.files;
  handleFileSelection(uploadInput.files[0]);
});

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

// ✅ Submit form
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const category = categorySelect?.value || '';
  const feedbackText = feedback.value.trim();
  const facilityLocationValue = facilityLocationInput?.value.trim() || '';
  const contactEmail = contactEmailInput?.value.trim() || '';
  const file = uploadInput.files[0];

  if (!category || !feedbackText) {
    alert('Please fill in all required fields.');
    return;
  }

  if (requiresFacilityLocation(category) && !facilityLocationValue) {
    alert('Please provide the location for this category.');
    return;
  }

  if (file && !validateFile(file, { reportErrors: true })) {
    return;
  }

  const formData = new FormData();
  formData.append('category', category);
  formData.append('feedback', feedbackText);
  if (facilityLocationValue) {
    formData.append('facilityLocation', facilityLocationValue);
  }
  if (contactEmail) {
    formData.append('email', contactEmail);
  }
  if (file) formData.append('file', file);

  try {
    const res = await fetch(`${API_BASE_URL}/api/feedback`, {
      method: 'POST',
      body: formData,
    });

    if (res.ok) {
      alert('✅ Feedback submitted successfully!');
      form.reset();
      setFileMessage('');
      charCount.innerHTML = `0 / 500 characters <span class="points">+5 points</span>`;
      toggleFacilityLocationField();
    } else {
      const errorBody = await res.json().catch(() => null);
      const errorMessage = errorBody?.error || '❌ Failed to submit feedback. Try again.';
      alert(errorMessage);
    }
  } catch (err) {
    console.error(err);
    alert('⚠️ Error connecting to server.');
  }
});
