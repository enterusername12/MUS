document.addEventListener('DOMContentLoaded', () => {
  const API_BASE_URL = (window.MUS_API_BASE_URL || 'http://localhost:3000/api').replace(/\/$/, '');
  let pendingOtpEmail = sessionStorage.getItem('pendingOtpEmail');

  // Handle tab switching between Sign In and Create Account
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      const target = e.target.dataset.target || e.target.textContent.toLowerCase();

      if (target.includes('create')) {
        window.location.href = 'create-account.html';
      } else if (target.includes('sign')) {
        window.location.href = 'index.html';
      }
    });
  });

  // Password visibility toggle on the sign-in page
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
  const banner = document.getElementById('consent-banner');
  const modal = document.getElementById('preferences-modal');
  const acceptBtn = document.getElementById('accept-all');
  const manageBtn = document.getElementById('manage-preferences');
  const cancelModal = document.getElementById('cancel-modal');
  const savePrefs = document.getElementById('save-preferences');
  const form = document.getElementById('preferences-form');

  const storedConsent = localStorage.getItem('userConsent');
  if (!storedConsent && banner) {
    banner.style.display = 'block';
  }

  if (acceptBtn) {
    acceptBtn.addEventListener('click', () => {
      localStorage.setItem(
        'userConsent',
        JSON.stringify({
          essential: true,
          analytics: true,
          email: true,
          payment: true,
          ai: true
        })
      );
      if (banner) banner.style.display = 'none';
      if (modal) modal.style.display = 'none';
    });
  }

  if (manageBtn && modal) {
    manageBtn.addEventListener('click', () => {
      modal.style.display = 'flex';
    });
  }

  if (cancelModal && modal) {
    cancelModal.addEventListener('click', () => {
      modal.style.display = 'none';
    });
  }

  if (savePrefs && form) {
    savePrefs.addEventListener('click', () => {
      const data = {};
      new FormData(form).forEach((value, key) => {
        data[key] = true;
      });
      localStorage.setItem('userConsent', JSON.stringify(data));
      if (modal) modal.style.display = 'none';
      if (banner) banner.style.display = 'none';
      alert('Your preferences have been saved.');
    });
  }

  // Helper to send JSON payloads to the backend
  const postJSON = async (path, data) => {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload?.message || 'Something went wrong. Please try again later.';
      throw new Error(message);
    }
    return payload;
  };

  const setButtonBusy = (button, busyText) => {
    if (!button) return () => {};
    const original = button.textContent;
    button.dataset.originalText = original;
    button.disabled = true;
    button.classList.add('is-loading');
    if (busyText) {
      button.textContent = busyText;
    }

    return () => {
      button.disabled = false;
      button.classList.remove('is-loading');
      button.textContent = button.dataset.originalText || original;
    };
  };

  // Sign-in handler ---------------------------------------------------------
  const signInBtn = document.getElementById('signInBtn');
  if (signInBtn) {
    signInBtn.addEventListener('click', async () => {
      const email = document.getElementById('email')?.value.trim();
      const password = document.getElementById('password')?.value;
      const role = document.getElementById('roleSelect')?.value || '';

      if (!email) {
        alert('Please enter your email.');
        return;
      }
      if (!password) {
        alert('Please enter your password.');
        return;
      }

      const resetButton = setButtonBusy(signInBtn, 'Signing In...');
      try {
        const result = await postJSON('/auth/login', { email, password, role });
        localStorage.setItem('musAuthToken', result.token);
        localStorage.setItem('musAuthUser', JSON.stringify(result.user));
        alert('Login successful!');
        console.info('Authenticated user:', result.user);
        // Redirect to dashboard/home once available
      } catch (error) {
        alert(error.message);
      } finally {
        resetButton();
      }
    });
  }

  // Registration handler ----------------------------------------------------
  const createBtn = document.getElementById('createAccountBtn');
  if (createBtn) {
    createBtn.addEventListener('click', async () => {
      const role = document.getElementById('createRole')?.value || '';
      const firstName = document.getElementById('firstName')?.value.trim();
      const lastName = document.getElementById('lastName')?.value.trim();
      const email = document.getElementById('createEmail')?.value.trim();
      const studentId = document.getElementById('studentId')?.value.trim();
      const phone = document.getElementById('phone')?.value.trim();
      const password = document.getElementById('createPassword')?.value;
      const confirmPassword = document.getElementById('confirmPassword')?.value;

      if (!role) {
        alert('Please select a role.');
        return;
      }
      if (!firstName || !lastName) {
        alert('Please enter your first and last names.');
        return;
      }
      if (!email) {
        alert('Please enter your email.');
        return;
      }
      if (!password || password.length < 8) {
        alert('Password must be at least 8 characters.');
        return;
      }
      if (password !== confirmPassword) {
        alert('Passwords do not match.');
        return;
      }

      const resetButton = setButtonBusy(createBtn, 'Creating...');
      try {
        const result = await postJSON('/auth/register', {
          role,
          firstName,
          lastName,
          email,
          studentId,
          phone,
          password,
          confirmPassword
        });
        sessionStorage.setItem('pendingOtpEmail', email);
        pendingOtpEmail = email;

        let message = 'Account created successfully!';
        if (result?.otp?.message) {
          message += `\n\n${result.otp.message}`;
        }

        alert(message);

        if (result?.otp?.sent) {
          const proceed = confirm('Would you like to enter the verification code now?');
          if (proceed) {
            window.location.href = 'otp.html';
            return;
          }
        }

        window.location.href = 'index.html';
      } catch (error) {
        alert(error.message);
      } finally {
        resetButton();
      }
    });
  }

  // OTP flow — simulate sending and entering a code
  const otpBtn = document.getElementById('otpFlowBtn');
  if (otpBtn) {
    otpBtn.addEventListener('click', () => {
      window.location.href = 'otp.html';
    });
  }

  const sendOtpBtn = document.getElementById('sendOtpBtn');
  if (sendOtpBtn) {
    sendOtpBtn.addEventListener('click', async () => {
      const emailInput = document.getElementById('otpEmail');
      const email = emailInput?.value.trim() || pendingOtpEmail || '';
      if (!email) {
        alert('Please enter your email.');
        return;
      }

      const resetButton = setButtonBusy(sendOtpBtn, 'Sending...');
      try {
        if (emailInput && !emailInput.value) {
          emailInput.value = email;
        }
        sessionStorage.setItem('pendingOtpEmail', email);
        pendingOtpEmail = email;
        await postJSON('/auth/request-otp', { email });
        alert(`A verification code has been sent to ${email}.`);

        const code = prompt('Enter the 6-digit code we emailed to you:');
        if (!code) {
          alert('Verification cancelled. You can request another code when you are ready.');
          return;
        }

        const trimmedCode = code.trim();
        if (!trimmedCode) {
          alert('Please enter the code to continue.');
          return;
        }

        if (!/^\d{6}$/.test(trimmedCode)) {
          alert('The verification code should be a 6-digit number.');
          return;
        }

        const result = await postJSON('/auth/verify-otp', { email, code: trimmedCode });
        localStorage.setItem('musAuthToken', result.token);
        localStorage.setItem('musAuthUser', JSON.stringify(result.user));
        sessionStorage.removeItem('pendingOtpEmail');
        alert('OTP verified! You are signed in.');
        window.location.href = 'index.html';
      } catch (error) {
        alert(error.message);
      } finally {
        resetButton();
      }
    });
  }

  const otpEmailInput = document.getElementById('otpEmail');
  if (otpEmailInput && !otpEmailInput.value && pendingOtpEmail) {
    otpEmailInput.value = pendingOtpEmail;
  }

  // Contact support dummy links
  document.querySelectorAll('#contactSupport,#contactSupport2,#contactSupport3').forEach((link) => {
    if (!link) return;
    link.addEventListener('click', (e) => {
      e.preventDefault();
      alert('Contact Support (dummy): please email support@murdoch.edu.au or call your local helpdesk.');
    });
  });
});
