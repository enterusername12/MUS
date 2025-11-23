const express = require('express');
const path = require('path');
const {
  VALID_STATUSES,
  createFeedbackSubmission,
  listFeedbackSubmissions,
  updateFeedbackStatus,
  getFeedbackAttachment
} = require('../services/feedbackService');

const router = express.Router();

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/tiff',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain'
]);

const EXTENSION_MIME_MAP = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain'
};

const sanitiseText = (value) => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
};

class MultipartError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'MultipartError';
    this.code = code;
  }
}

const getValidatedMimeType = (originalName, declaredMimeType) => {
  const normalisedMime = declaredMimeType
    ? String(declaredMimeType)
        .split(';')[0]
        .trim()
        .toLowerCase()
    : '';
  const extension = path.extname(originalName || '').toLowerCase();

  if (normalisedMime && ALLOWED_MIME_TYPES.has(normalisedMime)) {
    return normalisedMime;
  }

  const mimeFromExtension = EXTENSION_MIME_MAP[extension];
  if (mimeFromExtension && ALLOWED_MIME_TYPES.has(mimeFromExtension)) {
    return mimeFromExtension;
  }

  throw new MultipartError('UNSUPPORTED_MEDIA_TYPE', 'Attachment type is not allowed.');
};

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
            const declaredMimeType = mimeMatch ? mimeMatch[1].trim() : '';
            const fileBuffer = Buffer.from(contentSection, 'binary');

            if (fileBuffer.length > MAX_FILE_SIZE_BYTES) {
              throw new MultipartError('FILE_TOO_LARGE', 'Attachment must be 10MB or smaller.');
            }

            const validatedMimeType = getValidatedMimeType(filenameMatch[1], declaredMimeType);

            if (fileBuffer.length > 0) {
              file = {
                fieldName,
                originalName: filenameMatch[1],
                mimeType: validatedMimeType,
                validatedMimeType,
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

const persistUploadedFile = async (file) => ({
  data: file.buffer,
  originalName: file.originalName,
  mimeType: file.validatedMimeType || file.mimeType,
  validatedMimeType: file.validatedMimeType || file.mimeType,
  size: file.size
});

router.post('/', async (req, res, next) => {
  try {
    const { fields, file } = await parseMultipartForm(req);

    const category = sanitiseText(fields.category);
    const message = sanitiseText(fields.feedback);
    const contactEmail = sanitiseText(fields.email || '');

    if (!category || !message) {
      return res.status(400).json({ error: 'Category and feedback message are required.' });
    }

    const storedFile = file ? await persistUploadedFile(file) : null;

    const submission = await createFeedbackSubmission({
      userId: req.user?.id ?? null,
      contactEmail: contactEmail || null,
      category,
      message,
      attachment: storedFile
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
        case 'UNSUPPORTED_MEDIA_TYPE':
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

router.patch('/:id', express.json(), async (req, res, next) => {
  try {
    const submissionId = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(submissionId)) {
      return res.status(400).json({ error: 'Invalid submission id.' });
    }

    const requestedStatus = sanitiseText(req.body.status).toLowerCase();
    if (!VALID_STATUSES.has(requestedStatus)) {
      return res
        .status(400)
        .json({ error: 'Status must be one of: pending, in_review, resolved.' });
    }

    const moderatedBy = req.body.moderatedBy ?? req.user?.id ?? null;

    const updated = await updateFeedbackStatus(submissionId, {
      status: requestedStatus,
      moderatedBy
    });

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

router.get('/:id/attachment', async (req, res, next) => {
  try {
    const submissionId = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(submissionId)) {
      return res.status(400).json({ error: 'Invalid submission id.' });
    }

    const attachment = await getFeedbackAttachment(submissionId);

    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found for this submission.' });
    }

    res.set({
      'Content-Type': attachment.mimeType || 'application/octet-stream',
      'Content-Length': attachment.size ?? attachment.data.length,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(attachment.originalName || 'attachment')}"`
    });

    return res.send(attachment.data);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;