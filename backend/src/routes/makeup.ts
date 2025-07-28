import express from 'express';
import { getDatabase } from '../models/database';
import { authenticateToken, requireRole, AuthenticatedRequest } from '../middleware/auth';
import { checkMakeupPolicy } from '../middleware/policies';
import { MakeupLesson, SaturdaySession } from '../types';

const router = express.Router();

// Request a make-up lesson
router.post('/', authenticateToken, checkMakeupPolicy, async (req: AuthenticatedRequest, res) => {
  try {
    const db = getDatabase();
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    const { original_booking_id, reason } = req.body;

    // Check if the original booking exists and belongs to the user
    const originalBooking = await db.get(`
      SELECT * FROM bookings 
      WHERE id = ? AND user_id = ? AND status IN ('confirmed', 'cancelled')
    `, [original_booking_id, req.user.id]);

    if (!originalBooking) {
      return res.status(404).json({
        success: false,
        error: 'Original booking not found or not eligible for make-up'
      });
    }

    // Check current pending make-ups count
    const maxPendingMakeups = await db.get(
      'SELECT value FROM settings WHERE key = ?',
      ['max_pending_makeups']
    );

    const pendingCount = await db.get(`
      SELECT COUNT(*) as count FROM makeup_lessons 
      WHERE user_id = ? AND status = 'pending'
    `, [req.user.id]);

    if (pendingCount.count >= parseInt(maxPendingMakeups?.value || '2')) {
      return res.status(400).json({
        success: false,
        error: `Maximum ${maxPendingMakeups?.value || '2'} pending make-up lessons allowed`
      });
    }

    // Create make-up lesson request
    const result = await db.run(`
      INSERT INTO makeup_lessons (user_id, original_booking_id, reason)
      VALUES (?, ?, ?)
    `, [req.user.id, original_booking_id, reason]);

    res.json({
      success: true,
      data: { id: result.lastID },
      message: 'Make-up lesson request created successfully'
    });

  } catch (error) {
    console.error('Error creating make-up lesson:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create make-up lesson request'
    });
  }
});

// Get user's make-up lessons
router.get('/', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const db = getDatabase();
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    const makeupLessons = await db.all(`
      SELECT ml.*, b.lesson_date as original_date, b.duration
      FROM makeup_lessons ml
      JOIN bookings b ON ml.original_booking_id = b.id
      WHERE ml.user_id = ?
      ORDER BY ml.created_at DESC
    `, [req.user.id]);

    res.json({
      success: true,
      data: makeupLessons
    });

  } catch (error) {
    console.error('Error fetching make-up lessons:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch make-up lessons'
    });
  }
});

// Get all make-up lessons (admin only)
router.get('/all', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const db = getDatabase();
    const makeupLessons = await db.all(`
      SELECT ml.*, u.first_name, u.last_name, u.email,
             b.lesson_date as original_date, b.duration
      FROM makeup_lessons ml
      JOIN users u ON ml.user_id = u.id
      JOIN bookings b ON ml.original_booking_id = b.id
      ORDER BY ml.created_at DESC
    `);

    res.json({
      success: true,
      data: makeupLessons
    });

  } catch (error) {
    console.error('Error fetching all make-up lessons:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch make-up lessons'
    });
  }
});

// Schedule make-up lesson (admin only)
router.put('/:id/schedule', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const db = getDatabase();
    const { id } = req.params;
    const { makeup_date } = req.body;

    await db.run(`
      UPDATE makeup_lessons 
      SET makeup_date = ?, status = 'scheduled', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [makeup_date, id]);

    res.json({
      success: true,
      message: 'Make-up lesson scheduled successfully'
    });

  } catch (error) {
    console.error('Error scheduling make-up lesson:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to schedule make-up lesson'
    });
  }
});

// Complete make-up lesson (admin only)
router.put('/:id/complete', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const db = getDatabase();
    const { id } = req.params;

    await db.run(`
      UPDATE makeup_lessons 
      SET status = 'completed', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [id]);

    res.json({
      success: true,
      message: 'Make-up lesson marked as completed'
    });

  } catch (error) {
    console.error('Error completing make-up lesson:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to complete make-up lesson'
    });
  }
});

// Get Saturday sessions
router.get('/saturday-sessions', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase();
    const sessions = await db.all(`
      SELECT * FROM saturday_sessions 
      WHERE session_date >= date('now') AND status = 'available'
      ORDER BY session_date, start_time
    `);

    res.json({
      success: true,
      data: sessions
    });

  } catch (error) {
    console.error('Error fetching Saturday sessions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch Saturday sessions'
    });
  }
});

// Create Saturday session (admin only)
router.post('/saturday-sessions', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const db = getDatabase();
    const { session_date, start_time, end_time, max_students = 4 } = req.body;

    const result = await db.run(`
      INSERT INTO saturday_sessions (session_date, start_time, end_time, max_students)
      VALUES (?, ?, ?, ?)
    `, [session_date, start_time, end_time, max_students]);

    res.json({
      success: true,
      data: { id: result.lastID },
      message: 'Saturday session created successfully'
    });

  } catch (error) {
    console.error('Error creating Saturday session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create Saturday session'
    });
  }
});

// Join Saturday session
router.post('/saturday-sessions/:id/join', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    const db = getDatabase();
    const { id } = req.params;
    const { makeup_lesson_id } = req.body;

    // Check if session is available
    const session = await db.get(`
      SELECT * FROM saturday_sessions 
      WHERE id = ? AND status = 'available' AND current_students < max_students
    `, [id]);

    if (!session) {
      return res.status(400).json({
        success: false,
        error: 'Session not available or full'
      });
    }

    // Verify make-up lesson belongs to user
    const makeupLesson = await db.get(`
      SELECT * FROM makeup_lessons 
      WHERE id = ? AND user_id = ? AND status = 'pending'
    `, [makeup_lesson_id, req.user.id]);

    if (!makeupLesson) {
      return res.status(404).json({
        success: false,
        error: 'Make-up lesson not found or not available'
      });
    }

    // Update make-up lesson with Saturday session
    await db.run(`
      UPDATE makeup_lessons 
      SET makeup_date = ?, status = 'scheduled', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [session.session_date + ' ' + session.start_time, makeup_lesson_id]);

    // Update session participant count
    await db.run(`
      UPDATE saturday_sessions 
      SET current_students = current_students + 1
      WHERE id = ?
    `, [id]);

    // Check if session is now full
    const updatedSession = await db.get('SELECT * FROM saturday_sessions WHERE id = ?', [id]);
    if (updatedSession.current_students >= updatedSession.max_students) {
      await db.run(`
        UPDATE saturday_sessions 
        SET status = 'full'
        WHERE id = ?
      `, [id]);
    }

    res.json({
      success: true,
      message: 'Successfully joined Saturday session'
    });

  } catch (error) {
    console.error('Error joining Saturday session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to join Saturday session'
    });
  }
});

export default router;