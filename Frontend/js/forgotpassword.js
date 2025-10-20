// Toggle password visibility
document.querySelectorAll('.toggle-password').forEach(btn => {
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
//
const requestOtpBtn = document.getElementById('requestOtp');
const otpInput = document.getElementById('otpInput');
const otpStatus = document.getElementById('otpStatus');
const emailInput = document.getElementById('email');
let simulatedOtp = null;
let otpSent = false;

requestOtpBtn.addEventListener('click', () => {
  const email = emailInput.value.trim();
  if (!email) {
    otpStatus.textContent = 'Please enter your email before requesting an OTP.';
    otpStatus.className = 'status error';
    return;
  }
  simulatedOtp = String(Math.floor(100000 + Math.random() * 900000));
  otpSent = true;
  otpInput.disabled = false;
  otpInput.focus();
  otpStatus.innerHTML = 'OTP sent to ' + email + ' — (simulated: ' + simulatedOtp + ')';
  otpStatus.className = 'status muted';
});

const form = document.getElementById('resetForm');
const message = document.getElementById('message');

form.addEventListener('submit', (e) => {
  e.preventDefault();
  message.className = 'status';
  const newP = document.getElementById('newPassword').value;
  const confirmP = document.getElementById('confirmPassword').value;
  const enteredOtp = otpInput.value.trim();

  if (!otpSent) {
    message.textContent = 'Please request and verify your OTP first.';
    message.classList.add('error');
    return;
  }

  if (!enteredOtp) {
    message.textContent = 'Please enter the OTP.';
    message.classList.add('error');
    return;
  }

  if (enteredOtp !== simulatedOtp) {
    message.textContent = 'OTP is incorrect.';
    message.classList.add('error');
    return;
  }

  if (!newP || !confirmP) {
    message.textContent = 'Please fill in all password fields.';
    message.classList.add('error');
    return;
  }

  if (newP !== confirmP) {
    message.textContent = 'New password and confirmation do not match.';
    message.classList.add('error');
    return;
  }

  if (newP.length < 8) {
    message.textContent = 'Password must be at least 8 characters.';
    message.classList.add('error');
    return;
  }

  message.textContent = 'Password reset successful! Please sign in using your new password.';
  message.className = 'status success';
  setTimeout(() => { form.reset(); otpInput.disabled = true; otpStatus.textContent = ''; }, 1200);
});

document.getElementById('backToAccount').addEventListener('click', (e)=>{
  e.preventDefault();
  alert('This would return to your Sign In page.');
});

document.getElementById('contactSupport').addEventListener('click', (e)=>{
  e.preventDefault();
  alert('Contact support: support@murdoch.edu.au');
});
