// Dummy data
    let usersData = [
      {
        email: 'john.smith@murdoch.edu.au',
        name: 'John Smith',
        role: 'staff',
        status: 'active',
        lastLogin: 'Oct 12, 2024 09:30 AM',
        joinDate: 'Oct 2, 2023'
      },
      {
        email: 'sarah.wilson@murdoch.edu.au',
        name: 'Sarah Wilson',
        role: 'admin',
        status: 'active',
        lastLogin: 'Oct 12, 2024 10:15 AM',
        joinDate: 'Jan 15, 2023'
      },
      {
        email: 'alex.chen@student.murdoch.edu.au',
        name: 'Alex Chen',
        role: 'student',
        status: 'active',
        lastLogin: 'Oct 11, 2024 04:20 PM',
        joinDate: 'Mar 5, 2024'
      },
      {
        email: 'emily.davis@student.murdoch.edu.au',
        name: 'Emily Davis',
        role: 'student',
        status: 'active',
        lastLogin: 'Oct 12, 2024 08:45 AM',
        joinDate: 'Feb 20, 2024'
      },
      {
        email: 'michael.brown@student.murdoch.edu.au',
        name: 'Michael Brown',
        role: 'student',
        status: 'active',
        lastLogin: 'Oct 10, 2024 03:15 PM',
        joinDate: 'Apr 10, 2024'
      },
      {
        email: 'lisa.anderson@murdoch.edu.au',
        name: 'Lisa Anderson',
        role: 'staff',
        status: 'active',
        lastLogin: 'Oct 12, 2024 07:20 AM',
        joinDate: 'Sep 1, 2022'
      },
      {
        email: 'guest.user@murdoch.edu.au',
        name: 'Guest User',
        role: 'guest',
        status: 'active',
        lastLogin: 'Oct 11, 2024 02:30 PM',
        joinDate: 'Oct 1, 2024'
      },
      {
        email: 'david.lee@student.murdoch.edu.au',
        name: 'David Lee',
        role: 'student',
        status: 'inactive',
        lastLogin: 'Oct 05, 2024 01:45 PM',
        joinDate: 'Jan 10, 2024'
      },
      {
        email: 'rachel.green@murdoch.edu.au',
        name: 'Rachel Green',
        role: 'staff',
        status: 'active',
        lastLogin: 'Oct 12, 2024 09:00 AM',
        joinDate: 'Aug 15, 2023'
      },
      {
        email: 'tom.wilson@student.murdoch.edu.au',
        name: 'Tom Wilson',
        role: 'student',
        status: 'active',
        lastLogin: 'Oct 11, 2024 11:30 AM',
        joinDate: 'May 3, 2024'
      }
    ];

    let currentUser = null;
    let selectedRole = '';
    let selectedStatus = '';

    // Calculate statistics from user data
    function calculateStats() {
      const totalUsers = usersData.length;
      const activeStaff = usersData.filter(u => u.role === 'staff' && u.status === 'active').length;
      const studentAccounts = usersData.filter(u => u.role === 'student').length;
      const guestAccounts = usersData.filter(u => u.role === 'guest').length;

      return [
        { title: 'Total Users', number: totalUsers.toString(), label: 'All accounts' },
        { title: 'Active Staff', number: activeStaff.toString(), label: 'Staff accounts' },
        { title: 'Student Accounts', number: studentAccounts.toString(), label: 'Enrolled students'},
        { title: 'Guest Accounts', number: guestAccounts.toString(), label: 'Guest users' }
      ];
    }

    // Render stats cards
    function renderStats() {
      const statsData = calculateStats();
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
      tbody.innerHTML = users.map(user => `
        <tr>
          <td>${user.email}</td>
          <td>${user.name}</td>
          <td><span class="role-badge ${user.role}">${user.role.charAt(0).toUpperCase() + user.role.slice(1)}</span></td>
          <td><span class="status-badge ${user.status}">${user.status.charAt(0).toUpperCase() + user.status.slice(1)}</span></td>
          <td>${user.lastLogin}</td>
          <td>
            <button class="edit-btn" onclick='openModal(${JSON.stringify(user)})'>
              <span class="edit-icon"></span>
              Edit Roles
            </button>
          </td>
        </tr>
      `).join('');
    }

    // Open modal
    function openModal(user) {
      currentUser = user;
      selectedRole = user.role;
      selectedStatus = user.status;

      document.getElementById('modalSubtitle').textContent = `Update the role and status for ${user.name}`;
      document.getElementById('modalEmail').value = user.email;
      document.getElementById('modalName').value = user.name;
      document.getElementById('roleValue').textContent = user.role.charAt(0).toUpperCase() + user.role.slice(1);
      document.getElementById('statusValue').textContent = user.status.charAt(0).toUpperCase() + user.status.slice(1);
      document.getElementById('modalJoinDate').value = user.joinDate;

      updateDropdownSelection('roleDropdown', user.role);
      updateDropdownSelection('statusDropdown', user.status);

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

    // Role dropdown
    document.getElementById('roleSelect').addEventListener('click', function(e) {
      e.stopPropagation();
      const dropdown = document.getElementById('roleDropdown');
      const isActive = dropdown.classList.contains('active');
      
      // Close all dropdowns
      document.getElementById('statusDropdown').classList.remove('active');
      document.getElementById('statusSelect').classList.remove('active');
      
      // Toggle current dropdown
      dropdown.classList.toggle('active');
      this.classList.toggle('active', !isActive);
    });

    document.getElementById('roleDropdown').addEventListener('click', function(e) {
      const item = e.target.closest('.dropdown-item');
      if (item) {
        selectedRole = item.dataset.value;
        document.getElementById('roleValue').textContent = item.querySelector('span').textContent;
        updateDropdownSelection('roleDropdown', selectedRole);
        this.classList.remove('active');
        document.getElementById('roleSelect').classList.remove('active');
      }
    });

    // Status dropdown
    document.getElementById('statusSelect').addEventListener('click', function(e) {
      e.stopPropagation();
      const dropdown = document.getElementById('statusDropdown');
      const isActive = dropdown.classList.contains('active');
      
      // Close all dropdowns
      document.getElementById('roleDropdown').classList.remove('active');
      document.getElementById('roleSelect').classList.remove('active');
      
      // Toggle current dropdown
      dropdown.classList.toggle('active');
      this.classList.toggle('active', !isActive);
    });

    document.getElementById('statusDropdown').addEventListener('click', function(e) {
      const item = e.target.closest('.dropdown-item');
      if (item) {
        selectedStatus = item.dataset.value;
        document.getElementById('statusValue').textContent = item.querySelector('span').textContent;
        updateDropdownSelection('statusDropdown', selectedStatus);
        this.classList.remove('active');
        document.getElementById('statusSelect').classList.remove('active');
      }
    });

    // Close dropdowns when clicking outside
    document.addEventListener('click', function(e) {
      if (!e.target.closest('.custom-select-wrapper')) {
        document.getElementById('roleDropdown').classList.remove('active');
        document.getElementById('statusDropdown').classList.remove('active');
        document.getElementById('roleSelect').classList.remove('active');
        document.getElementById('statusSelect').classList.remove('active');
      }
    });

    // Form submit
    document.getElementById('editForm').addEventListener('submit', function(e) {
      e.preventDefault();
      
      // Show backend integration alert
      showAlert();
    });

    // Show alert
    function showAlert() {
      document.getElementById('alertOverlay').classList.add('active');
    }

    // Close alert
    function closeAlert() {
      document.getElementById('alertOverlay').classList.remove('active');
      closeModal();
    }

    // Search functionality
    document.getElementById('searchInput').addEventListener('input', (e) => {
      const searchTerm = e.target.value.toLowerCase();
      const filteredUsers = usersData.filter(user => 
        user.email.toLowerCase().includes(searchTerm) || 
        user.name.toLowerCase().includes(searchTerm)
      );
      renderUsers(filteredUsers);
    });

    // Initialize
    renderStats();
    renderUsers(usersData);