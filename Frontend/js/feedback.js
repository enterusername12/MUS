const form = document.getElementById('feedbackForm');
const feedback = document.getElementById('feedback');
const charCount = document.querySelector('.char-count');
const uploadArea = document.getElementById('uploadArea');
const uploadInput = document.getElementById('upload');
const fileName = document.getElementById('file-name');

// ✅ Live character counter
feedback.addEventListener('input', () => {
  charCount.innerHTML = `${feedback.value.length} / 500 characters`;
});

// ✅ Upload interaction
uploadArea.addEventListener('click', () => uploadInput.click());

uploadInput.addEventListener('change', () => {
  if (uploadInput.files.length > 0) {
    fileName.textContent = `Attached: ${uploadInput.files[0].name}`;
  }
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
  if (uploadInput.files.length > 0) {
    fileName.textContent = `Attached: ${uploadInput.files[0].name}`;
  }
});

// ✅ Submit form
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const category = document.getElementById('category').value;
  const feedbackText = feedback.value.trim();
  const file = uploadInput.files[0];

  if (!category || !feedbackText) {
    alert('Please fill in all required fields.');
    return;
  }

  const formData = new FormData();
  formData.append('category', category);
  formData.append('feedback', feedbackText);
  if (file) formData.append('file', file);

  try {
    const res = await fetch('http://localhost:3000/api/feedback', {
      method: 'POST',
      body: formData,
    });

    if (res.ok) {
      alert('✅ Feedback submitted successfully!');
      form.reset();
      fileName.textContent = '';
      charCount.innerHTML = `0 / 500 characters <span class="points">+5 points</span>`;
    } else {
      alert('❌ Failed to submit feedback. Try again.');
    }
  } catch (err) {
    console.error(err);
    alert('⚠️ Error connecting to server.');
  }
});