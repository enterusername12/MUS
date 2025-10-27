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

  const completeOtpVerification = (result = {}) => {
    const { message, user, redirectPath } = result || {};
    const extraMessages = [];
    if (message) {
      extraMessages.push(message);
    }

    const userRole = (user?.role || '').toString().toLowerCase();
    if (userRole.includes('student')) {
      const studentId = user?.studentId || '';
      const officialEmail = (user?.email || '').trim();
      if (studentId) {
        const normalizedStudentId = studentId.toString().toUpperCase();
        const generatedEmail = `${normalizedStudentId}@murdoch.edu.au`;
        extraMessages.push(
          `Your Murdoch student ID is ${normalizedStudentId}. Your official email is ${generatedEmail}.`
        );
      } else if (officialEmail) {
        extraMessages.push(`Your Murdoch student email is ${officialEmail}.`);
      }
    }

    sessionStorage.removeItem('pendingOtpEmail');
    pendingOtpEmail = null;
    if (otpEmailInput) {
      otpEmailInput.value = '';
    }
    hideOtpEntrySection();
    const alertMessage =
      extraMessages.join('\n\n') || 'Your account has been verified successfully.';
    alert(alertMessage);
    window.location.href = redirectPath || 'index.html';
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

  const parseStoredConsent = () => {
    try {
      const raw = localStorage.getItem('userConsent');
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (error) {
      console.warn('Unable to parse stored consent preferences.', error);
      return null;
    }
  };

  const applyPreferencesToForm = (preferences = {}) => {
    if (!form) return;
    const checkboxes = form.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach((checkbox) => {
      const { name } = checkbox;
      let value;
      if (name === 'essential') {
        value = true;
      } else if (Object.prototype.hasOwnProperty.call(preferences, name)) {
        value = Boolean(preferences[name]);
      } else {
        value = checkbox.defaultChecked;
      }
      checkbox.checked = value;
    });
  };

  const setBannerVisibility = (shouldShow) => {
    if (!banner) return;
    banner.style.display = shouldShow ? 'block' : 'none';
  };

  let currentConsent = parseStoredConsent();
  applyPreferencesToForm(currentConsent || {});
  setBannerVisibility(!currentConsent);

  if (acceptBtn) {
    acceptBtn.addEventListener('click', () => {
      currentConsent = {
        essential: true,
        analytics: true,
        email: true,
        payment: true,
        ai: true
      };
      localStorage.setItem('userConsent', JSON.stringify(currentConsent));
      applyPreferencesToForm(currentConsent);
      setBannerVisibility(false);
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
    savePrefs.addEventListener('click', (event) => {
      event.preventDefault();
      const preferences = {};
      form.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
        const { name } = checkbox;
        const value = name === 'essential' ? true : Boolean(checkbox.checked);
        checkbox.checked = value;
        preferences[name] = value;
      });
      localStorage.setItem('userConsent', JSON.stringify(preferences));
      currentConsent = preferences;
      if (modal) modal.style.display = 'none';
      setBannerVisibility(false);
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

    button.disabled = true;
    if (busyText) {
      button.textContent = busyText;
    }

    return () => {
      button.disabled = false;
      button.textContent = original;
    };
  };

  // Sign-in handler -----------------------------------------------------------
  const signInBtn = document.getElementById('signInBtn');
  if (signInBtn) {
    signInBtn.addEventListener('click', async (event) => {
      event.preventDefault();

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

          const trimmedPath = path.trim();
          if (!trimmedPath) return null;

          if (/^https?:\/\//i.test(trimmedPath)) {
            return trimmedPath;
          }

          if (trimmedPath.startsWith('/')) {
            try {
              return new URL(trimmedPath, window.location.origin).href;
            } catch (error) {
              console.warn('Unable to resolve redirect path:', path, error);
              return trimmedPath;
            }
          }

          const withoutLeadingSlash = trimmedPath.replace(/^\/+/, '');
          const ensuredFrontendPath = withoutLeadingSlash.toLowerCase().startsWith('frontend/')
            ? withoutLeadingSlash
            : `Frontend/${withoutLeadingSlash}`;
          const ensuredWithLeadingSlash = ensuredFrontendPath.startsWith('/')
            ? ensuredFrontendPath
            : `/${ensuredFrontendPath}`;

          try {
            return new URL(ensuredWithLeadingSlash, window.location.origin).href;
          } catch (error) {
            console.warn('Unable to resolve redirect path:', path, error);
            return ensuredWithLeadingSlash;
          }
        };

        const normalizedRole = (result.user?.role || role || '').trim().toLowerCase();
        const rawRedirectPath =
          result.redirectPath ||
          redirectMap[normalizedRole] ||
          '/Frontend/studentdashboard.html';
        const redirectPath = normalizePath(rawRedirectPath) || rawRedirectPath;

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
      const personalEmail = document.getElementById('personalEmail')?.value.trim();
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
      if (!personalEmail) {
        alert('Please enter your personal email.');
        return;
      }
      if (!phone) {
        alert('Please enter your phone number.');
        return;
      }
      if (!password || !confirmPassword) {
        alert('Please enter and confirm your password.');
        return;
      }
      if (password !== confirmPassword) {
        alert('Passwords do not match.');
        return;
      }
      if (password.length < 8) {
        alert('Password must be at least 8 characters long.');
        return;
      }

      const resetButton = setButtonBusy(createBtn, 'Creating Account...');
      try {
        const result = await postJSON('/auth/register', {
          role,
          firstName,
          lastName,
          personalEmail,
          phone,
          password,
          confirmPassword
        });
        sessionStorage.setItem('pendingOtpEmail', personalEmail);
        pendingOtpEmail = personalEmail;

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
        completeOtpVerification(result);
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
