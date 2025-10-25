  // Dummy data for testing
  const dummyLogs = [
    {
      user: { first_name: "John", last_name: "Smith" },
      action_type: "login",
      resource_type: "system",
      details: { status: "success" },
      created_at: "2025-10-25T09:12:00Z",
      ip_address: "192.168.1.2"
    },
    {
      user: { first_name: "Sarah", last_name: "Wilson" },
      action_type: "update",
      resource_type: "user_profile",
      details: { changed_field: "email" },
      created_at: "2025-10-25T10:45:00Z",
      ip_address: "192.168.1.5"
    },
    {
      user: { first_name: "Alex", last_name: "Tan" },
      action_type: "delete",
      resource_type: "student_record",
      details: { record_id: 3021 },
      created_at: "2025-10-25T12:00:00Z",
      ip_address: "192.168.1.8"
    },
    {
      user: { first_name: "Liam", last_name: "Lee" },
      action_type: "upload",
      resource_type: "document",
      details: { filename: "report.pdf" },
      created_at: "2025-10-25T13:30:00Z",
      ip_address: "192.168.1.12"
    },
  ];

  function formatDate(isoDate) {
    const date = new Date(isoDate);
    return date.toUTCString().replace("GMT", "");
  }

  // Return true if the log matches ALL search terms
  function matchesSearch(log, search) {
    if (!search) return true;
    const hay = JSON.stringify(log).toLowerCase();
    const terms = search.split(/\s+/).filter(Boolean);
    return terms.every(t => hay.includes(t));
  }

  async function loadAuditLogs() {
    const container = document.getElementById('auditLogsList');
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

    // Get and normalise filters
    const action = (document.getElementById('auditActionFilter').value || '').toLowerCase();
    const rawSearch = document.getElementById('auditSearch').value || '';
    const search = rawSearch.trim().toLowerCase();

    // simulate network delay
    await new Promise(resolve => setTimeout(resolve, 200));

    const filtered = dummyLogs.filter(log =>
      (!action || log.action_type === action) &&
      matchesSearch(log, search)
    );

    if (filtered.length === 0) {
      container.innerHTML = '<p style="text-align:center;color:#666;padding:40px;">No audit logs found</p>';
      return;
    }

    container.innerHTML = filtered.map(log => `
      <div class="audit-log-item">
        <div class="audit-info">
          <div class="audit-user">${log.user?.first_name || 'Unknown'} ${log.user?.last_name || ''}</div>
          <div class="audit-action">
            <strong>${log.action_type}</strong> on ${log.resource_type}
            ${log.details ? ` - ${JSON.stringify(log.details).substring(0, 80)}` : ''}
          </div>
        </div>
        <div class="audit-time">
          ${formatDate(log.created_at)}<br>
          <small>${log.ip_address || 'N/A'}</small>
        </div>
      </div>
    `).join('');
  }

  // Run initial load
  window.addEventListener('load', () => {
    loadAuditLogs();

    // Search on Enter
    const searchInput = document.getElementById('auditSearch');
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        loadAuditLogs();
      }
    });

    // Re-run when action filter changes
    const actionSelect = document.getElementById('auditActionFilter');
    actionSelect.addEventListener('change', loadAuditLogs);
  });