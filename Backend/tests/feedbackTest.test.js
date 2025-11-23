const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');

const dbModulePath = require.resolve('../src/db');

const startServer = (app) =>
  new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });

const buildTestApp = (mockQuery, { user = null } = {}) => {
  delete require.cache[dbModulePath];
  require.cache[dbModulePath] = {
    id: dbModulePath,
    filename: dbModulePath,
    loaded: true,
    exports: {
      getPool: () => ({ query: mockQuery }),
      ensureDatabase: async () => {}
    }
  };

  const servicePath = require.resolve('../src/services/feedbackService');
  delete require.cache[servicePath];

  const routerPath = require.resolve('../src/routes/feedback');
  delete require.cache[routerPath];

  const router = require('../src/routes/feedback');
  const app = express();

  if (user) {
    app.use((req, res, next) => {
      req.user = user;
      next();
    });
  }

  app.use('/', router);
  return app;
};

const closeServer = (server) =>
  new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });

test('creates a feedback submission with an attachment stored in the database', async () => {
  const capturedQueries = [];
  const attachmentBuffer = Buffer.from('test-binary-content');

  const mockQuery = (textOrConfig, values) => {
    const query = typeof textOrConfig === 'string' ? { text: textOrConfig, values } : textOrConfig;
    capturedQueries.push(query);

    if (query.text.includes('INSERT INTO feedback_submissions')) {
      const [, contactEmail, category, message, data, originalName, mimeType, size] = query.values;
      return Promise.resolve({
        rows: [
          {
            id: 1,
            userId: 7,
            contactEmail,
            category,
            message,
            hasAttachment: Boolean(data),
            attachmentOriginalName: originalName,
            attachmentMimeType: mimeType,
            attachmentSize: size,
            status: 'pending',
            moderatedBy: null,
            moderatedAt: null,
            createdAt: new Date('2024-01-01T00:00:00.000Z'),
            updatedAt: new Date('2024-01-01T00:00:00.000Z')
          }
        ]
      });
    }

    return Promise.resolve({ rows: [] });
  };

  const app = buildTestApp(mockQuery, { user: { id: 7 } });
  const { server, baseUrl } = await startServer(app);

  try {
    const formData = new FormData();
    formData.append('category', 'bug');
    formData.append('feedback', 'Something broke');
    formData.append('email', 'me@example.com');
    formData.append('attachment', new Blob([attachmentBuffer], { type: 'application/octet-stream' }), 'note.txt');

    const response = await fetch(`${baseUrl}/`, {
      method: 'POST',
      body: formData
    });

    assert.equal(response.status, 201);
    const body = await response.json();

    const insertQuery = capturedQueries.find((q) => q.text.includes('INSERT INTO feedback_submissions'));
    assert.ok(insertQuery, 'insert query should be invoked');
    assert.equal(insertQuery.values[1], 'me@example.com');
    assert.equal(insertQuery.values[2], 'bug');
    assert.equal(insertQuery.values[3], 'Something broke');
    assert.deepEqual(insertQuery.values[4], attachmentBuffer);
    assert.equal(insertQuery.values[5], 'note.txt');
    assert.equal(insertQuery.values[6], 'application/octet-stream');
    assert.equal(insertQuery.values[7], attachmentBuffer.length);

    assert.equal(body.message, 'Feedback submitted successfully.');
    assert.equal(body.submission.hasAttachment, true);
    assert.equal(body.submission.attachmentOriginalName, 'note.txt');
    assert.equal(body.submission.attachmentSize, attachmentBuffer.length);
  } finally {
    await closeServer(server);
  }
});

test('streams attachment downloads with correct headers and body', async () => {
  const storedBuffer = Buffer.from('downloadable attachment');

  const mockQuery = (textOrConfig, values) => {
    const query = typeof textOrConfig === 'string' ? { text: textOrConfig, values } : textOrConfig;

    if (query.text.includes('FROM feedback_submissions')) {
      return Promise.resolve({
        rows: [
          {
            data: storedBuffer,
            originalName: 'report.txt',
            mimeType: 'text/plain',
            size: storedBuffer.length
          }
        ]
      });
    }

    return Promise.resolve({ rows: [] });
  };

  const app = buildTestApp(mockQuery);
  const { server, baseUrl } = await startServer(app);

  try {
    const response = await fetch(`${baseUrl}/5/attachment`);
    assert.equal(response.status, 200);

    assert.match(response.headers.get('content-type'), /^text\/plain/);
    assert.equal(Number.parseInt(response.headers.get('content-length'), 10), storedBuffer.length);
    assert.match(response.headers.get('content-disposition'), /filename="report.txt"/);

    const body = Buffer.from(await response.arrayBuffer());
    assert.deepEqual(body, storedBuffer);
  } finally {
    await closeServer(server);
  }
});

test('updates feedback status through the moderation endpoint', async () => {
  const capturedQueries = [];
  const mockQuery = (textOrConfig, values) => {
    const query = typeof textOrConfig === 'string' ? { text: textOrConfig, values } : textOrConfig;
    capturedQueries.push(query);

    if (query.text.startsWith('UPDATE feedback_submissions')) {
      const [id, status, moderatedBy] = query.values;
      return Promise.resolve({
        rows: [
          {
            id,
            userId: 99,
            contactEmail: 'team@example.com',
            category: 'bug',
            message: 'Issue',
            hasAttachment: false,
            attachmentOriginalName: null,
            attachmentMimeType: null,
            attachmentSize: null,
            status,
            moderatedBy,
            moderatedAt: new Date('2024-01-02T00:00:00.000Z'),
            createdAt: new Date('2024-01-01T00:00:00.000Z'),
            updatedAt: new Date('2024-01-02T00:00:00.000Z')
          }
        ]
      });
    }

    return Promise.resolve({ rows: [] });
  };

  const app = buildTestApp(mockQuery, { user: { id: 42 } });
  const { server, baseUrl } = await startServer(app);

  try {
    const response = await fetch(`${baseUrl}/12`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'in_review' })
    });

    assert.equal(response.status, 200);
    const body = await response.json();

    assert.equal(body.submission.status, 'in_review');
    assert.equal(body.submission.moderatedBy, 42);

    const updateQuery = capturedQueries.find((q) => q.text.startsWith('UPDATE feedback_submissions'));
    assert.ok(updateQuery, 'update query should be invoked');
    assert.equal(updateQuery.values[0], 12);
    assert.equal(updateQuery.values[1], 'in_review');
  } finally {
    await closeServer(server);
  }
});

test('rejects invalid status updates', async () => {
  const app = buildTestApp(() => Promise.resolve({ rows: [] }));
  const { server, baseUrl } = await startServer(app);

  try {
    const response = await fetch(`${baseUrl}/3`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'invalid' })
    });

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error, 'Status must be one of: pending, in_review, resolved.');
  } finally {
    await closeServer(server);
  }
});