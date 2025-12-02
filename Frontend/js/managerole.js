const API_BASE_URL = 'http://localhost:3000/api';

let usersData = [];
let currentUser = null;
let selectedRole = '';
let selectedStatus = '';

// Fetch users from backend
async function fetchUsers() {
  try {
    const response = await fetch(`${API_BASE_URL}/users`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch users');
    }

    const data = await response.json();
    
    if (data.success) {
      usersData = data.users;
      renderStats(data.stats);
      renderUsers(usersData);
    } else {
      showError('Failed to load users');
    }
  } catch (error) {
    console.error('Error fetching users:', error);
    showError('Failed to connect to server');
  }
}

// Calculate and render statistics
function renderStats(stats) {
  const statsData = [
    { title: 'Total Users', number: stats.totalUsers.toString(), label: 'All accounts' },
    { title: 'Active Staff', number: stats.activeStaff.toString(), label: 'Staff accounts' },
    { title: 'Student Accounts', number: stats.studentAccounts.toString(), label: 'Enrolled students'},
    { title: 'Guest Accounts', number: stats.guestAccounts.toString(), label: 'Guest users' }
  ];

  const container = document.getElementById('statsContainer');
  container.innerHTML = statsData.map(stat => `
    <div class="stat-card">
      <div class="stat-header">
        <span class="stat-title">${stat.title}</span>
      </div>
      <div class="stat-number">${stat.number}</div>
      <div class="stat-label">${stat.label}</div>
    </div>
  `).join('');
}

// Render users table
function renderUsers(users) {
  const tbody = document.getElementById('usersTableBody');
  tbody.innerHTML = users.map(user => {
    const userJson = JSON.stringify(user).replace(/"/g, '&quot;');
    return `
      <tr>
        <td>${user.email}</td>
        <td>${user.name}</td>
        <td><span class="role-badge ${user.role}">${user.role.charAt(0).toUpperCase() + user.role.slice(1)}</span></td>
        <td><span class="status-badge ${user.status || 'active'}">${(user.status || 'active').charAt(0).toUpperCase() + (user.status || 'active').slice(1)}</span></td>
        <td>${user.lastLogin || user.lastUpdated || 'Never'}</td>
        <td>
          <button class="edit-btn" onclick='openModal(${userJson})'>
            <span class="edit-icon"></span>
            Edit
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// Open modal
function openModal(user) {
  currentUser = user;
  selectedRole = user.role;
  selectedStatus = user.status || 'active';

  document.getElementById('modalSubtitle').textContent = `Update details for ${user.name}`;
  document.getElementById('modalEmail').value = user.email;
  document.getElementById('modalName').value = user.name;
  document.getElementById('roleValue').textContent = user.role.charAt(0).toUpperCase() + user.role.slice(1);
  document.getElementById('statusValue').textContent = (user.status || 'active').charAt(0).toUpperCase() + (user.status || 'active').slice(1);
  document.getElementById('modalJoinDate').value = user.joinDate || user.createdAt || 'N/A';

  updateDropdownSelection('roleDropdown', user.role);
  updateDropdownSelection('statusDropdown', user.status || 'active');

  document.getElementById('modalOverlay').classList.add('active');
}

// Close modal
function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
  document.getElementById('roleDropdown').classList.remove('active');
  document.getElementById('statusDropdown').classList.remove('active');
}

// Update dropdown selection
function updateDropdownSelection(dropdownId, value) {
  const dropdown = document.getElementById(dropdownId);
  const items = dropdown.querySelectorAll('.dropdown-item');
  
  items.forEach(item => {
    const checkmark = item.querySelector('.checkmark');
    if (item.dataset.value === value) {
      item.classList.add('selected');
      checkmark.style.display = 'block';
    } else {
      item.classList.remove('selected');
      checkmark.style.display = 'none';
    }
  });
}

// Role dropdown handlers
document.getElementById('roleSelect').addEventListener('click', function(e) {
  e.stopPropagation();
  const dropdown = document.getElementById('roleDropdown');
  const statusDropdown = document.getElementById('statusDropdown');
  const isActive = dropdown.classList.contains('active');
  
  // Close status dropdown
  statusDropdown.classList.remove('active');
  document.getElementById('statusSelect').classList.remove('active');
  
  dropdown.classList.toggle('active');
  this.classList.toggle('active', !isActive);
});

document.getElementById('roleDropdown').addEventListener('click', function(e) {
  const item = e.target.closest('.dropdown-item');
  if (item) {
    selectedRole = item.dataset.value;
    const roleText = selectedRole.charAt(0).toUpperCase() + selectedRole.slice(1);
    document.getElementById('roleValue').textContent = roleText;
    updateDropdownSelection('roleDropdown', selectedRole);
    this.classList.remove('active');
    document.getElementById('roleSelect').classList.remove('active');
  }
});

// Status dropdown handlers
document.getElementById('statusSelect').addEventListener('click', function(e) {
  e.stopPropagation();
  const dropdown = document.getElementById('statusDropdown');
  const roleDropdown = document.getElementById('roleDropdown');
  const isActive = dropdown.classList.contains('active');
  
  // Close role dropdown
  roleDropdown.classList.remove('active');
  document.getElementById('roleSelect').classList.remove('active');
  
  dropdown.classList.toggle('active');
  this.classList.toggle('active', !isActive);
});

document.getElementById('statusDropdown').addEventListener('click', function(e) {
  const item = e.target.closest('.dropdown-item');
  if (item) {
    selectedStatus = item.dataset.value;
    const statusText = selectedStatus.charAt(0).toUpperCase() + selectedStatus.slice(1);
    document.getElementById('statusValue').textContent = statusText;
    updateDropdownSelection('statusDropdown', selectedStatus);
    this.classList.remove('active');
    document.getElementById('statusSelect').classList.remove('active');
  }
});

// Close dropdowns when clicking outside
document.addEventListener('click', function(e) {
  if (!e.target.closest('.custom-select-wrapper')) {
    document.getElementById('roleDropdown').classList.remove('active');
    document.getElementById('roleSelect').classList.remove('active');
    document.getElementById('statusDropdown').classList.remove('active');
    document.getElementById('statusSelect').classList.remove('active');
  }
});

// Form submit - Update user
document.getElementById('editForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  
  if (!currentUser) return;

  const updatedData = {
    role: selectedRole,
    status: selectedStatus
  };

  try {
    const response = await fetch(`${API_BASE_URL}/users/${currentUser.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updatedData)
    });

    const data = await response.json();

    if (data.success) {
      showSuccess('User updated successfully');
      closeModal();
      fetchUsers();
    } else {
      showError(data.message || 'Failed to update user');
    }
  } catch (error) {
    console.error('Error updating user:', error);
    showError('Failed to update user');
  }
});

// Search functionality
let searchTimeout;
document.getElementById('searchInput').addEventListener('input', (e) => {
  clearTimeout(searchTimeout);
  const searchTerm = e.target.value.trim();

  if (!searchTerm) {
    renderUsers(usersData);
    return;
  }

  searchTimeout = setTimeout(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/users/search?q=${encodeURIComponent(searchTerm)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      const data = await response.json();
      
      if (data.success) {
        renderUsers(data.users);
      }
    } catch (error) {
      console.error('Error searching users:', error);
      const filteredUsers = usersData.filter(user => 
        user.email.toLowerCase().includes(searchTerm.toLowerCase()) || 
        user.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
      renderUsers(filteredUsers);
    }
  }, 300);
});

// Show success message
function showSuccess(message) {
  const alertDiv = document.createElement('div');
  alertDiv.className = 'alert alert-success';
  alertDiv.textContent = message;
  alertDiv.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #10b981;
    color: white;
    padding: 16px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000;
    animation: slideIn 0.3s ease-out;
  `;
  
  document.body.appendChild(alertDiv);
  
  setTimeout(() => {
    alertDiv.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => alertDiv.remove(), 300);
  }, 3000);
}

// Show error message
function showError(message) {
  const alertDiv = document.createElement('div');
  alertDiv.className = 'alert alert-error';
  alertDiv.textContent = message;
  alertDiv.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #ef4444;
    color: white;
    padding: 16px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000;
    animation: slideIn 0.3s ease-out;
  `;
  
  document.body.appendChild(alertDiv);
  
  setTimeout(() => {
    alertDiv.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => alertDiv.remove(), 300);
  }, 3000);
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  
  @keyframes slideOut {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(100%);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);

// Initialize
fetchUsers();