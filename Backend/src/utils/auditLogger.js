// utils/auditLogger.js
const db = require('../db');

/**
 * Logs any action to the audit_logs table
 * @param {Object} params
 * @param {number} params.userId - ID of the user performing the action
 * @param {string} params.actionType - 'create', 'update', 'delete', 'login', 'upload', etc.
 * @param {string} params.resourceType - e.g., 'users', 'merch', 'polls'
 * @param {Object} params.details - any additional info
 * @param {string} params.ipAddress - user IP address
 */
async function logAction({ userId, actionType, resourceType, details, ipAddress }) {
  try {
    await db.query(
      `INSERT INTO audit_logs (user_id, action_type, resource_type, details, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, actionType, resourceType, details ? JSON.stringify(details) : null, ipAddress]
    );
  } catch (err) {
    console.error('Failed to log audit action:', err);
  }
}

module.exports = logAction;
