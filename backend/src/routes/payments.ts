import express from 'express';
import { getDatabase } from '../models/database';
import { authenticateToken, AuthenticatedRequest, requireVerified, requireRole } from '../middleware/auth';
import { stripeService } from '../services/stripe';

const router = express.Router();

// Generate Venmo payment link
router.post('/venmo-link', authenticateToken, requireVerified, async (req: AuthenticatedRequest, res) => {
  try {
    const { booking_id } = req.body;

    if (!booking_id) {
      res.status(400).json({
        success: false,
        message: 'Booking ID is required'
      });
      return;
    }

    const db = getDatabase();
    
    // Get booking details
    const booking = await db.get(
      'SELECT * FROM bookings WHERE id = ? AND user_id = ?',
      [booking_id, req.user!.id]
    );

    if (!booking) {
      res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
      return;
    }

    // Get Venmo username from settings
    const venmoSetting = await db.get('SELECT value FROM settings WHERE key = \'venmo_username\'');
    const venmoUsername = venmoSetting?.value || 'patricia-freund';

    // Create payment record
    const paymentResult = await db.run(
      'INSERT INTO payments (booking_id, amount, payment_method, status) VALUES (?, ?, \'venmo\', \'pending\')',
      [booking_id, booking.price]
    );

    // Generate Venmo payment link
    const lessonDate = new Date(booking.lesson_date).toLocaleDateString();
    const note = `Voice lesson ${booking.duration}min - ${lessonDate}`;
    const venmoLink = `https://venmo.com/${venmoUsername}?txn=pay&amount=${booking.price}&note=${encodeURIComponent(note)}`;

    // Update payment with Venmo link
    await db.run(
      'UPDATE payments SET venmo_link = ? WHERE id = ?',
      [venmoLink, paymentResult.lastID]
    );

    res.json({
      success: true,
      data: {
        paymentId: paymentResult.lastID,
        venmoLink,
        amount: booking.price,
        note
      }
    });

  } catch (error) {
    console.error('Generate Venmo link error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate Venmo payment link'
    });
  }
});

// Generate Zelle payment info
router.post('/zelle-info', authenticateToken, requireVerified, async (req: AuthenticatedRequest, res) => {
  try {
    const { booking_id } = req.body;

    if (!booking_id) {
      res.status(400).json({
        success: false,
        message: 'Booking ID is required'
      });
      return;
    }

    const db = getDatabase();
    
    // Get booking details
    const booking = await db.get(
      'SELECT * FROM bookings WHERE id = ? AND user_id = ?',
      [booking_id, req.user!.id]
    );

    if (!booking) {
      res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
      return;
    }

    // Get Zelle email from settings
    const zelleSetting = await db.get('SELECT value FROM settings WHERE key = \'zelle_email\'');
    const zelleEmail = zelleSetting?.value || 'patricia@songbirdvoicestudio.com';

    // Create payment record
    const paymentResult = await db.run(
      'INSERT INTO payments (booking_id, amount, payment_method, status) VALUES (?, ?, \'zelle\', \'pending\')',
      [booking_id, booking.price]
    );

    // Generate reference number
    const reference = `LESSON-${booking_id}-${Date.now()}`;

    // Update payment with Zelle reference
    await db.run(
      'UPDATE payments SET zelle_reference = ? WHERE id = ?',
      [reference, paymentResult.lastID]
    );

    res.json({
      success: true,
      data: {
        paymentId: paymentResult.lastID,
        zelleEmail,
        amount: booking.price,
        reference,
        instructions: 'Please send payment via Zelle using the email above and include the reference number in the memo.'
      }
    });

  } catch (error) {
    console.error('Generate Zelle info error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate Zelle payment info'
    });
  }
});

// Create Stripe payment intent
router.post('/stripe/create-payment-intent', authenticateToken, requireVerified, async (req: AuthenticatedRequest, res) => {
  try {
    const { booking_id } = req.body;

    if (!booking_id) {
      return res.status(400).json({
        success: false,
        message: 'Booking ID is required'
      });
    }

    const db = getDatabase();
    
    // Get booking details
    const booking = await db.get(`
      SELECT b.*, u.first_name, u.last_name, u.email 
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      WHERE b.id = ? AND b.user_id = ?
    `, [booking_id, req.user!.id]);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    // Check if payment already exists
    const existingPayment = await db.get(
      'SELECT id FROM payments WHERE booking_id = ? AND status IN (?, ?)',
      [booking_id, 'completed', 'pending']
    );

    if (existingPayment) {
      return res.status(400).json({
        success: false,
        message: 'Payment already exists for this booking'
      });
    }

    // Create payment intent
    const paymentResult = await stripeService.createPaymentIntent({
      amount: Math.round(booking.price * 100), // Convert to cents
      bookingId: booking_id,
      clientEmail: booking.email,
      clientName: `${booking.first_name} ${booking.last_name}`,
      lessonDate: booking.lesson_date,
      duration: booking.duration
    });

    if (!paymentResult.success) {
      return res.status(500).json({
        success: false,
        message: paymentResult.error || 'Failed to create payment intent'
      });
    }

    res.json({
      success: true,
      data: {
        clientSecret: paymentResult.clientSecret,
        paymentIntentId: paymentResult.paymentIntentId,
        amount: booking.price
      }
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Create payment intent error:', errorMessage);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment intent'
    });
  }
});

// Stripe webhook endpoint
router.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['stripe-signature'] as string;
    const body = req.body.toString();

    const result = await stripeService.handleWebhook(body, signature);

    if (result.success) {
      res.json({ received: true });
    } else {
      res.status(400).json({ error: result.error });
    }

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Webhook error:', errorMessage);
    res.status(400).json({ error: 'Webhook failed' });
  }
});

// Get payment details
router.get('/:id', authenticateToken, requireVerified, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const db = getDatabase();

    const payment = await db.get(
      `SELECT p.*, b.user_id
       FROM payments p
       JOIN bookings b ON p.booking_id = b.id
       WHERE p.id = ? AND b.user_id = ?`,
      [id, req.user!.id]
    );

    if (!payment) {
      res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
      return;
    }

    res.json({
      success: true,
      data: payment
    });

  } catch (error) {
    console.error('Get payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment details'
    });
  }
});

// Get payments for user's bookings
router.get('/', authenticateToken, requireVerified, async (req: AuthenticatedRequest, res) => {
  try {
    const db = getDatabase();
    const payments = await db.all(
      `SELECT p.*, b.lesson_date, b.duration
       FROM payments p
       JOIN bookings b ON p.booking_id = b.id
       WHERE b.user_id = ?
       ORDER BY p.created_at DESC`,
      [req.user!.id]
    );

    res.json({
      success: true,
      data: payments
    });

  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payments'
    });
  }
});

// Mark payment as completed (admin only)
router.put('/:id/complete', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    // Only admin can mark payments as completed
    if (req.user!.role !== 'admin') {
      res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
      return;
    }

    const { id } = req.params;
    const { payment_reference } = req.body;

    const db = getDatabase();
    await db.run(
      `UPDATE payments 
       SET status = 'completed', payment_date = CURRENT_TIMESTAMP, payment_reference = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [payment_reference, id]
    );

    res.json({
      success: true,
      message: 'Payment marked as completed'
    });

  } catch (error) {
    console.error('Complete payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to complete payment'
    });
  }
});

// Get payment statistics (admin only)
router.get('/admin/stats', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    if (req.user!.role !== 'admin') {
      res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
      return;
    }

    const db = getDatabase();
    
    // Get payment statistics
    const totalRevenue = await db.get(
      'SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE status = \'completed\''
    );

    const monthlyRevenue = await db.get(
      `SELECT COALESCE(SUM(amount), 0) as total 
       FROM payments 
       WHERE status = 'completed' 
       AND strftime('%Y-%m', payment_date) = strftime('%Y-%m', 'now')`
    );

    const pendingPayments = await db.get(
      'SELECT COUNT(*) as count FROM payments WHERE status = \'pending\''
    );

    const paymentMethods = await db.all(
      `SELECT payment_method, COUNT(*) as count, COALESCE(SUM(amount), 0) as total
       FROM payments 
       WHERE status = 'completed'
       GROUP BY payment_method`
    );

    res.json({
      success: true,
      data: {
        totalRevenue: totalRevenue.total,
        monthlyRevenue: monthlyRevenue.total,
        pendingPayments: pendingPayments.count,
        paymentMethods
      }
    });

  } catch (error) {
    console.error('Get payment stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment statistics'
    });
  }
});

export { router as paymentRoutes };