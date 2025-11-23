const express = require('express');

const {
  VALID_STATUSES,
  createFeedbackSubmission,
  listFeedbackSubmissions,
  updateFeedbackStatus,
  deleteFeedbackSubmission
} = require('../services/feedbackService');

const router = express.Router();

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_MODERATOR_RESPONSE_LENGTH = 2000;
const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);

const sanitiseText = (value) => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
};

const sanitiseMultilineText = (value) => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim();
};

const FACILITY_REPORT_CATEGORY = 'facilities damages';
const requiresFacilityLocation = (category) =>
  (category || '').trim().toLowerCase() === FACILITY_REPORT_CATEGORY;

class MultipartError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'MultipartError';
    this.code = code;
  }
}

const parseMultipartForm = (req) =>
  new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'] || '';
    if (!/^multipart\/form-data/i.test(contentType)) {
      reject(new MultipartError('UNSUPPORTED_TYPE', 'Content-Type must be multipart/form-data.'));
      return;
    }

    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    if (!boundaryMatch) {
      reject(new MultipartError('NO_BOUNDARY', 'Multipart boundary not found.'));
      return;
    }

    const boundary = `--${boundaryMatch[1] || boundaryMatch[2]}`;
    const chunks = [];
    let totalSize = 0;

    const cleanup = () => {
      req.removeListener('data', onData);
      req.removeListener('end', onEnd);
      req.removeListener('error', onError);
    };

    const onError = (error) => {
      cleanup();
      reject(error);
    };

    const onData = (chunk) => {
      totalSize += chunk.length;
      if (totalSize > MAX_FILE_SIZE_BYTES + 1024 * 1024) {
        cleanup();
        req.destroy();
        reject(new MultipartError('PAYLOAD_TOO_LARGE', 'Multipart payload exceeds allowed size.'));
        return;
      }
      chunks.push(chunk);
    };

    const onEnd = () => {
      cleanup();
      try {
        const buffer = Buffer.concat(chunks);
        const raw = buffer.toString('binary');
        const parts = raw
          .split(boundary)
          .map((part) => part.replace(/^[\r\n]+/, ''))
          .filter((part) => part && part !== '--' && part !== '--\r\n');

        const fields = {};
        let file = null;

        for (let part of parts) {
          if (part.endsWith('--')) {
            part = part.slice(0, -2);
          }

          const headerEndIndex = part.indexOf('\r\n\r\n');
          if (headerEndIndex === -1) {
            continue;
          }

          const headerSection = part.slice(0, headerEndIndex);
          let contentSection = part.slice(headerEndIndex + 4);

          if (contentSection.endsWith('\r\n')) {
            contentSection = contentSection.slice(0, -2);
          }

          const nameMatch = headerSection.match(/name="([^"]+)"/);
          if (!nameMatch) {
            continue;
          }

          const fieldName = nameMatch[1];
          const filenameMatch = headerSection.match(/filename="([^"]*)"/);

          if (filenameMatch && filenameMatch[1]) {
            const mimeMatch = headerSection.match(/Content-Type:\s*([^\r\n]+)/i);
            const mimeType = mimeMatch ? mimeMatch[1].trim() : 'application/octet-stream';
            const fileBuffer = Buffer.from(contentSection, 'binary');

            if (fileBuffer.length > MAX_FILE_SIZE_BYTES) {
              throw new MultipartError('FILE_TOO_LARGE', 'Attachment must be 10MB or smaller.');
            }

            if (fileBuffer.length > 0) {
              file = {
                fieldName,
                originalName: filenameMatch[1],
                mimeType,
                size: fileBuffer.length,
                buffer: fileBuffer
              };
            }
          } else {
            const value = Buffer.from(contentSection, 'binary').toString('utf8');
            fields[fieldName] = value;
          }
        }

        resolve({ fields, file });
      } catch (error) {
        reject(error);
      }
    };

    req.on('data', onData);
    req.once('end', onEnd);
    req.once('error', onError);
  });

const normaliseMimeType = (value) => String(value || '').toLowerCase();

const buildAttachmentPayload = (file) => {
  if (!file) {
    return null;
  }

  const mimeType = normaliseMimeType(file.mimeType);
  const isAllowedMimeType = ALLOWED_ATTACHMENT_MIME_TYPES.has(mimeType);

  if (!isAllowedMimeType) {
    throw new MultipartError(
      'UNSUPPORTED_FILE_TYPE',
      'Attachments must be PDF, DOC, DOCX, plain text, or common image formats.'
    );
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new MultipartError('FILE_TOO_LARGE', 'Attachment must be 10MB or smaller.');
  }

  if (!Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
    return null;
  }
  return {
    buffer: file.buffer,
    mimeType,
    originalName: file.originalName,
    size: file.size
  };
};

router.post('/', async (req, res, next) => {
  try {
    const { fields, file } = await parseMultipartForm(req);

    const category = sanitiseText(fields.category);
    const message = sanitiseText(fields.feedback);
    const contactEmail = sanitiseText(fields.email || '');
    const facilityLocation = sanitiseText(
      fields.facilityLocation || fields.facility_location || ''
    );

    if (!category || !message) {
      return res.status(400).json({ error: 'Category and feedback message are required.' });
    }

    if (requiresFacilityLocation(category) && !facilityLocation) {
      return res.status(400).json({
        error: 'Facilities reports must include the damaged location.'
      });
    }

    const attachmentPayload = buildAttachmentPayload(file);

    const submission = await createFeedbackSubmission({
      userId: req.user?.id ?? null,
      contactEmail: contactEmail || null,
      category,
      message,
      facilityLocation: facilityLocation || null,
      attachment: attachmentPayload
    });

    return res.status(201).json({
      message: 'Feedback submitted successfully.',
      submission
    });
  } catch (error) {
    if (error instanceof MultipartError) {
      switch (error.code) {
        case 'FILE_TOO_LARGE':
          return res.status(400).json({ error: error.message });
        case 'PAYLOAD_TOO_LARGE':
          return res.status(413).json({ error: 'Multipart payload exceeds allowed size.' });
        case 'UNSUPPORTED_TYPE':
        case 'NO_BOUNDARY':
        case 'UNSUPPORTED_FILE_TYPE':
          return res.status(400).json({ error: error.message });
        default:
          break;
      }
    }
    return next(error);
  }
});

router.get('/moderation', async (req, res, next) => {
  try {
    const { status } = req.query;
    const submissions = await listFeedbackSubmissions({ status });
    return res.json({ submissions });
  } catch (error) {
    return next(error);
  }
});

router.patch('/:id/skip', async (req, res, next) => {
  try {
    const submissionId = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(submissionId)) {
      return res.status(400).json({ error: 'Invalid submission id.' });
    }

    const skipped = await updateFeedbackStatus(submissionId, {
      status: 'skipped',
      moderatedBy: req.user?.id ?? null
    });

    if (!skipped) {
      return res.status(404).json({ error: 'Feedback submission not found.' });
    }

    return res.json({
      message: 'Feedback submission skipped successfully.',
      submission: skipped
    });
  } catch (error) {
    if (error.message === 'Invalid status value') {
      return res.status(400).json({ error: 'Invalid status value.' });
    }
    return next(error);
  }
});

router.patch('/:id', express.json(), async (req, res, next) => {
  try {
    const submissionId = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(submissionId)) {
      return res.status(400).json({ error: 'Invalid submission id.' });
    }

    const requestedStatus = sanitiseText(req.body.status).toLowerCase();
    if (!VALID_STATUSES.has(requestedStatus)) {
      const allowedStatuses = Array.from(VALID_STATUSES).join(', ');
      return res.status(400).json({ error: `Status must be one of: ${allowedStatuses}.` });
    }

    const hasModeratorResponse = Object.prototype.hasOwnProperty.call(
      req.body,
      'moderatorResponse'
    );
    let moderatorResponse = undefined;

    if (hasModeratorResponse) {
      const cleanedResponse = sanitiseMultilineText(req.body.moderatorResponse);
      if (cleanedResponse.length > MAX_MODERATOR_RESPONSE_LENGTH) {
        return res.status(400).json({
          error: `Moderator response must be ${MAX_MODERATOR_RESPONSE_LENGTH} characters or fewer.`
        });
      }
      moderatorResponse = cleanedResponse || null;
    }

    const moderatedBy = req.body.moderatedBy ?? req.user?.id ?? null;

    const payload = {
      status: requestedStatus,
      moderatedBy
    };

    if (hasModeratorResponse) {
      payload.moderatorResponse = moderatorResponse;
    }

    const updated = await updateFeedbackStatus(submissionId, payload);

    if (!updated) {
      return res.status(404).json({ error: 'Feedback submission not found.' });
    }

    return res.json({
      message: 'Feedback status updated successfully.',
      submission: updated
    });
  } catch (error) {
    if (error.message === 'Invalid status value') {
      return res.status(400).json({ error: 'Invalid status value.' });
    }
    return next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const submissionId = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(submissionId)) {
      return res.status(400).json({ error: 'Invalid submission id.' });
    }

    const deleted = await deleteFeedbackSubmission(submissionId);

    if (!deleted) {
      return res.status(404).json({ error: 'Feedback submission not found.' });
    }

    return res.json({
      message: 'Feedback submission deleted successfully.',
      submission: deleted
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
