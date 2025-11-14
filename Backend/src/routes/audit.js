const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// Make sure the path is correct relative to this file
const logFile = path.join(__dirname, '../logs/audit.log');
console.log('Reading audit log from:', logFile);

router.get('/', (req, res) => {
  fs.readFile(logFile, 'utf-8', (err, data) => {
    if (err) {
      console.error('Failed to read audit log:', err);
      return res.status(500).send('Failed to read audit log');
    }

    // ✅ Log the data to console
    console.log('Audit log content:', data);


    // Send raw text back
    res.type('text/plain').send(data);
    console.log('✅ Audit log sent successfully');

  });
});

module.exports = router;
