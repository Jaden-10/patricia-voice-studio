import { Request, Response, NextFunction } from 'express';
import { getDatabase } from '../models/database';
import { AuthenticatedRequest } from './auth';

interface PolicyRequest extends AuthenticatedRequest {
  policyChecks?: {
    cancellationAllowed: boolean;
    rescheduleAllowed: boolean;
    makeupAllowed: boolean;
  };
}

// Check 24-hour cancellation policy
export const checkCancellationPolicy = async (req: PolicyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    const db = getDatabase();
    const bookingId = req.params.id;
    
    // Get booking details
    const booking = await db.get(
      'SELECT * FROM bookings WHERE id = ? AND user_id = ?',
      [bookingId, req.user.id]
    );

    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }

    // Get cancellation policy hours from settings
    const policySetting = await db.get(
      'SELECT value FROM settings WHERE key = ?',
      ['cancellation_policy_hours']
    );

    const policyHours = parseInt(policySetting?.value || '24');
    const bookingDate = new Date(booking.lesson_date);
    const now = new Date();
    const hoursUntilLesson = (bookingDate.getTime() - now.getTime()) / (1000 * 60 * 60);

    const cancellationAllowed = hoursUntilLesson >= policyHours;

    req.policyChecks = {
      cancellationAllowed,
      rescheduleAllowed: cancellationAllowed, // Same policy for reschedule
      makeupAllowed: true // Make-up requests are always allowed
    };

    next();
  } catch (error) {
    console.error('Error checking cancellation policy:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check policy'
    });
  }
};

// Check same-month rescheduling policy
export const checkReschedulePolicy = async (req: PolicyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    const db = getDatabase();
    const bookingId = req.params.id;
    const { new_date } = req.body;
    
    // Get original booking
    const booking = await db.get(
      'SELECT * FROM bookings WHERE id = ? AND user_id = ?',
      [bookingId, req.user.id]
    );

    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }

    const originalDate = new Date(booking.lesson_date);
    const newDate = new Date(new_date);

    // Check if both dates are in the same month and year
    const sameMonth = originalDate.getMonth() === newDate.getMonth() && 
                     originalDate.getFullYear() === newDate.getFullYear();

    if (!sameMonth) {
      return res.status(400).json({
        success: false,
        error: 'Lessons can only be rescheduled within the same month'
      });
    }

    // Check maximum reschedules per month
    const maxReschedulesSetting = await db.get(
      'SELECT value FROM settings WHERE key = ?',
      ['max_reschedules_per_month']
    );

    const maxReschedules = parseInt(maxReschedulesSetting?.value || '2');
    
    // Count reschedules in current month
    const currentMonth = originalDate.getMonth() + 1;
    const currentYear = originalDate.getFullYear();
    
    const rescheduleCount = await db.get(`
      SELECT COUNT(*) as count FROM bookings 
      WHERE user_id = ? AND reschedule_count > 0 
      AND strftime('%m', lesson_date) = ? 
      AND strftime('%Y', lesson_date) = ?
    `, [req.user.id, currentMonth.toString().padStart(2, '0'), currentYear.toString()]);

    if (rescheduleCount.count >= maxReschedules) {
      return res.status(400).json({
        success: false,
        error: `Maximum ${maxReschedules} reschedules per month allowed`
      });
    }

    next();
  } catch (error) {
    console.error('Error checking reschedule policy:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check reschedule policy'
    });
  }
};

// Check make-up lesson limits
export const checkMakeupPolicy = async (req: PolicyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    const db = getDatabase();
    
    // Get maximum pending make-ups from settings
    const maxPendingSetting = await db.get(
      'SELECT value FROM settings WHERE key = ?',
      ['max_pending_makeups']
    );

    const maxPending = parseInt(maxPendingSetting?.value || '2');
    
    // Count current pending make-ups
    const pendingCount = await db.get(`
      SELECT COUNT(*) as count FROM makeup_lessons 
      WHERE user_id = ? AND status = 'pending'
    `, [req.user.id]);

    if (pendingCount.count >= maxPending) {
      return res.status(400).json({
        success: false,
        error: `Maximum ${maxPending} pending make-up lessons allowed`
      });
    }

    next();
  } catch (error) {
    console.error('Error checking make-up policy:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check make-up policy'
    });
  }
};

// Check if date conflicts with blackout periods
export const checkBlackoutDates = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const { lesson_date, new_date } = req.body;
    const dateToCheck = new_date || lesson_date;
    
    if (!dateToCheck) {
      return next();
    }

    const checkDate = new Date(dateToCheck).toISOString().split('T')[0];
    
    // Check if date falls within any blackout period
    const blackoutConflict = await db.get(`
      SELECT * FROM blackout_dates 
      WHERE is_active = 1 
      AND ? BETWEEN start_date AND end_date
    `, [checkDate]);

    if (blackoutConflict) {
      return res.status(400).json({
        success: false,
        error: `Cannot book during ${blackoutConflict.reason} (${blackoutConflict.start_date} to ${blackoutConflict.end_date})`
      });
    }

    next();
  } catch (error) {
    console.error('Error checking blackout dates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check blackout dates'
    });
  }
};

// Enforce automatic charging for late cancellations
export const enforceCancellationCharging = async (req: PolicyRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.policyChecks?.cancellationAllowed) {
      const db = getDatabase();
      const bookingId = req.params.id;
      
      // Get booking details
      const booking = await db.get('SELECT * FROM bookings WHERE id = ?', [bookingId]);
      
      // Create automatic charge (this would integrate with payment system)
      await db.run(`
        INSERT INTO payments (booking_id, amount, payment_method, status, payment_reference)
        VALUES (?, ?, 'automatic_charge', 'pending', 'late_cancellation_fee')
      `, [bookingId, booking.price]);

      // Update booking with cancellation reason
      await db.run(`
        UPDATE bookings 
        SET status = 'cancelled', cancellation_reason = 'Late cancellation - automatic charge applied',
            cancelled_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [bookingId]);

      return res.json({
        success: true,
        message: 'Booking cancelled with automatic charge due to 24-hour policy violation',
        charged: true,
        amount: booking.price
      });
    }

    next();
  } catch (error) {
    console.error('Error enforcing cancellation charging:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process cancellation'
    });
  }
};

// No refunds policy enforcement
export const enforceNoRefundsPolicy = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const db = getDatabase();
    const { refund_reason } = req.body;
    
    // Only allow refunds when Patricia cancels
    if (refund_reason !== 'instructor_cancellation') {
      return res.status(400).json({
        success: false,
        error: 'Refunds are only available when the instructor cancels the lesson'
      });
    }

    next();
  } catch (error) {
    console.error('Error enforcing no refunds policy:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process refund request'
    });
  }
};