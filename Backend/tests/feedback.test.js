const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');

function createStub() {
  const stub = (...args) => {
    stub.calls.push(args);
    if (stub.impl) {
      return stub.impl(...args);
    }
    return undefined;
  };
  stub.calls = [];
  stub.mockResolvedValue = (value) => {
    stub.impl = () => Promise.resolve(value);
  };
  stub.mockClear = () => {
    stub.calls = [];
    stub.impl = undefined;
  };
  return stub;
}

// Helper to construct a multipart/form-data payload. The boundary is
// fixed for determinism in tests. Returns the boundary and Buffer.
const buildMultipartPayload = (fields = {}, file) => {
  const boundary = 'jestBoundary7MA4YWxkTrZu0gW';
  const buffers = [];
  const push = (value) => buffers.push(Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8'));

  // encode fields
  Object.entries(fields).forEach(([field, value]) => {
    push(`--${boundary}\r\n`);
    push(`Content-Disposition: form-data; name="${field}"\r\n\r\n`);
    push(`${value}\r\n`);
  });

  // encode a file if provided
  if (file) {
    push(`--${boundary}\r\n`);
    push(`Content-Disposition: form-data; name="${file.fieldName}"; filename="${file.filename}"\r\n`);
    push(`Content-Type: ${file.mimeType}\r\n\r\n`);
    push(file.content);
    push('\r\n');
  }

  push(`--${boundary}--\r\n`);

  return { boundary, buffer: Buffer.concat(buffers) };
};

// Send an HTTP request to the test server using fetch. Parses JSON.
const sendRequest = async (server, { method = 'GET', path, headers = {}, body = null }) => {
  const url = new URL(path, `http://127.0.0.1:${server.address().port}`);
  const res = await fetch(url, { method, headers, body });
  const text = await res.text();
  const parsedBody = text ? JSON.parse(text) : null;
  return { status: res.status, body: parsedBody };
};

describe('feedback routes', () => {
  let server;
  let feedbackService;

  beforeEach(async () => {
    // Purge cached modules so our stubs are used on reload
    delete require.cache[require.resolve('../src/services/feedbackService')];
    delete require.cache[require.resolve('../src/routes/feedback')];

    // Stub the service functions
    feedbackService = require('../src/services/feedbackService');
    feedbackService.createFeedbackSubmission = createStub();
    feedbackService.updateFeedbackStatus = createStub();
    feedbackService.deleteFeedbackSubmission = createStub();

    // Reload the router after stubbing
    const feedbackRoutes = require('../src/routes/feedback');
    const app = express();
    app.use('/api/feedback', feedbackRoutes);
    // Error handler to surface errors as JSON
    app.use((error, _req, res, _next) => {
      res.status(error?.status || 500).json({ error: error?.message || 'Internal Server Error' });
    });
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
  });

  afterEach(async () => {
    // Close the server for the next test
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it('rejects facility damage submissions without a location', async () => {
    const { boundary, buffer } = buildMultipartPayload({
      category: 'Facilities Damages',
      feedback: 'Broken lights near the lab',
      email: 'student@example.com'
    });

    const res = await sendRequest(server, {
      method: 'POST',
      path: '/api/feedback',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: buffer
    });

    assert.equal(res.status, 400);
    assert.deepEqual(res.body, {
      error: 'Facilities reports must include the damaged location.'
    });
    assert.equal(feedbackService.createFeedbackSubmission.calls.length, 0);
  });

  it('accepts attachments and forwards them to the service layer', async () => {
    const fakeFileBuffer = Buffer.from('broken-window-image');
    const fakeSubmission = {
      id: 52,
      status: 'pending',
      category: 'facilities damages',
      message: 'Broken window'
    };
    feedbackService.createFeedbackSubmission.mockResolvedValue(fakeSubmission);
    const { boundary, buffer } = buildMultipartPayload(
      {
        category: 'Facilities Damages',
        feedback: 'Broken window in the atrium',
        email: 'reporter@example.com',
        facilityLocation: 'Atrium - Level 2'
      },
      {
        fieldName: 'attachment',
        filename: 'window.png',
        mimeType: 'image/png',
        content: fakeFileBuffer
      }
    );
    const res = await sendRequest(server, {
      method: 'POST',
      path: '/api/feedback',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: buffer
    });
    assert.equal(res.status, 201);
    assert.deepEqual(res.body, {
      message: 'Feedback submitted successfully.',
      submission: fakeSubmission
    });
    assert.equal(feedbackService.createFeedbackSubmission.calls.length, 1);
    const payload = feedbackService.createFeedbackSubmission.calls[0][0];
    assert.equal(payload.userId, null);
    assert.equal(payload.contactEmail, 'reporter@example.com');
    assert.equal(payload.category, 'Facilities Damages');
    assert.equal(payload.message, 'Broken window in the atrium');
    assert.equal(payload.facilityLocation, 'Atrium - Level 2');
    const att = payload.attachment;
    assert.ok(att);
    assert.equal(att.originalName, 'window.png');
    assert.equal(att.mimeType, 'image/png');
    assert.equal(att.size, fakeFileBuffer.length);
    assert.equal(Buffer.compare(att.buffer, fakeFileBuffer), 0);
  });

  it('updates moderation details and returns the updated submission', async () => {
    const updatedSubmission = {
      id: 77,
      status: 'resolved',
      moderatedBy: 1001,
      moderatedAt: new Date().toISOString()
    };
    feedbackService.updateFeedbackStatus.mockResolvedValue(updatedSubmission);
    const res = await sendRequest(server, {
      method: 'PATCH',
      path: '/api/feedback/77',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'RESOLVED', moderatedBy: 1001 })
    });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, {
      message: 'Feedback status updated successfully.',
      submission: updatedSubmission
    });
    assert.equal(feedbackService.updateFeedbackStatus.calls.length, 1);
    const [idArg, optsArg] = feedbackService.updateFeedbackStatus.calls[0];
    assert.equal(idArg, 77);
    assert.equal(optsArg.status, 'resolved');
    assert.equal(optsArg.moderatedBy, 1001);
  });

  it('removes a submission and returns the deleted record', async () => {
    const deletedSubmission = { id: 11, status: 'resolved' };
    feedbackService.deleteFeedbackSubmission.mockResolvedValue(deletedSubmission);
    const res = await sendRequest(server, {
      method: 'DELETE',
      path: '/api/feedback/11'
    });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, {
      message: 'Feedback submission deleted successfully.',
      submission: deletedSubmission
    });
    assert.equal(feedbackService.deleteFeedbackSubmission.calls.length, 1);
    const idArg = feedbackService.deleteFeedbackSubmission.calls[0][0];
    assert.equal(idArg, 11);
  });
});
