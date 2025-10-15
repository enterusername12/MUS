document.addEventListener('DOMContentLoaded', () => {

  // Handle tab switching between Sign In and Create Account
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      const target = e.target.textContent.toLowerCase();
      if (target.includes('create')) {
        window.location.href = 'create-account.html';
      } else if (target.includes('sign')) {
        window.location.href = 'index.html';
      }
    });
  });

  // Password visibility toggle
  const togglePassword = document.getElementById('togglePassword');
  const passwordInput = document.getElementById('password');
  const eyeIcon = document.getElementById('eyeIcon');
  const eyeSlashIcon = document.getElementById('eyeSlashIcon');

  if (togglePassword && passwordInput && eyeIcon && eyeSlashIcon) {
    togglePassword.addEventListener('click', () => {
      const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
      passwordInput.setAttribute('type', type);
      if (type === 'text') {
        eyeSlashIcon.style.display = 'none';
        eyeIcon.style.display = 'block';
      } else {
        eyeIcon.style.display = 'none';
        eyeSlashIcon.style.display = 'block';
      }
    });
  }

  // === Consent Banner Logic ===
  const banner = document.getElementById("consent-banner");
  const modal = document.getElementById("preferences-modal");
  const acceptBtn = document.getElementById("accept-all");
  const manageBtn = document.getElementById("manage-preferences");
  const cancelModal = document.getElementById("cancel-modal");
  const savePrefs = document.getElementById("save-preferences");
  const form = document.getElementById("preferences-form");

  const storedConsent = localStorage.getItem("userConsent");
  if (!storedConsent) banner.style.display = "block";

  // Accept All
  acceptBtn.addEventListener("click", () => {
    localStorage.setItem("userConsent", JSON.stringify({
      essential: true,
      analytics: true,
      email: true,
      payment: true,
      ai: true
    }));
    banner.style.display = "none";
  });

  // Manage Preferences
  manageBtn.addEventListener("click", () => {
    modal.style.display = "flex";
  });

  // Cancel Modal
  cancelModal.addEventListener("click", () => {
    modal.style.display = "none";
  });

  // Save Preferences
  savePrefs.addEventListener("click", () => {
    const data = {};
    new FormData(form).forEach((value, key) => {
      data[key] = true;
    });
    localStorage.setItem("userConsent", JSON.stringify(data));
    modal.style.display = "none";
    banner.style.display = "none";
    alert("Your preferences have been saved.");
  });
});

  // Dummy Sign In
  const signInBtn = document.getElementById('signInBtn');
  if (signInBtn) {
    signInBtn.addEventListener('click', () => {
      const email = document.getElementById('email').value.trim();
      const pwd = document.getElementById('password').value;
      if (!email) return alert('Please enter your email.');
      if (!pwd) return alert('Please enter your password.');
      alert('This is a frontend mock — sign-in simulated.\nEmail: ' + email);
    });
  }

  // Create Account
  const createBtn = document.getElementById('createAccountBtn');
  if (createBtn) {
    createBtn.addEventListener('click', () => {
      const email = document.getElementById('createEmail').value.trim();
      const p1 = document.getElementById('createPassword').value;
      const p2 = document.getElementById('confirmPassword').value;
      if (!email) return alert('Please enter your email.');
      if (p1.length < 8) return alert('Password must be at least 8 characters.');
      if (p1 !== p2) return alert('Passwords do not match.');
      alert('Account created (simulated).\nEmail: ' + email);
    });
  }

  // OTP flow
  const otpBtn = document.getElementById('otpFlowBtn');
  if (otpBtn) {
    otpBtn.addEventListener('click', () => {
      window.location.href = 'otp.html';
    });
  }

  const sendOtpBtn = document.getElementById('sendOtpBtn');
  if (sendOtpBtn) {
    sendOtpBtn.addEventListener('click', () => {
      const email = document.getElementById('otpEmail').value.trim();
      if (!email) return alert('Please enter your email.');
      const code = Math.floor(100000 + Math.random() * 900000);
      const proceed = confirm('Simulated: an email was sent to ' + email + ' with code: ' + code + "\n\nPress OK to enter the code now.");
      if (!proceed) return;
      const input = prompt('Enter the 6-digit code you received:');
      if (input === String(code)) {
        alert('OTP verified (simulated). You are signed in.');
        window.location.href = 'index.html';
      } else {
        alert('Incorrect code. Try again.');
      }
    });
  }

  // Contact Support
  document.querySelectorAll('#contactSupport,#contactSupport2,#contactSupport3').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      alert('Contact Support (dummy): please email support@murdoch.edu.au or call your local helpdesk.');
    });
  });

