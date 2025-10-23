document.addEventListener('DOMContentLoaded', () => {
  const API_BASE_URL = 'http://localhost:3000/api';

  let pendingOtpEmail = sessionStorage.getItem('pendingOtpEmail');
  const otpEmailInput = document.getElementById('otpEmail');
  const otpEntrySection = document.getElementById('otpEntrySection');
  const otpInstructions = document.getElementById('otpInstructions');
  const defaultOtpInstruction = otpInstructions?.textContent || '';
  const otpCodeInput = document.getElementById('otpCode');
  const verifyOtpBtn = document.getElementById('verifyOtpBtn');

  const showOtpEntrySection = ({ message, resetCode = false, focusCode = false } = {}) => {
    if (!otpEntrySection) {
      return;
    }
    if (otpInstructions) {
      otpInstructions.textContent = message || defaultOtpInstruction;
    }
    otpEntrySection.hidden = false;
    if (resetCode && otpCodeInput) {
      otpCodeInput.value = '';
    }
    if (focusCode && otpCodeInput) {
      otpCodeInput.focus();
    }
  };

  const hideOtpEntrySection = () => {
    if (!otpEntrySection) {
      return;
    }
    otpEntrySection.hidden = true;
    if (otpInstructions) {
      otpInstructions.textContent = defaultOtpInstruction;
    }
    if (otpCodeInput) {
      otpCodeInput.value = '';
    }
  };

  const completeOtpVerification = (message) => {
    sessionStorage.removeItem('pendingOtpEmail');
    pendingOtpEmail = null;
    if (otpEmailInput) {
      otpEmailInput.value = '';
    }
    hideOtpEntrySection();
    alert(message || 'Your account has been verified successfully.');
    window.location.href = 'index.html';
  };

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
//
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

                const redirectMap = {
          student: '/Frontend/studentdashboard.html',
          'guest / visitor': '/Frontend/guestdashboard.html',
          guest: '/Frontend/guestdashboard.html',
          visitor: '/Frontend/guestdashboard.html',
          staff: '/Frontend/staffdashboard.html',
          'staff (admin only)': '/Frontend/staffdashboard.html',
          admin: '/Frontend/staffdashboard.html',
          'admin (admin only)': '/Frontend/staffdashboard.html'
        };

        const normalizePath = (path) => {
          if (!path) return null;
          if (/^https?:\/\//i.test(path)) {
            return path;
          }
          const trimmed = path.replace(/^\/+/, '');
          const normalized = /^frontend\//i.test(trimmed)
            ? trimmed
            : `Frontend/${trimmed}`;
          return `/${normalized.replace(/^\/+/, '')}`;
        };

        const normalizedRole = (result.user?.role || role || '').trim().toLowerCase();
        const redirectPath =
          normalizePath(result.redirectPath) ||
          redirectMap[normalizedRole] ||
          '/Frontend/studentdashboard.html';

        window.location.href = redirectPath;

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
      const normalizedEmail = email.toLowerCase();
      if (role === 'Student') {
        if (normalizedEmail.endsWith('@gmail.com')) {
          alert(
            'Student accounts cannot be created with Gmail addresses. Please use your Murdoch University student email (e.g., name@murdoch.edu.au).'
          );
          return;
        }

        const emailDomain = normalizedEmail.split('@')[1] || '';
        const isMurdochDomain =
          emailDomain === 'murdoch.edu.au' || emailDomain.endsWith('.murdoch.edu.au');

        if (!isMurdochDomain) {
          alert(
            'Please use your Murdoch University student email address (e.g., name@murdoch.edu.au) to create a student account.'
          );
          return;
        }
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

        let message = result?.message || 'Registration received. Please verify your email to continue.';
        if (result?.otp?.message) {
          message += `\n\n${result.otp.message}`;
        }

        alert(message);

        window.location.href = 'otp.html';
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
      const email = otpEmailInput?.value.trim() || pendingOtpEmail || '';
      if (!email) {
        alert('Please enter your email.');
        return;
      }

      const resetButton = setButtonBusy(sendOtpBtn, 'Sending...');
      try {
        const response = await postJSON('/auth/request-otp', { email });
        const message = response?.message || `A verification code has been sent to ${email}.`;

        sessionStorage.setItem('pendingOtpEmail', email);
        pendingOtpEmail = email;

        if (otpEmailInput && !otpEmailInput.value) {
          otpEmailInput.value = email;
        }

        alert(message);
        showOtpEntrySection({
          message: `${message} Enter the code below to continue.`,
          resetCode: true,
          focusCode: true
        });
      } catch (error) {
        alert(error.message);
      } finally {
        resetButton();
      }
    });
  }

  if (verifyOtpBtn) {
    verifyOtpBtn.addEventListener('click', async () => {
      const email = otpEmailInput?.value.trim() || pendingOtpEmail || '';
      if (!email) {
        alert('Please enter your email before verifying your code.');
        return;
      }

      const code = otpCodeInput?.value.trim();
      if (!code) {
        alert('Please enter the verification code.');
        otpCodeInput?.focus();
        return;
      }

      if (!/^\d{6}$/.test(code)) {
        alert('The verification code should be a 6-digit number.');
        otpCodeInput?.focus();
        return;
      }

      const resetButton = setButtonBusy(verifyOtpBtn, 'Verifying...');
      try {
        const result = await postJSON('/auth/verify-otp', { email, code });
        localStorage.setItem('musAuthToken', result.token);
        localStorage.setItem('musAuthUser', JSON.stringify(result.user));
        completeOtpVerification(result?.message);
      } catch (error) {
        alert(error.message);
      } finally {
        resetButton();
      }
    });
  }

  if (otpEmailInput && !otpEmailInput.value && pendingOtpEmail) {
    otpEmailInput.value = pendingOtpEmail;
  }

  if (pendingOtpEmail) {
    showOtpEntrySection();
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


//..
