import express from 'express';
import bcrypt from 'bcryptjs';
import { getDatabase } from '../models/database';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';

const router = express.Router();

// Get user profile
router.get('/profile', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    res.json({
      success: true,
      data: { user: req.user }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile'
    });
  }
});

// Update user profile
router.put('/profile', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { first_name, last_name, phone } = req.body;

    if (!first_name || !last_name) {
      res.status(400).json({
        success: false,
        message: 'First name and last name are required'
      });
      return;
    }

    const db = getDatabase();
    await db.run(
      'UPDATE users SET first_name = ?, last_name = ?, phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [first_name, last_name, phone, req.user!.id]
    );

    // Fetch updated user data
    const updatedUser = await db.get(
      'SELECT id, email, first_name, last_name, phone, role, is_verified, created_at, updated_at FROM users WHERE id = ?',
      [req.user!.id]
    );

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: { user: updatedUser }
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
});

// Change password
router.put('/password', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
      return;
    }

    if (newPassword.length < 8) {
      res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters long'
      });
      return;
    }

    const db = getDatabase();
    const user = await db.get('SELECT password_hash FROM users WHERE id = ?', [req.user!.id]);

    const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValidPassword) {
      res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
      return;
    }

    const saltRounds = 12;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

    await db.run(
      'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newPasswordHash, req.user!.id]
    );

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change password'
    });
  }
});

// Get user notifications
router.get('/notifications', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const db = getDatabase();
    const notifications = await db.all(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
      [req.user!.id]
    );

    res.json({
      success: true,
      data: notifications
    });

  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications'
    });
  }
});

// Mark notification as read
router.put('/notifications/:id/read', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const db = getDatabase();

    await db.run(
      'UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?',
      [id, req.user!.id]
    );

    res.json({
      success: true,
      message: 'Notification marked as read'
    });

  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark notification as read'
    });
  }
});

// Get user messages
router.get('/messages', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const db = getDatabase();
    const messages = await db.all(
      `SELECT m.*, 
              sender.first_name || ' ' || sender.last_name as sender_name,
              sender.role as sender_role
       FROM messages m
       JOIN users sender ON m.sender_id = sender.id
       WHERE m.user_id = ? 
       ORDER BY m.created_at DESC`,
      [req.user!.id]
    );

    res.json({
      success: true,
      data: messages
    });

  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch messages'
    });
  }
});

// Send message
router.post('/messages', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { subject, message, message_type } = req.body;

    if (!message) {
      res.status(400).json({
        success: false,
        message: 'Message content is required'
      });
      return;
    }

    const db = getDatabase();
    
    // Get admin user (Patricia) to send message to
    const admin = await db.get('SELECT id FROM users WHERE role = \'admin\' LIMIT 1');
    
    if (!admin) {
      res.status(500).json({
        success: false,
        message: 'Unable to send message - admin user not found'
      });
      return;
    }

    await db.run(
      'INSERT INTO messages (user_id, sender_id, subject, message, message_type) VALUES (?, ?, ?, ?, ?)',
      [admin.id, req.user!.id, subject, message, message_type || 'general']
    );

    res.json({
      success: true,
      message: 'Message sent successfully'
    });

  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message'
    });
  }
});

export { router as userRoutes };