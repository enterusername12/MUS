document.addEventListener('DOMContentLoaded', ()=>{

// Handle tab switching between Sign In and Create Account (important)
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', (e) => {
    e.preventDefault();
    const target = e.target.textContent.toLowerCase();
    const current = window.location.pathname;

    if (target.includes('create')) {
      window.location.href = 'create-account.html';
    } else if (target.includes('sign')) {
      window.location.href = 'index.html';
    }
  });
});

const togglePassword = document.getElementById('togglePassword');
const passwordInput = document.getElementById('password');
const eyeIcon = document.getElementById('eyeIcon');
const eyeSlashIcon = document.getElementById('eyeSlashIcon');

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


//dummy
// Sign in button - basic validation
const signInBtn = document.getElementById('signInBtn')
if(signInBtn){
signInBtn.addEventListener('click', ()=>{
const email = document.getElementById('email').value.trim()
const pwd = document.getElementById('password').value
if(!email){ alert('Please enter your email.') ; return }
if(!pwd){ alert('Please enter your password.') ; return }
alert('This is a frontend mock — sign-in simulated.\nEmail: '+email)
})
}


// Create account
const createBtn = document.getElementById('createAccountBtn')
if(createBtn){
createBtn.addEventListener('click', ()=>{
const email = document.getElementById('createEmail').value.trim()
const p1 = document.getElementById('createPassword').value
const p2 = document.getElementById('confirmPassword').value
if(!email){ alert('Please enter your email.') ; return }
if(p1.length < 8){ alert('Password must be at least 8 characters.') ; return }
if(p1 !== p2){ alert('Passwords do not match.') ; return }
alert('Account created (simulated).\nEmail: '+email)
})
}


// OTP flow — simulate sending and entering a code
const otpBtn = document.getElementById('otpFlowBtn')
if(otpBtn){
otpBtn.addEventListener('click', ()=>{
window.location.href = 'otp.html'
})
}


const sendOtpBtn = document.getElementById('sendOtpBtn')
if(sendOtpBtn){
sendOtpBtn.addEventListener('click', ()=>{
const email = document.getElementById('otpEmail').value.trim()
if(!email){ alert('Please enter your email.') ; return }
// Simulate sending OTP
const code = Math.floor(100000 + Math.random()*900000)
// In real app, don't show code. Here we show it so the user can simulate entering it.
const proceed = confirm('Simulated: an email was sent to '+email+' with code: '+code+"\n\nPress OK to enter the code now.")
if(!proceed) return
const input = prompt('Enter the 6-digit code you received:')
if(input === String(code)){
alert('OTP verified (simulated). You are signed in.')
window.location.href = 'index.html'
} else {
alert('Incorrect code. Try again.')
}
})
}


// Contact support dummy links
document.querySelectorAll('#contactSupport,#contactSupport2,#contactSupport3').forEach(a=>{
if(!a) return
a.addEventListener('click', (e)=>{
e.preventDefault();
alert('Contact Support (dummy): please email support@murdoch.edu.au or call your local helpdesk.')
})
})

})
