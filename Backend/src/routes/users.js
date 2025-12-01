// routes/users.js
const express = require('express');
const { getPool } = require('../db');
const router = express.Router();
const { readUserIdFromRequest } = require("../utils/auth");
const pool = getPool();


// Get all users with statistics
router.get('/', async (req, res) => {
  const pool = getPool();
  try {
    const result = await pool.query(`
      SELECT 
        id,
        role,
        first_name,
        last_name,
        email,
        personal_email,
        student_id,
        phone,
        created_at,
        updated_at
      FROM users
      ORDER BY created_at DESC
    `);

    // Calculate statistics
    const users = result.rows;
    const stats = {
      totalUsers: users.length,
      activeStaff: users.filter(u => u.role === 'staff').length,
      studentAccounts: users.filter(u => u.role === 'Student').length,
      guestAccounts: users.filter(u => u.role === 'guest').length,
      adminAccounts: users.filter(u => u.role === 'admin').length
    };

    res.json({
      success: true,
      stats,
      users: users.map(u => ({
        id: u.id,
        email: u.email,
        name: `${u.first_name} ${u.last_name}`,
        firstName: u.first_name,
        lastName: u.last_name,
        role: u.role,
        studentId: u.student_id,
        phone: u.phone,
        personalEmail: u.personal_email,
        joinDate: new Date(u.created_at).toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'short', 
          day: 'numeric' 
        }),
        lastUpdated: new Date(u.updated_at).toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'short', 
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
      }))
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch users',
      error: error.message 
    });
  }
});

// Search users
router.get('/search', async (req, res) => {
  const pool = getPool();
  try {
    const { q } = req.query;
    
    if (!q) {
      return res.status(400).json({ 
        success: false, 
        message: 'Search query is required' 
      });
    }

    const result = await pool.query(`
      SELECT 
        id,
        role,
        first_name,
        last_name,
        email,
        personal_email,
        student_id,
        phone,
        created_at,
        updated_at
      FROM users
      WHERE 
        LOWER(email) LIKE LOWER($1) OR
        LOWER(first_name) LIKE LOWER($1) OR
        LOWER(last_name) LIKE LOWER($1) OR
        LOWER(student_id) LIKE LOWER($1)
      ORDER BY created_at DESC
    `, [`%${q}%`]);

    res.json({
      success: true,
      users: result.rows.map(u => ({
        id: u.id,
        email: u.email,
        name: `${u.first_name} ${u.last_name}`,
        firstName: u.first_name,
        lastName: u.last_name,
        role: u.role,
        studentId: u.student_id,
        phone: u.phone,
        personalEmail: u.personal_email,
        joinDate: new Date(u.created_at).toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'short', 
          day: 'numeric' 
        }),
        lastUpdated: new Date(u.updated_at).toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'short', 
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
      }))
    });
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to search users',
      error: error.message 
    });
  }
});

// Update user role
router.patch('/:id/role', async (req, res) => {
  const pool = getPool();
  try {
    const { id } = req.params;
    const { role } = req.body;

    // Validate role
    const validRoles = ['Student', 'staff', 'admin', 'guest'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid role. Must be one of: Student, staff, admin, guest' 
      });
    }

    const result = await pool.query(
      `UPDATE users 
       SET role = $1, updated_at = NOW() 
       WHERE id = $2 
       RETURNING id, role, first_name, last_name, email, updated_at`,
      [role, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    const user = result.rows[0];
    res.json({
      success: true,
      message: 'User role updated successfully',
      user: {
        id: user.id,
        name: `${user.first_name} ${user.last_name}`,
        email: user.email,
        role: user.role,
        updatedAt: user.updated_at
      }
    });
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update user role',
      error: error.message 
    });
  }
});

// Update user details
router.patch('/:id', async (req, res) => {
  const pool = getPool();
  try {
    const { id } = req.params;
    const { firstName, lastName, phone, personalEmail, role } = req.body;

    // Build dynamic query
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (firstName !== undefined) {
      updates.push(`first_name = $${paramCount++}`);
      values.push(firstName);
    }
    if (lastName !== undefined) {
      updates.push(`last_name = $${paramCount++}`);
      values.push(lastName);
    }
    if (phone !== undefined) {
      updates.push(`phone = $${paramCount++}`);
      values.push(phone);
    }
    if (personalEmail !== undefined) {
      updates.push(`personal_email = $${paramCount++}`);
      values.push(personalEmail);
    }
    if (role !== undefined) {
      const validRoles = ['Student', 'staff', 'admin', 'guest'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid role' 
        });
      }
      updates.push(`role = $${paramCount++}`);
      values.push(role);
    }

    if (updates.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'No fields to update' 
      });
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const query = `
      UPDATE users 
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, role, first_name, last_name, email, phone, personal_email, updated_at
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    const user = result.rows[0];
    res.json({
      success: true,
      message: 'User updated successfully',
      user: {
        id: user.id,
        name: `${user.first_name} ${user.last_name}`,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        phone: user.phone,
        personalEmail: user.personal_email,
        role: user.role,
        updatedAt: user.updated_at
      }
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update user',
      error: error.message 
    });
  }
});

// Delete user
router.delete('/:id', async (req, res) => {
  const pool = getPool();
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM users WHERE id = $1 RETURNING id, email',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    res.json({
      success: true,
      message: 'User deleted successfully',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete user',
      error: error.message 
    });
  }
});

// Get current user's profile (used by interests UI)
router.get("/me", async (req, res) => {
  try {
    const userId = readUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const { rows } = await pool.query(
      `
      SELECT
        id,
        role,
        first_name,
        last_name,
        email,
        personal_email,
        student_id,
        phone,
        interests_text,
        created_at,
        updated_at
      FROM users
      WHERE id = $1
      `,
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json(rows[0]);
  } catch (err) {
    console.error("Error in GET /api/users/me:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Update current user's interests_text (called by interests.js)
router.put("/me/interests", async (req, res) => {
  try {
    const userId = readUserIdFromRequest(req);
    if (!userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    let { interestsText } = req.body || {};
    if (typeof interestsText !== "string") {
      interestsText = "";
    }
    interestsText = interestsText.trim();

    const { rows } = await pool.query(
      `
      UPDATE users
      SET
        interests_text = $1,
        updated_at = NOW()
      WHERE id = $2
      RETURNING
        id,
        role,
        first_name,
        last_name,
        email,
        personal_email,
        student_id,
        phone,
        interests_text,
        created_at,
        updated_at
      `,
      [interestsText, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const updatedUser = rows[0];

    // OPTIONAL: send to AI service to update embedding
    try {
      const { updateUserInterestsEmbedding } = require("../services/aiHub");
      if (updateUserInterestsEmbedding && interestsText) {
        // fire-and-forget, don't block user
        updateUserInterestsEmbedding({
          userId,
          interestsText,
        }).catch((e) =>
          console.warn("Failed to send interests to AI hub:", e.message)
        );
      }
    } catch (e) {
      console.warn("AI hub not configured for interests embedding:", e.message);
    }

    return res.json(updatedUser);
  } catch (err) {
    console.error("Error in PUT /api/users/me/interests:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});



module.exports = router;