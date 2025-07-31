import express from 'express';
import { authenticateToken, requireRole, AuthenticatedRequest } from '../middleware/auth';
import { googleCalendarService } from '../services/googleCalendar';
import { getDatabase } from '../models/database';

const router = express.Router();

// Get Google Calendar authentication URL
router.get('/auth/url', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const authUrl = googleCalendarService.getAuthUrl();
    
    res.json({
      success: true,
      data: { authUrl },
      message: 'Google Calendar authentication URL generated'
    });

  } catch (error) {
    console.error('Error generating auth URL:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate authentication URL'
    });
  }
});

// Handle Google Calendar OAuth callback
router.get('/auth/callback', async (req, res) => {
  try {
    const { code, error } = req.query;

    if (error) {
      return res.redirect('/admin/settings?calendar_error=' + encodeURIComponent(error as string));
    }

    if (!code) {
      return res.redirect('/admin/settings?calendar_error=no_code');
    }

    const success = await googleCalendarService.handleAuthCallback(code as string);
    
    if (success) {
      res.redirect('/admin/settings?calendar_success=1');
    } else {
      res.redirect('/admin/settings?calendar_error=auth_failed');
    }

  } catch (error) {
    console.error('Error handling calendar auth callback:', error);
    res.redirect('/admin/settings?calendar_error=callback_error');
  }
});

// Get calendar sync status
router.get('/status', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const status = await googleCalendarService.getSyncStatus();
    
    res.json({
      success: true,
      data: status
    });

  } catch (error) {
    console.error('Error getting calendar status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get calendar status'
    });
  }
});

// Enable/disable calendar sync
router.post('/sync/toggle', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { enabled } = req.body;
    const db = getDatabase();

    await db.run(
      'UPDATE users SET calendar_sync_enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE role = ?',
      [enabled ? 1 : 0, 'admin']
    );

    res.json({
      success: true,
      message: `Calendar sync ${enabled ? 'enabled' : 'disabled'} successfully`
    });

  } catch (error) {
    console.error('Error toggling calendar sync:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle calendar sync'
    });
  }
});

// Get available time slots for a specific date
router.get('/availability/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const duration = parseInt(req.query.duration as string) || 60;

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format. Use YYYY-MM-DD'
      });
    }

    const availableSlots = await googleCalendarService.getAvailableSlots(date, duration);
    
    res.json({
      success: true,
      data: {
        date,
        duration,
        slots: availableSlots
      }
    });

  } catch (error) {
    console.error('Error getting availability:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get availability'
    });
  }
});

// Manual sync trigger (admin only)
router.post('/sync/manual', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    // Initialize calendar service
    await googleCalendarService.initialize();
    
    // Get all bookings without Google Calendar events
    const db = getDatabase();
    const bookingsToSync = await db.all(`
      SELECT b.*, u.first_name, u.last_name, u.email
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      WHERE b.google_calendar_event_id IS NULL 
      AND b.status IN ('confirmed', 'pending')
      AND b.lesson_date > datetime('now')
    `);

    let syncedCount = 0;
    let errorCount = 0;

    for (const booking of bookingsToSync) {
      try {
        const bookingDetails = {
          id: booking.id,
          user_id: booking.user_id,
          lesson_date: booking.lesson_date,
          duration: booking.duration,
          client_name: `${booking.first_name} ${booking.last_name}`,
          client_email: booking.email,
          notes: booking.notes
        };

        const googleEventId = await googleCalendarService.createBookingEvent(bookingDetails);
        
        if (googleEventId) {
          // Update booking with Google Calendar event ID
          await db.run(
            'UPDATE bookings SET google_calendar_event_id = ? WHERE id = ?',
            [googleEventId, booking.id]
          );
          
          // Log successful sync
          await db.run(
            'INSERT INTO calendar_sync_log (action, booking_id, google_event_id, status) VALUES (?, ?, ?, ?)',
            ['create', booking.id, googleEventId, 'success']
          );
          
          syncedCount++;
        } else {
          errorCount++;
          
          // Log failed sync
          await db.run(
            'INSERT INTO calendar_sync_log (action, booking_id, status, error_message) VALUES (?, ?, ?, ?)',
            ['create', booking.id, 'error', 'Failed to create Google Calendar event']
          );
        }

      } catch (error) {
        console.error(`Error syncing booking ${booking.id}:`, error);
        errorCount++;
        
        // Log error
        await db.run(
          'INSERT INTO calendar_sync_log (action, booking_id, status, error_message) VALUES (?, ?, ?, ?)',
          ['create', booking.id, 'error', error.message]
        );
      }
    }

    res.json({
      success: true,
      data: {
        totalBookings: bookingsToSync.length,
        syncedCount,
        errorCount
      },
      message: `Manual sync completed. ${syncedCount} events created, ${errorCount} errors.`
    });

  } catch (error) {
    console.error('Error during manual sync:', error);
    res.status(500).json({
      success: false,
      error: 'Manual sync failed'
    });
  }
});

// Get sync logs (admin only)
router.get('/logs', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const db = getDatabase();
    const limit = parseInt(req.query.limit as string) || 50;
    
    const logs = await db.all(`
      SELECT csl.*, b.lesson_date, 
             u.first_name || ' ' || u.last_name as client_name
      FROM calendar_sync_log csl
      LEFT JOIN bookings b ON csl.booking_id = b.id
      LEFT JOIN users u ON b.user_id = u.id
      ORDER BY csl.sync_time DESC
      LIMIT ?
    `, [limit]);

    res.json({
      success: true,
      data: logs
    });

  } catch (error) {
    console.error('Error getting sync logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get sync logs'
    });
  }
});

// Disconnect Google Calendar
router.post('/disconnect', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const db = getDatabase();

    // Clear Google Calendar credentials and disable sync
    await db.run(`
      UPDATE users SET 
        google_access_token = NULL,
        google_refresh_token = NULL,
        google_token_expiry = NULL,
        calendar_sync_enabled = 0,
        updated_at = CURRENT_TIMESTAMP
      WHERE role = 'admin'
    `);

    res.json({
      success: true,
      message: 'Google Calendar disconnected successfully'
    });

  } catch (error) {
    console.error('Error disconnecting Google Calendar:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to disconnect Google Calendar'
    });
  }
});

export default router;