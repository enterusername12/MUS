const { getPool, ensureDatabase } = require('../db');

const VALID_STATUSES = new Set(['pending', 'in_review', 'resolved']);

const normaliseStatus = (status) => {
  if (!status) {
    return null;
  }
  const normalised = String(status).toLowerCase();
  return VALID_STATUSES.has(normalised) ? normalised : null;
};

const runWithFeedbackTable = async (runner) => {
  let retried = false;

  while (true) {
    try {
      const pool = getPool();
      return await runner(pool);
    } catch (error) {
      if (!retried && error?.code === '42P01') {
        retried = true;
        await ensureDatabase();
        continue;
      }

      throw error;
    }
  }
};

const createFeedbackSubmission = async ({
  userId = null,
  contactEmail = null,
  category,
  message,
  attachment = null
}) => {
  const attachmentData = attachment?.data ?? attachment?.buffer ?? null;
  const attachmentOriginalName = attachment?.originalName || null;
  const attachmentMimeType = attachment?.mimeType || null;
  const attachmentSize = attachment?.size ?? null;

  const result = await runWithFeedbackTable((pool) =>
    pool.query(
      `INSERT INTO feedback_submissions (
         user_id,
         contact_email,
         category,
         message,
         attachment_data,
         attachment_original_name,
         attachment_mime_type,
         attachment_size
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id,
                 user_id AS "userId",
                 contact_email AS "contactEmail",
                 category,
                 message,
                 (attachment_data IS NOT NULL) AS "hasAttachment",
                 attachment_original_name AS "attachmentOriginalName",
                 attachment_mime_type AS "attachmentMimeType",
                 attachment_size AS "attachmentSize",
                 status,
                 moderated_by AS "moderatedBy",
                 moderated_at AS "moderatedAt",
                 created_at AS "createdAt",
                 updated_at AS "updatedAt"`,
      [
        userId,
        contactEmail,
        category,
        message,
        attachmentData,
        attachmentOriginalName,
        attachmentMimeType,
        attachmentSize
      ]
    )
  );

  return result.rows[0];
};

const listFeedbackSubmissions = async ({ status } = {}) => {
  const normalisedStatus = normaliseStatus(status);
  const values = [];
  let text = `SELECT
                id,
                user_id AS "userId",
                contact_email AS "contactEmail",
                category,
                message,
                (attachment_data IS NOT NULL) AS "hasAttachment",
                attachment_original_name AS "attachmentOriginalName",
                attachment_mime_type AS "attachmentMimeType",
                attachment_size AS "attachmentSize",
                status,
                moderated_by AS "moderatedBy",
                moderated_at AS "moderatedAt",
                created_at AS "createdAt",
                updated_at AS "updatedAt"
              FROM feedback_submissions`;

  if (normalisedStatus) {
    text += ' WHERE status = $1';
    values.push(normalisedStatus);
  }

  text += ' ORDER BY created_at DESC';

  const result = await runWithFeedbackTable((pool) => pool.query({ text, values }));
  return result.rows;
};

const updateFeedbackStatus = async (id, { status, moderatedBy = null } = {}) => {
  const normalisedStatus = normaliseStatus(status);

  if (!normalisedStatus) {
    throw new Error('Invalid status value');
  }

  const moderatedAt = normalisedStatus === 'pending' ? null : new Date();

  const result = await runWithFeedbackTable((pool) =>
    pool.query({
      text: `UPDATE feedback_submissions
             SET status = $2,
                 moderated_by = $3,
                 moderated_at = $4,
                 updated_at = NOW()
             WHERE id = $1
             RETURNING id,
                       user_id AS "userId",
                       contact_email AS "contactEmail",
                       category,
                       message,
                       (attachment_data IS NOT NULL) AS "hasAttachment",
                       attachment_original_name AS "attachmentOriginalName",
                       attachment_mime_type AS "attachmentMimeType",
                       attachment_size AS "attachmentSize",
                       status,
                       moderated_by AS "moderatedBy",
                       moderated_at AS "moderatedAt",
                       created_at AS "createdAt",
                       updated_at AS "updatedAt"`,
      values: [id, normalisedStatus, moderatedBy, moderatedAt]
    })
  );

  return result.rows[0] || null;
};

const getFeedbackAttachment = async (id) => {
  const result = await runWithFeedbackTable((pool) =>
    pool.query({
      text: `SELECT
               attachment_data AS "data",
               attachment_original_name AS "originalName",
               attachment_mime_type AS "mimeType",
               attachment_size AS "size"
             FROM feedback_submissions
             WHERE id = $1`,
      values: [id]
    })
  );

  const row = result.rows[0];
  if (!row || !row.data) {
    return null;
  }

  return row;
};

module.exports = {
  VALID_STATUSES,
  createFeedbackSubmission,
  listFeedbackSubmissions,
  updateFeedbackStatus,
  getFeedbackAttachment
};