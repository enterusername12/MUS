async function loadAuditLogs() {
  const container = document.getElementById('auditLogsList');
  container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

  try {
    // Fetch logs from backend
    const response = await fetch(`http://10.51.33.36:3000/logs`);
    console.log('Fetch response:', response);

    if (!response.ok) {
      console.error('Fetch failed with status:', response.status);
      container.innerHTML = '<p style="text-align:center;color:red;padding:40px;">Failed to load logs</p>';
      return;
    }

    const text = await response.text();
    console.log('Raw log text:', text);

    if (!text.trim()) {
      console.log('No logs found in file');
      container.innerHTML = '<p style="text-align:center;color:#666;padding:40px;">No audit logs found</p>';
      return;
    }

    // Split into lines
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    console.log('Parsed log lines:', lines);

    // Get filter/search values
    const searchTerm = (document.getElementById('auditSearch').value || '').toLowerCase();
    const actionFilter = (document.getElementById('auditActionFilter').value || '').toLowerCase();

    // Filter lines (simple string match)
    const filtered = lines.filter(line => {
      return line.toLowerCase().includes(searchTerm) &&
             line.toLowerCase().includes(actionFilter);
    });
    console.log('Filtered log lines:', filtered);

    if (!filtered.length) {
      container.innerHTML = '<p style="text-align:center;color:#666;padding:40px;">No audit logs found</p>';
      return;
    }

    // Render logs
    container.innerHTML = filtered.map(line => `
      <div class="audit-log-item">
        ${line}
      </div>
    `).join('');

  } catch (err) {
    console.error('Failed to load audit logs:', err);
    container.innerHTML = '<p style="text-align:center;color:red;padding:40px;">Failed to load logs</p>';
  }
}

// Run initial load
window.addEventListener('load', () => {
  loadAuditLogs();
});
