// Toggle password visibility and handle forgot password workflow

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.toggle-password').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.target);
      if (!target) return;
      if (target.type === 'password') {
        target.type = 'text';
        btn.textContent = '🙈';
      } else {
        target.type = 'password';
        btn.textContent = '👁️';
      }
    });
  });

  const isLocal =
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  const API_BASE_URL = isLocal
    ? 'http://localhost:3000/api'
    : 'https://mus-g0um.onrender.com/api';

  const requestOtpBtn = document.getElementById('requestOtp');
  const otpInput = document.getElementById('otpInput');
  const otpStatus = document.getElementById('otpStatus');
  const emailInput = document.getElementById('email');
  const form = document.getElementById('resetForm');
  const message = document.getElementById('message');
  const changeBtn = document.getElementById('changeBtn');

  let otpSent = false;

  const setOtpStatus = (text, type = 'muted') => {
    if (!otpStatus) return;
    otpStatus.textContent = text;
    otpStatus.className = `status ${type}`.trim();
  };

  const extractErrorMessage = (payload) => {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    if (payload.message && typeof payload.message === 'string' && payload.message.trim()) {
      return payload.message.trim();
    }

    const { errors } = payload;
    if (!errors) {
      return null;
    }

    if (Array.isArray(errors)) {
      return errors.join(' ');
    }

    if (typeof errors === 'object') {
      return Object.values(errors)
        .flat()
        .filter(Boolean)
        .join(' ');
    }

    if (typeof errors === 'string') {
      return errors;
    }

    return null;
  };

  const parseJsonResponse = async (response) => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const errorMessage =
        extractErrorMessage(data) || 'Something went wrong. Please try again later.';
      throw new Error(errorMessage);
    }
    return data;
  };

  const setFormDisabled = (disabled) => {
    if (!form) return;
    Array.from(form.elements).forEach((el) => {
      if (el === otpInput) {
        el.disabled = disabled || !otpSent;
      } else {
        el.disabled = disabled;
      }
    });
    if (requestOtpBtn) {
      requestOtpBtn.disabled = disabled;
    }
  };

  if (requestOtpBtn) {
    requestOtpBtn.addEventListener('click', async () => {
      const email = emailInput?.value.trim();
      if (!email) {
        setOtpStatus('Please enter your email before requesting an OTP.', 'error');
        return;
      }

      try {
        requestOtpBtn.disabled = true;
        requestOtpBtn.classList.add('is-loading');
        setOtpStatus('Sending OTP…', 'muted');

        const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });

        const data = await parseJsonResponse(response);
        otpSent = true;
        if (otpInput) {
          otpInput.disabled = false;
          otpInput.focus();
        }
        setOtpStatus(
          data?.message || 'OTP sent successfully. Please check your email.',
          'success'
        );
      } catch (error) {
        otpSent = false;
        if (otpInput) {
          otpInput.disabled = true;
        }
        setOtpStatus(error.message || 'Failed to send OTP. Please try again.', 'error');
      } finally {
        requestOtpBtn.disabled = false;
        requestOtpBtn.classList.remove('is-loading');
      }
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (message) {
        message.className = 'status';
        message.textContent = '';
      }

      const email = emailInput?.value.trim();
      const code = otpInput?.value.trim();
      const newPassword = document.getElementById('newPassword')?.value || '';
      const confirmPassword = document.getElementById('confirmPassword')?.value || '';

      const setMessage = (text, type = 'error') => {
        if (!message) return;
        message.textContent = text;
        message.className = `status ${type}`.trim();
      };

      if (!email) {
        setMessage('Email is required.');
        return;
      }

      if (!code) {
        setMessage('Please enter the OTP you received.');
        return;
      }

      if (newPassword !== confirmPassword) {
        setMessage('New password and confirmation do not match.');
        return;
      }

      try {
        setFormDisabled(true);
        if (changeBtn) {
          changeBtn.classList.add('is-loading');
        }
        setMessage('Resetting your password…', 'muted');

        const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, code, newPassword, confirmPassword })
        });

        const data = await parseJsonResponse(response);
        setMessage(
          data?.message || 'Password reset successful. Redirecting to login…',
          'success'
        );

        form.reset();
        otpSent = false;
        if (otpInput) {
          otpInput.disabled = true;
        }
        setOtpStatus('', 'muted');

        setTimeout(() => {
          window.location.href = 'index.html';
        }, 1500);
      } catch (error) {
        setMessage(error.message || 'Failed to reset password. Please try again.');
      } finally {
        setFormDisabled(false);
        if (changeBtn) {
          changeBtn.classList.remove('is-loading');
        }
      }
    });
  }

  const backToAccount = document.getElementById('backToAccount');
  if (backToAccount) {
    backToAccount.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = 'index.html';
    });
  }

  const contactSupport = document.getElementById('contactSupport');
  if (contactSupport) {
    contactSupport.addEventListener('click', (e) => {
      e.preventDefault();
      alert('Contact support: support@murdoch.edu.au');
    });
  }
});
