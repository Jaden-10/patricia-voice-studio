import express from 'express';
import { getDatabase } from '../models/database';
import { authenticateToken, AuthenticatedRequest, requireAdmin } from '../middleware/auth';
import { sendSMS } from '../services/sms';
import { sendEmail } from '../services/email';

const router = express.Router();

// Send SMS notification (admin only)
router.post('/sms', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { phone, message, booking_id } = req.body;

    if (!phone || !message) {
      res.status(400).json({
        success: false,
        message: 'Phone number and message are required'
      });
      return;
    }

    const db = getDatabase();

    // Send SMS
    const smsResult = await sendSMS(phone, message);

    // Create notification record
    const notificationData = {
      user_id: null, // Admin-initiated
      booking_id: booking_id || null,
      title: 'SMS Notification',
      message,
      type: 'general',
      sms_sent: true,
      sent_at: new Date().toISOString()
    };

    await db.run(
      `INSERT INTO notifications (user_id, booking_id, title, message, type, sms_sent, sent_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [notificationData.user_id, notificationData.booking_id, notificationData.title, 
       notificationData.message, notificationData.type, notificationData.sms_sent, notificationData.sent_at]
    );

    res.json({
      success: true,
      message: 'SMS sent successfully',
      data: smsResult
    });

  } catch (error) {
    console.error('Send SMS error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send SMS'
    });
  }
});

// Send reminder notifications for upcoming lessons
router.post('/reminders', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { hours } = req.body; // 24 or 2 hours before

    if (!hours || (hours !== 24 && hours !== 2)) {
      res.status(400).json({
        success: false,
        message: 'Hours must be 24 or 2'
      });
      return;
    }

    const db = getDatabase();

    // Get lessons that need reminders
    const targetTime = new Date();
    targetTime.setHours(targetTime.getHours() + hours);

    const bookings = await db.all(
      `SELECT b.*, u.first_name, u.last_name, u.email, u.phone
       FROM bookings b
       JOIN users u ON b.user_id = u.id
       WHERE b.status = 'confirmed'
       AND datetime(b.lesson_date) BETWEEN datetime('now', '+${hours-1} hours') AND datetime('now', '+${hours+1} hours')
       AND NOT EXISTS (
         SELECT 1 FROM notifications n 
         WHERE n.booking_id = b.id 
         AND n.type = 'reminder' 
         AND n.message LIKE '%${hours} hour%'
         AND n.sent_at IS NOT NULL
       )`
    );

    let sentCount = 0;

    for (const booking of bookings) {
      try {
        const lessonDate = new Date(booking.lesson_date);
        const formattedDate = lessonDate.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
        const formattedTime = lessonDate.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });

        const message = `Reminder: You have a ${booking.duration}-minute voice lesson with Patricia in ${hours} hours on ${formattedDate} at ${formattedTime}.`;
        
        // Send SMS if phone number available
        let smsResult = null;
        if (booking.phone) {
          try {
            smsResult = await sendSMS(booking.phone, message);
          } catch (smsError) {
            console.error('SMS sending failed for booking', booking.id, smsError);
          }
        }

        // Send email
        let emailResult = null;
        try {
          await sendEmail({
            to: booking.email,
            subject: `Lesson Reminder - ${hours} Hours Until Your Voice Lesson`,
            html: `
              <h1>Lesson Reminder</h1>
              <p>Hi ${booking.first_name},</p>
              <p>${message}</p>
              <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3>Lesson Details:</h3>
                <p><strong>Date:</strong> ${formattedDate}</p>
                <p><strong>Time:</strong> ${formattedTime}</p>
                <p><strong>Duration:</strong> ${booking.duration} minutes</p>
              </div>
              <p>We look forward to seeing you!</p>
              <p>Best regards,<br>Patricia Freund<br>Songbird Voice Studio</p>
            `
          });
          emailResult = true;
        } catch (emailError) {
          console.error('Email sending failed for booking', booking.id, emailError);
        }

        // Create notification record
        await db.run(
          `INSERT INTO notifications (user_id, booking_id, title, message, type, sms_sent, email_sent, sent_at) 
           VALUES (?, ?, ?, ?, 'reminder', ?, ?, CURRENT_TIMESTAMP)`,
          [booking.user_id, booking.id, `${hours}-Hour Reminder`, message, !!smsResult, !!emailResult]
        );

        sentCount++;

      } catch (error) {
        console.error('Error sending reminder for booking', booking.id, error);
      }
    }

    res.json({
      success: true,
      message: `Sent ${sentCount} reminder notifications`,
      data: { sentCount, totalEligible: bookings.length }
    });

  } catch (error) {
    console.error('Send reminders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send reminders'
    });
  }
});

// Schedule automatic reminders (admin only)
router.post('/schedule-reminders', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const db = getDatabase();

    // Get upcoming confirmed bookings that need reminder scheduling
    const upcomingBookings = await db.all(
      `SELECT b.*, u.first_name, u.last_name, u.email, u.phone
       FROM bookings b
       JOIN users u ON b.user_id = u.id
       WHERE b.status = 'confirmed'
       AND datetime(b.lesson_date) > datetime('now', '+2 hours')
       AND NOT EXISTS (
         SELECT 1 FROM notifications n 
         WHERE n.booking_id = b.id 
         AND n.type = 'reminder' 
         AND n.scheduled_for IS NOT NULL
       )`
    );

    let scheduledCount = 0;

    for (const booking of upcomingBookings) {
      const lessonDate = new Date(booking.lesson_date);
      
      // Schedule 24-hour reminder
      const reminder24h = new Date(lessonDate);
      reminder24h.setHours(reminder24h.getHours() - 24);

      // Schedule 2-hour reminder
      const reminder2h = new Date(lessonDate);
      reminder2h.setHours(reminder2h.getHours() - 2);

      const message24h = `Reminder: You have a ${booking.duration}-minute voice lesson with Patricia tomorrow at ${lessonDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}.`;
      const message2h = `Reminder: You have a ${booking.duration}-minute voice lesson with Patricia in 2 hours.`;

      // Create scheduled notification records
      if (reminder24h > new Date()) {
        await db.run(
          `INSERT INTO notifications (user_id, booking_id, title, message, type, scheduled_for) 
           VALUES (?, ?, ?, ?, 'reminder', ?)`,
          [booking.user_id, booking.id, '24-Hour Reminder', message24h, reminder24h.toISOString()]
        );
      }

      if (reminder2h > new Date()) {
        await db.run(
          `INSERT INTO notifications (user_id, booking_id, title, message, type, scheduled_for) 
           VALUES (?, ?, ?, ?, 'reminder', ?)`,
          [booking.user_id, booking.id, '2-Hour Reminder', message2h, reminder2h.toISOString()]
        );
      }

      scheduledCount++;
    }

    res.json({
      success: true,
      message: `Scheduled reminders for ${scheduledCount} bookings`,
      data: { scheduledCount }
    });

  } catch (error) {
    console.error('Schedule reminders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to schedule reminders'
    });
  }
});

// Process scheduled notifications (cron job endpoint)
router.post('/process-scheduled', async (req, res) => {
  try {
    // Simple security check - this endpoint should be called by a cron job
    const cronKey = req.headers['x-cron-key'];
    if (cronKey !== process.env.CRON_SECRET_KEY) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
      return;
    }

    const db = getDatabase();

    // Get notifications that are due to be sent
    const dueNotifications = await db.all(
      `SELECT n.*, u.email, u.phone, u.first_name, u.last_name
       FROM notifications n
       JOIN users u ON n.user_id = u.id
       WHERE n.scheduled_for IS NOT NULL
       AND n.sent_at IS NULL
       AND datetime(n.scheduled_for) <= datetime('now')
       ORDER BY n.scheduled_for ASC`
    );

    let processedCount = 0;

    for (const notification of dueNotifications) {
      try {
        // Send SMS if phone available
        let smsResult = false;
        if (notification.phone) {
          try {
            await sendSMS(notification.phone, notification.message);
            smsResult = true;
          } catch (error) {
            console.error('SMS failed for notification', notification.id, error);
          }
        }

        // Send email
        let emailResult = false;
        try {
          await sendEmail({
            to: notification.email,
            subject: notification.title,
            html: `
              <h1>${notification.title}</h1>
              <p>Hi ${notification.first_name},</p>
              <p>${notification.message}</p>
              <p>Best regards,<br>Patricia Freund<br>Songbird Voice Studio</p>
            `
          });
          emailResult = true;
        } catch (error) {
          console.error('Email failed for notification', notification.id, error);
        }

        // Update notification as sent
        await db.run(
          'UPDATE notifications SET sent_at = CURRENT_TIMESTAMP, sms_sent = ?, email_sent = ? WHERE id = ?',
          [smsResult, emailResult, notification.id]
        );

        processedCount++;

      } catch (error) {
        console.error('Error processing notification', notification.id, error);
      }
    }

    res.json({
      success: true,
      message: `Processed ${processedCount} scheduled notifications`,
      data: { processedCount, totalDue: dueNotifications.length }
    });

  } catch (error) {
    console.error('Process scheduled notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process scheduled notifications'
    });
  }
});

// Get notification history (admin only)
router.get('/history', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const db = getDatabase();
    const notifications = await db.all(
      `SELECT n.*, u.first_name, u.last_name, u.email
       FROM notifications n
       LEFT JOIN users u ON n.user_id = u.id
       ORDER BY n.created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    const totalCount = await db.get('SELECT COUNT(*) as count FROM notifications');

    res.json({
      success: true,
      data: {
        notifications,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: totalCount.count
        }
      }
    });

  } catch (error) {
    console.error('Get notification history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notification history'
    });
  }
});

export { router as notificationRoutes };