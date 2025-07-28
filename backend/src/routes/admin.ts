import express from 'express';
import { getDatabase } from '../models/database';
import { authenticateToken, AuthenticatedRequest, requireAdmin } from '../middleware/auth';

const router = express.Router();

// Get all bookings (admin view)
router.get('/bookings', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const db = getDatabase();
    const bookings = await db.all(
      `SELECT b.*, 
              u.first_name || ' ' || u.last_name as client_name,
              u.email as client_email,
              u.phone as client_phone
       FROM bookings b
       JOIN users u ON b.user_id = u.id
       ORDER BY b.lesson_date DESC`
    );

    res.json({
      success: true,
      data: bookings
    });

  } catch (error) {
    console.error('Admin get bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch bookings'
    });
  }
});

// Get bookings by date range
router.get('/bookings/range', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      res.status(400).json({
        success: false,
        message: 'Start date and end date are required'
      });
      return;
    }

    const db = getDatabase();
    const bookings = await db.all(
      `SELECT b.*, 
              u.first_name || ' ' || u.last_name as client_name,
              u.email as client_email,
              u.phone as client_phone
       FROM bookings b
       JOIN users u ON b.user_id = u.id
       WHERE DATE(b.lesson_date) BETWEEN DATE(?) AND DATE(?)
       ORDER BY b.lesson_date ASC`,
      [startDate, endDate]
    );

    res.json({
      success: true,
      data: bookings
    });

  } catch (error) {
    console.error('Admin get bookings by range error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch bookings'
    });
  }
});

// Update booking status
router.put('/bookings/:id/status', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'confirmed', 'completed', 'cancelled', 'rescheduled'];
    if (!validStatuses.includes(status)) {
      res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
      return;
    }

    const db = getDatabase();
    await db.run(
      'UPDATE bookings SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, id]
    );

    res.json({
      success: true,
      message: 'Booking status updated successfully'
    });

  } catch (error) {
    console.error('Admin update booking status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update booking status'
    });
  }
});

// Get all clients
router.get('/clients', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const db = getDatabase();
    const clients = await db.all(
      `SELECT id, email, first_name, last_name, phone, is_verified, created_at,
              (SELECT COUNT(*) FROM bookings WHERE user_id = users.id) as total_bookings,
              (SELECT COUNT(*) FROM bookings WHERE user_id = users.id AND status = 'completed') as completed_bookings
       FROM users 
       WHERE role = 'client'
       ORDER BY created_at DESC`
    );

    res.json({
      success: true,
      data: clients
    });

  } catch (error) {
    console.error('Admin get clients error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch clients'
    });
  }
});

// Get client details with booking history
router.get('/clients/:id', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const db = getDatabase();

    const client = await db.get(
      'SELECT id, email, first_name, last_name, phone, is_verified, created_at FROM users WHERE id = ? AND role = \'client\'',
      [id]
    );

    if (!client) {
      res.status(404).json({
        success: false,
        message: 'Client not found'
      });
      return;
    }

    const bookings = await db.all(
      'SELECT * FROM bookings WHERE user_id = ? ORDER BY lesson_date DESC',
      [id]
    );

    const payments = await db.all(
      `SELECT p.* FROM payments p
       JOIN bookings b ON p.booking_id = b.id
       WHERE b.user_id = ?
       ORDER BY p.created_at DESC`,
      [id]
    );

    res.json({
      success: true,
      data: {
        client,
        bookings,
        payments
      }
    });

  } catch (error) {
    console.error('Admin get client details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch client details'
    });
  }
});

// Set availability
router.post('/availability', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { date, start_time, end_time, is_available, reason } = req.body;

    if (!date || !start_time || !end_time) {
      res.status(400).json({
        success: false,
        message: 'Date, start time, and end time are required'
      });
      return;
    }

    const db = getDatabase();
    await db.run(
      'INSERT OR REPLACE INTO availability (date, start_time, end_time, is_available, reason) VALUES (?, ?, ?, ?, ?)',
      [date, start_time, end_time, is_available !== false, reason]
    );

    res.json({
      success: true,
      message: 'Availability updated successfully'
    });

  } catch (error) {
    console.error('Admin set availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to set availability'
    });
  }
});

// Get availability
router.get('/availability', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { startDate, endDate } = req.query;

    const db = getDatabase();
    let query = 'SELECT * FROM availability';
    let params: any[] = [];

    if (startDate && endDate) {
      query += ' WHERE date BETWEEN ? AND ?';
      params = [startDate, endDate];
    }

    query += ' ORDER BY date ASC, start_time ASC';

    const availability = await db.all(query, params);

    res.json({
      success: true,
      data: availability
    });

  } catch (error) {
    console.error('Admin get availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch availability'
    });
  }
});

// Get dashboard stats
router.get('/dashboard', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const db = getDatabase();

    // Get various statistics
    const totalClients = await db.get('SELECT COUNT(*) as count FROM users WHERE role = \'client\'');
    
    const totalBookings = await db.get('SELECT COUNT(*) as count FROM bookings');
    
    const pendingBookings = await db.get('SELECT COUNT(*) as count FROM bookings WHERE status = \'pending\'');
    
    const thisMonthRevenue = await db.get(
      `SELECT COALESCE(SUM(b.price), 0) as revenue 
       FROM bookings b
       JOIN payments p ON b.id = p.booking_id
       WHERE p.status = 'completed' 
       AND strftime('%Y-%m', b.lesson_date) = strftime('%Y-%m', 'now')`
    );

    const upcomingLessons = await db.all(
      `SELECT b.*, u.first_name || ' ' || u.last_name as client_name
       FROM bookings b
       JOIN users u ON b.user_id = u.id
       WHERE b.lesson_date > datetime('now')
       AND b.status NOT IN ('cancelled', 'completed')
       ORDER BY b.lesson_date ASC
       LIMIT 5`
    );

    res.json({
      success: true,
      data: {
        totalClients: totalClients.count,
        totalBookings: totalBookings.count,
        pendingBookings: pendingBookings.count,
        thisMonthRevenue: thisMonthRevenue.revenue || 0,
        upcomingLessons
      }
    });

  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard data'
    });
  }
});

// Send message to client
router.post('/messages', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { client_id, subject, message, message_type } = req.body;

    if (!client_id || !message) {
      res.status(400).json({
        success: false,
        message: 'Client ID and message are required'
      });
      return;
    }

    const db = getDatabase();
    
    // Verify client exists
    const client = await db.get('SELECT id FROM users WHERE id = ? AND role = \'client\'', [client_id]);
    if (!client) {
      res.status(404).json({
        success: false,
        message: 'Client not found'
      });
      return;
    }

    await db.run(
      'INSERT INTO messages (user_id, sender_id, subject, message, message_type) VALUES (?, ?, ?, ?, ?)',
      [client_id, req.user!.id, subject, message, message_type || 'general']
    );

    res.json({
      success: true,
      message: 'Message sent successfully'
    });

  } catch (error) {
    console.error('Admin send message error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message'
    });
  }
});

// Get settings
router.get('/settings', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const db = getDatabase();
    const settings = await db.all('SELECT * FROM settings ORDER BY key ASC');

    res.json({
      success: true,
      data: settings
    });

  } catch (error) {
    console.error('Admin get settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch settings'
    });
  }
});

// Update setting
router.put('/settings/:key', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    if (!value) {
      res.status(400).json({
        success: false,
        message: 'Value is required'
      });
      return;
    }

    const db = getDatabase();
    await db.run(
      'UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?',
      [value, key]
    );

    res.json({
      success: true,
      message: 'Setting updated successfully'
    });

  } catch (error) {
    console.error('Admin update setting error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update setting'
    });
  }
});

export { router as adminRoutes };