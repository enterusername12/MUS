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

const serialiseAttachmentPayload = (submission = {}) => {
  if (!submission || typeof submission !== 'object') {
    return submission;
  }

  const hasBufferAttachment =
    submission.attachmentData && Buffer.isBuffer(submission.attachmentData);

  if (hasBufferAttachment) {
    const mimeType = submission.attachmentMimeType || 'application/octet-stream';
    const base64 = submission.attachmentData.toString('base64');
    submission.attachmentBase64 = `data:${mimeType};base64,${base64}`;
  }

  if ('attachmentData' in submission) {
    delete submission.attachmentData;
  }

  return submission;
};

const createFeedbackSubmission = async ({
  userId = null,
  contactEmail = null,
  category,
  message,
  facilityLocation = null,
  attachment = null
}) => {
  const attachmentPath = null;
  const attachmentData = attachment?.buffer || null;
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
         facility_location,
         attachment_path,
         attachment_data,
         attachment_original_name,
         attachment_mime_type,
         attachment_size
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id,
                 user_id AS "userId",
                 contact_email AS "contactEmail",
                 category,
                 message,
                 facility_location AS "facilityLocation",
                 attachment_path AS "attachmentPath",
                 attachment_data AS "attachmentData",
                 attachment_original_name AS "attachmentOriginalName",
                 attachment_mime_type AS "attachmentMimeType",
                 attachment_size AS "attachmentSize",
                 status,
                 moderated_by AS "moderatedBy",
                 moderated_at AS "moderatedAt",
                 moderator_response AS "moderatorResponse",
                 moderator_response_updated_at AS "moderatorResponseUpdatedAt",
                 created_at AS "createdAt",
                 updated_at AS "updatedAt"`,
      [
        userId,
        contactEmail,
        category,
        message,
        facilityLocation,
        attachmentPath,
        attachmentData,
        attachmentOriginalName,
        attachmentMimeType,
        attachmentSize
      ]
    )
  );

  return serialiseAttachmentPayload(result.rows[0]);
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
                facility_location AS "facilityLocation",
                attachment_path AS "attachmentPath",
                attachment_data AS "attachmentData",
                attachment_original_name AS "attachmentOriginalName",
                attachment_mime_type AS "attachmentMimeType",
                attachment_size AS "attachmentSize",
                status,
                moderated_by AS "moderatedBy",
                moderated_at AS "moderatedAt",
                moderator_response AS "moderatorResponse",
                moderator_response_updated_at AS "moderatorResponseUpdatedAt",
                created_at AS "createdAt",
                updated_at AS "updatedAt"
              FROM feedback_submissions`;

  if (normalisedStatus) {
    text += ' WHERE status = $1';
    values.push(normalisedStatus);
  }

  text += ' ORDER BY created_at DESC';

  const result = await runWithFeedbackTable((pool) => pool.query({ text, values }));
  return result.rows.map(serialiseAttachmentPayload);
};

const updateFeedbackStatus = async (
  id,
  { status, moderatedBy = null, moderatorResponse } = {}
) => {
  const normalisedStatus = normaliseStatus(status);

  if (!normalisedStatus) {
    throw new Error('Invalid status value');
  }

  const moderatedAt = normalisedStatus === 'pending' ? null : new Date();

  const values = [id, normalisedStatus, moderatedBy, moderatedAt];
  const setClauses = [
    'status = $2',
    'moderated_by = $3',
    'moderated_at = $4',
    'updated_at = NOW()'
  ];

  if (moderatorResponse !== undefined) {
    const responseIndex = values.length + 1;
    setClauses.push(`moderator_response = $${responseIndex}`);
    values.push(moderatorResponse);

    const timestampIndex = values.length + 1;
    const responseTimestamp = moderatorResponse ? new Date() : null;
    setClauses.push(`moderator_response_updated_at = $${timestampIndex}`);
    values.push(responseTimestamp);
  }

  const result = await runWithFeedbackTable((pool) =>
    pool.query({
      text: `UPDATE feedback_submissions
             SET ${setClauses.join(', ')}
             WHERE id = $1
             RETURNING id,
                       user_id AS "userId",
                       contact_email AS "contactEmail",
                       category,
                       message,
                       facility_location AS "facilityLocation",
                       attachment_path AS "attachmentPath",
                       attachment_data AS "attachmentData",
                       attachment_original_name AS "attachmentOriginalName",
                       attachment_mime_type AS "attachmentMimeType",
                       attachment_size AS "attachmentSize",
                       status,
                       moderated_by AS "moderatedBy",
                       moderated_at AS "moderatedAt",
                       moderator_response AS "moderatorResponse",
                       moderator_response_updated_at AS "moderatorResponseUpdatedAt",
                       created_at AS "createdAt",
                       updated_at AS "updatedAt"`,
      values
    })
  );

  const updatedRow = result.rows[0] || null;
  return serialiseAttachmentPayload(updatedRow);
};

const deleteFeedbackSubmission = async (id) => {
  const result = await runWithFeedbackTable((pool) =>
    pool.query({
      text: `DELETE FROM feedback_submissions
             WHERE id = $1
             RETURNING id,
                       user_id AS "userId",
                       contact_email AS "contactEmail",
                       category,
                       message,
                       facility_location AS "facilityLocation",
                       attachment_path AS "attachmentPath",
                       attachment_data AS "attachmentData",
                       attachment_original_name AS "attachmentOriginalName",
                       attachment_mime_type AS "attachmentMimeType",
                       attachment_size AS "attachmentSize",
                       status,
                       moderated_by AS "moderatedBy",
                       moderated_at AS "moderatedAt",
                       created_at AS "createdAt",
                       updated_at AS "updatedAt"`,
      values: [id]
    })
  );

  const deletedRow = result.rows[0] || null;
  return serialiseAttachmentPayload(deletedRow);
};

module.exports = {
  VALID_STATUSES,
  createFeedbackSubmission,
  listFeedbackSubmissions,
  updateFeedbackStatus,
  deleteFeedbackSubmission
};
