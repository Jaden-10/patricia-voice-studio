import express from 'express';
import { getDatabase } from '../models/database';
import { authenticateToken, AuthenticatedRequest, requireVerified } from '../middleware/auth';
import { 
  checkCancellationPolicy, 
  checkReschedulePolicy, 
  checkBlackoutDates, 
  enforceCancellationCharging 
} from '../middleware/policies';
import { CreateBookingData, Booking } from '../types';
import { googleCalendarService } from '../services/googleCalendar';

const router = express.Router();

// Get all bookings for current user
router.get('/', authenticateToken, requireVerified, async (req: AuthenticatedRequest, res) => {
  try {
    const db = getDatabase();
    const bookings = await db.all(
      'SELECT * FROM bookings WHERE user_id = ? ORDER BY lesson_date DESC',
      [req.user!.id]
    );

    res.json({
      success: true,
      data: bookings
    });

  } catch (error) {
    console.error('Get bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch bookings'
    });
  }
});

// Get specific booking
router.get('/:id', authenticateToken, requireVerified, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const db = getDatabase();
    
    const booking = await db.get(
      'SELECT * FROM bookings WHERE id = ? AND user_id = ?',
      [id, req.user!.id]
    );

    if (!booking) {
      res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
      return;
    }

    res.json({
      success: true,
      data: booking
    });

  } catch (error) {
    console.error('Get booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch booking'
    });
  }
});

// Create new booking
router.post('/', authenticateToken, requireVerified, checkBlackoutDates, async (req: AuthenticatedRequest, res) => {
  try {
    const { lesson_date, duration, notes }: CreateBookingData = req.body;

    // Validation
    if (!lesson_date || !duration) {
      res.status(400).json({
        success: false,
        message: 'Lesson date and duration are required'
      });
      return;
    }

    // Check if lesson is in the future
    const lessonDateTime = new Date(lesson_date);
    if (lessonDateTime <= new Date()) {
      res.status(400).json({
        success: false,
        message: 'Lesson must be scheduled for a future date and time'
      });
      return;
    }

    // Calculate price based on duration
    const price = duration === 45 ? 70.00 : 85.00;

    const db = getDatabase();

    // Check for scheduling conflicts
    const conflictingBooking = await db.get(
      `SELECT id FROM bookings 
       WHERE lesson_date = ? AND status NOT IN ('cancelled', 'completed')`,
      [lessonDateTime.toISOString()]
    );

    if (conflictingBooking) {
      res.status(400).json({
        success: false,
        message: 'This time slot is already booked'
      });
      return;
    }

    const result = await db.run(
      `INSERT INTO bookings (user_id, lesson_date, duration, price, notes, status) 
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      [req.user!.id, lessonDateTime.toISOString(), duration, price, notes]
    );

    // Try to create Google Calendar event if sync is enabled
    let googleEventId = null;
    try {
      const syncEnabled = await googleCalendarService.isCalendarSyncEnabled();
      
      if (syncEnabled && result.lastID) {
        const user = await db.get('SELECT first_name, last_name, email FROM users WHERE id = ?', [req.user!.id]);
        
        const bookingDetails = {
          id: result.lastID as number,
          user_id: req.user!.id,
          lesson_date: lessonDateTime.toISOString(),
          duration,
          client_name: `${user.first_name} ${user.last_name}`,
          client_email: user.email,
          notes
        };

        googleEventId = await googleCalendarService.createBookingEvent(bookingDetails);
        
        if (googleEventId) {
          // Update booking with Google Calendar event ID
          await db.run(
            'UPDATE bookings SET google_calendar_event_id = ? WHERE id = ?',
            [googleEventId, result.lastID]
          );

          // Log successful sync
          await db.run(
            'INSERT INTO calendar_sync_log (action, booking_id, google_event_id, status) VALUES (?, ?, ?, ?)',
            ['create', result.lastID, googleEventId, 'success']
          );
        } else {
          // Log failed sync
          await db.run(
            'INSERT INTO calendar_sync_log (action, booking_id, status, error_message) VALUES (?, ?, ?, ?)',
            ['create', result.lastID, 'error', 'Failed to create Google Calendar event']
          );
        }
      }
    } catch (calendarError: unknown) {
      const errorMessage = calendarError instanceof Error ? calendarError.message : String(calendarError);
      console.error('Google Calendar sync error:', errorMessage);
      
      // Log calendar error but don't fail the booking
      if (result.lastID) {
        await db.run(
          'INSERT INTO calendar_sync_log (action, booking_id, status, error_message) VALUES (?, ?, ?, ?)',
          ['create', result.lastID, 'error', errorMessage]
        );
      }
    }

    res.status(201).json({
      success: true,
      message: 'Booking created successfully' + (googleEventId ? ' and added to calendar' : ''),
      data: { 
        bookingId: result.lastID,
        amount: price,
        duration: duration,
        lessonDate: lessonDateTime.toISOString(),
        calendarSynced: !!googleEventId,
        paymentRequired: true
      }
    });

  } catch (error) {
    console.error('Create booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create booking'
    });
  }
});

// Update booking (reschedule)
router.put('/:id', authenticateToken, requireVerified, checkReschedulePolicy, checkBlackoutDates, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { lesson_date, notes } = req.body;

    if (!lesson_date) {
      res.status(400).json({
        success: false,
        message: 'New lesson date is required'
      });
      return;
    }

    const db = getDatabase();
    
    // Get current booking
    const booking = await db.get(
      'SELECT * FROM bookings WHERE id = ? AND user_id = ?',
      [id, req.user!.id]
    );

    if (!booking) {
      res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
      return;
    }

    const newLessonDate = new Date(lesson_date);
    const currentLessonDate = new Date(booking.lesson_date);

    // Check if rescheduling within same month
    if (newLessonDate.getMonth() !== currentLessonDate.getMonth() || 
        newLessonDate.getFullYear() !== currentLessonDate.getFullYear()) {
      res.status(400).json({
        success: false,
        message: 'Lessons can only be rescheduled within the same month'
      });
      return;
    }

    // Check for conflicts
    const conflictingBooking = await db.get(
      `SELECT id FROM bookings 
       WHERE lesson_date = ? AND status NOT IN ('cancelled', 'completed') AND id != ?`,
      [newLessonDate.toISOString(), id]
    );

    if (conflictingBooking) {
      res.status(400).json({
        success: false,
        message: 'This time slot is already booked'
      });
      return;
    }

    await db.run(
      `UPDATE bookings 
       SET lesson_date = ?, notes = ?, reschedule_count = reschedule_count + 1, 
           original_date = COALESCE(original_date, ?), updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [newLessonDate.toISOString(), notes, booking.lesson_date, id]
    );

    // Update Google Calendar event if it exists
    let calendarUpdated = false;
    try {
      const syncEnabled = await googleCalendarService.isCalendarSyncEnabled();
      
      if (syncEnabled && booking.google_calendar_event_id) {
        const user = await db.get('SELECT first_name, last_name, email FROM users WHERE id = ?', [req.user!.id]);
        
        const updatedBookingDetails = {
          id: booking.id,
          user_id: req.user!.id,
          lesson_date: newLessonDate.toISOString(),
          duration: booking.duration,
          client_name: `${user.first_name} ${user.last_name}`,
          client_email: user.email,
          notes
        };

        calendarUpdated = await googleCalendarService.updateBookingEvent(
          booking.google_calendar_event_id,
          updatedBookingDetails
        );
        
        // Log sync result
        await db.run(
          'INSERT INTO calendar_sync_log (action, booking_id, google_event_id, status, error_message) VALUES (?, ?, ?, ?, ?)',
          ['update', id, booking.google_calendar_event_id, calendarUpdated ? 'success' : 'error', calendarUpdated ? null : 'Failed to update Google Calendar event']
        );
      }
    } catch (calendarError: unknown) {
      const errorMessage = calendarError instanceof Error ? calendarError.message : String(calendarError);
      console.error('Google Calendar update error:', errorMessage);
      
      // Log calendar error but don't fail the reschedule
      await db.run(
        'INSERT INTO calendar_sync_log (action, booking_id, google_event_id, status, error_message) VALUES (?, ?, ?, ?, ?)',
        ['update', id, booking.google_calendar_event_id, 'error', errorMessage]
      );
    }

    res.json({
      success: true,
      message: 'Booking rescheduled successfully' + (calendarUpdated ? ' and calendar updated' : ''),
      data: {
        calendarUpdated
      }
    });

  } catch (error) {
    console.error('Update booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update booking'
    });
  }
});

// Cancel booking
router.delete('/:id', authenticateToken, requireVerified, checkCancellationPolicy, enforceCancellationCharging, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const db = getDatabase();

    const booking = await db.get(
      'SELECT * FROM bookings WHERE id = ? AND user_id = ?',
      [id, req.user!.id]
    );

    if (!booking) {
      res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
      return;
    }

    await db.run(
      'UPDATE bookings SET status = \'cancelled\', cancelled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [id]
    );

    // Delete Google Calendar event if it exists
    let calendarDeleted = false;
    try {
      const syncEnabled = await googleCalendarService.isCalendarSyncEnabled();
      
      if (syncEnabled && booking.google_calendar_event_id) {
        calendarDeleted = await googleCalendarService.deleteBookingEvent(booking.google_calendar_event_id);
        
        // Log sync result
        await db.run(
          'INSERT INTO calendar_sync_log (action, booking_id, google_event_id, status, error_message) VALUES (?, ?, ?, ?, ?)',
          ['delete', id, booking.google_calendar_event_id, calendarDeleted ? 'success' : 'error', calendarDeleted ? null : 'Failed to delete Google Calendar event']
        );
      }
    } catch (calendarError: unknown) {
      const errorMessage = calendarError instanceof Error ? calendarError.message : String(calendarError);
      console.error('Google Calendar deletion error:', errorMessage);
      
      // Log calendar error but don't fail the cancellation
      await db.run(
        'INSERT INTO calendar_sync_log (action, booking_id, google_event_id, status, error_message) VALUES (?, ?, ?, ?, ?)',
        ['delete', id, booking.google_calendar_event_id, 'error', errorMessage]
      );
    }

    res.json({
      success: true,
      message: 'Booking cancelled successfully' + (calendarDeleted ? ' and removed from calendar' : ''),
      data: {
        calendarDeleted
      }
    });

  } catch (error) {
    console.error('Cancel booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel booking'
    });
  }
});

// Get available time slots
router.get('/availability/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const requestedDate = new Date(date);

    // Basic business hours (9 AM to 6 PM)
    const businessStart = 9;
    const businessEnd = 18;
    const slotDuration = 60; // minutes

    const availableSlots = [];
    
    for (let hour = businessStart; hour < businessEnd; hour++) {
      const slotTime = new Date(requestedDate);
      slotTime.setHours(hour, 0, 0, 0);

      // Check if slot is available
      const db = getDatabase();
      const existingBooking = await db.get(
        `SELECT id FROM bookings 
         WHERE DATE(lesson_date) = DATE(?) AND 
               TIME(lesson_date) = TIME(?) AND 
               status NOT IN ('cancelled', 'completed')`,
        [requestedDate.toISOString(), slotTime.toISOString()]
      );

      availableSlots.push({
        time: slotTime.toISOString(),
        available: !existingBooking
      });
    }

    res.json({
      success: true,
      data: availableSlots
    });

  } catch (error) {
    console.error('Get availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch availability'
    });
  }
});

export { router as bookingRoutes };