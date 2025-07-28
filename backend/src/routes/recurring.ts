import express from 'express';
import { getDatabase } from '../models/database';
import { authenticateToken, requireRole, AuthenticatedRequest } from '../middleware/auth';
import { 
  RecurringBooking, 
  CreateRecurringBookingData, 
  BillingCycle,
  MakeupLesson,
  BlackoutDate 
} from '../types';

const router = express.Router();

// Create a new recurring booking (academic year schedule)
router.post('/', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    const db = getDatabase();

    const { 
      duration, 
      day_of_week, 
      time, 
      frequency, 
      start_date,
      lesson_type = 'regular'
    }: CreateRecurringBookingData = req.body;

    // Get pricing from settings
    const priceKey = `lesson_${duration}_price`;
    const priceResult = await db.get(
      'SELECT value FROM settings WHERE key = ?',
      [priceKey]
    );

    if (!priceResult) {
      return res.status(400).json({
        success: false,
        error: 'Invalid lesson duration'
      });
    }

    const price = parseFloat(priceResult.value);

    // Set end date to academic year end
    const academicYearEnd = await db.get(
      'SELECT value FROM settings WHERE key = ?',
      ['academic_year_end']
    );

    // Convert start_date to string format for database storage
    const startDateString = typeof start_date === 'string' ? start_date : new Date(start_date).toISOString().split('T')[0];

    const result = await db.run(`
      INSERT INTO recurring_bookings (
        user_id, duration, price, day_of_week, time, 
        frequency, start_date, end_date, lesson_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      req.user.id, 
      duration, 
      price, 
      day_of_week, 
      time, 
      frequency, 
      startDateString,
      academicYearEnd?.value || '2026-06-30',
      lesson_type
    ]);

    // Generate monthly billing cycles for the academic year
    await generateBillingCycles(result.lastID!, req.user.id, startDateString, academicYearEnd?.value || '2026-06-30', price, frequency);

    res.json({
      success: true,
      data: { id: result.lastID },
      message: 'Recurring booking created successfully'
    });

  } catch (error) {
    console.error('Error creating recurring booking:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create recurring booking'
    });
  }
});

// Get user's recurring bookings
router.get('/', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    const db = getDatabase();

    const bookings = await db.all(`
      SELECT * FROM recurring_bookings 
      WHERE user_id = ? AND status = 'active'
      ORDER BY day_of_week, time
    `, [req.user.id]);

    res.json({
      success: true,
      data: bookings
    });

  } catch (error) {
    console.error('Error fetching recurring bookings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch recurring bookings'
    });
  }
});

// Get all recurring bookings (admin only)
router.get('/all', authenticateToken, requireRole('admin'), async (req: AuthenticatedRequest, res) => {
  try {
    const db = getDatabase();

    const bookings = await db.all(`
      SELECT rb.*, u.first_name, u.last_name, u.email
      FROM recurring_bookings rb
      JOIN users u ON rb.user_id = u.id
      WHERE rb.status = 'active'
      ORDER BY rb.day_of_week, rb.time
    `);

    res.json({
      success: true,
      data: bookings
    });

  } catch (error) {
    console.error('Error fetching all recurring bookings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch recurring bookings'
    });
  }
});

// Update recurring booking
router.put('/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    const db = getDatabase();

    const { id } = req.params;
    const { day_of_week, time, frequency, status } = req.body;

    // Check if user owns this booking or is admin
    const booking = await db.get(
      'SELECT * FROM recurring_bookings WHERE id = ?',
      [id]
    );

    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Recurring booking not found'
      });
    }

    if (booking.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    await db.run(`
      UPDATE recurring_bookings 
      SET day_of_week = ?, time = ?, frequency = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [day_of_week, time, frequency, status, id]);

    res.json({
      success: true,
      message: 'Recurring booking updated successfully'
    });

  } catch (error) {
    console.error('Error updating recurring booking:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update recurring booking'
    });
  }
});

// Get billing cycles for user
router.get('/billing', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    const db = getDatabase();

    const cycles = await db.all(`
      SELECT bc.*, rb.duration, rb.lesson_type
      FROM billing_cycles bc
      JOIN recurring_bookings rb ON bc.recurring_booking_id = rb.id
      WHERE bc.user_id = ?
      ORDER BY bc.cycle_year DESC, bc.cycle_month DESC
    `, [req.user.id]);

    res.json({
      success: true,
      data: cycles
    });

  } catch (error) {
    console.error('Error fetching billing cycles:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch billing cycles'
    });
  }
});

// Mark billing cycle as paid (admin only)
router.post('/billing/:id/paid', authenticateToken, requireRole('admin'), async (req: AuthenticatedRequest, res) => {
  try {
    const db = getDatabase();

    const { id } = req.params;
    const { payment_method, payment_reference } = req.body;

    await db.run(`
      UPDATE billing_cycles 
      SET status = 'paid', paid_date = CURRENT_TIMESTAMP, 
          payment_method = ?, payment_reference = ?
      WHERE id = ?
    `, [payment_method, payment_reference, id]);

    res.json({
      success: true,
      message: 'Billing cycle marked as paid'
    });

  } catch (error) {
    console.error('Error updating billing cycle:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update billing cycle'
    });
  }
});

// Get blackout dates
router.get('/blackout-dates', async (req, res) => {
  try {
    const db = getDatabase();

    const blackoutDates = await db.all(`
      SELECT * FROM blackout_dates 
      WHERE is_active = 1 
      ORDER BY start_date
    `);

    res.json({
      success: true,
      data: blackoutDates
    });

  } catch (error) {
    console.error('Error fetching blackout dates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch blackout dates'
    });
  }
});

// Helper function to generate billing cycles
async function generateBillingCycles(
  recurringBookingId: number, 
  userId: number, 
  startDate: string, 
  endDate: string, 
  lessonPrice: number, 
  frequency: string
) {
  const db = getDatabase();
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  // Calculate lessons per month based on frequency
  const lessonsPerMonth = frequency === 'weekly' ? 4 : 2;
  const monthlyAmount = lessonPrice * lessonsPerMonth;

  let currentDate = new Date(start.getFullYear(), start.getMonth(), 1);
  
  while (currentDate <= end) {
    const cycleMonth = currentDate.getMonth() + 1;
    const cycleYear = currentDate.getFullYear();
    
    // First of the month billing date
    const billingDate = new Date(cycleYear, cycleMonth - 1, 1);
    // Due date is 15th of the month
    const dueDate = new Date(cycleYear, cycleMonth - 1, 15);

    await db.run(`
      INSERT INTO billing_cycles (
        user_id, recurring_booking_id, cycle_month, cycle_year,
        total_amount, lessons_count, billing_date, due_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      userId, 
      recurringBookingId, 
      cycleMonth, 
      cycleYear,
      monthlyAmount,
      lessonsPerMonth,
      billingDate.toISOString().split('T')[0],
      dueDate.toISOString().split('T')[0]
    ]);

    // Move to next month
    currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
  }
}

export default router;