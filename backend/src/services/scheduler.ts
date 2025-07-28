import cron from 'node-cron';
import { getDatabase } from '../models/database';
import { twilioService } from './twilio';

class SchedulerService {
  private db = getDatabase();

  constructor() {
    this.initializeScheduledTasks();
  }

  private initializeScheduledTasks() {
    // Send lesson reminders at 9 AM every day
    cron.schedule('0 9 * * *', () => {
      this.sendDailyReminders();
    });

    // Send payment reminders on the 1st of each month at 10 AM
    cron.schedule('0 10 1 * *', () => {
      this.sendMonthlyPaymentReminders();
    });

    // Check for overdue payments daily at 11 AM
    cron.schedule('0 11 * * *', () => {
      this.checkOverduePayments();
    });

    // Weekly check for Saturday makeup sessions on Fridays at 5 PM
    cron.schedule('0 17 * * 5', () => {
      this.notifyMakeupOpportunities();
    });

    console.log('Notification scheduler initialized');
  }

  async sendDailyReminders(): Promise<void> {
    try {
      console.log('Sending daily lesson reminders...');
      
      // Get tomorrow's lessons
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStart = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());
      const tomorrowEnd = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate() + 1);

      const upcomingLessons = await this.db.all(`
        SELECT b.*, u.first_name, u.phone 
        FROM bookings b
        JOIN users u ON b.user_id = u.id
        WHERE b.lesson_date >= ? AND b.lesson_date < ?
        AND b.status IN ('confirmed', 'pending')
        AND u.phone IS NOT NULL AND u.phone != ''
      `, [tomorrowStart.toISOString(), tomorrowEnd.toISOString()]);

      console.log(`Found ${upcomingLessons.length} lessons for tomorrow`);

      for (const lesson of upcomingLessons) {
        try {
          await twilioService.sendLessonReminder(lesson, lesson);
          console.log(`Reminder sent for booking ${lesson.id}`);
        } catch (error) {
          console.error(`Failed to send reminder for booking ${lesson.id}:`, error);
        }
      }
    } catch (error) {
      console.error('Error sending daily reminders:', error);
    }
  }

  async sendMonthlyPaymentReminders(): Promise<void> {
    try {
      console.log('Sending monthly payment reminders...');
      
      const currentMonth = new Date().getMonth() + 1;
      const currentYear = new Date().getFullYear();

      const pendingBillingCycles = await this.db.all(`
        SELECT bc.*, u.first_name, u.phone 
        FROM billing_cycles bc
        JOIN users u ON bc.user_id = u.id
        WHERE bc.cycle_month = ? AND bc.cycle_year = ?
        AND bc.status = 'pending'
        AND u.phone IS NOT NULL AND u.phone != ''
      `, [currentMonth, currentYear]);

      console.log(`Found ${pendingBillingCycles.length} pending payments`);

      for (const cycle of pendingBillingCycles) {
        try {
          await twilioService.sendPaymentReminder(cycle, cycle);
          console.log(`Payment reminder sent for billing cycle ${cycle.id}`);
        } catch (error) {
          console.error(`Failed to send payment reminder for cycle ${cycle.id}:`, error);
        }
      }
    } catch (error) {
      console.error('Error sending payment reminders:', error);
    }
  }

  async checkOverduePayments(): Promise<void> {
    try {
      console.log('Checking for overdue payments...');
      
      const today = new Date().toISOString().split('T')[0];

      // Mark overdue billing cycles
      await this.db.run(`
        UPDATE billing_cycles 
        SET status = 'overdue' 
        WHERE due_date < ? AND status = 'pending'
      `, [today]);

      // Get newly overdue cycles
      const overdueCycles = await this.db.all(`
        SELECT bc.*, u.first_name, u.phone 
        FROM billing_cycles bc
        JOIN users u ON bc.user_id = u.id
        WHERE bc.status = 'overdue' AND bc.due_date = ?
        AND u.phone IS NOT NULL AND u.phone != ''
      `, [today]);

      for (const cycle of overdueCycles) {
        try {
          const overdueMessage = `Hi ${cycle.first_name}! Your voice lesson payment of $${cycle.total_amount} is now overdue. Please contact Patricia to arrange payment. Thank you!`;
          
          await twilioService.sendSMS({
            phone: cycle.phone,
            message: overdueMessage,
            type: 'payment'
          });
          
          console.log(`Overdue notice sent for billing cycle ${cycle.id}`);
        } catch (error) {
          console.error(`Failed to send overdue notice for cycle ${cycle.id}:`, error);
        }
      }
    } catch (error) {
      console.error('Error checking overdue payments:', error);
    }
  }

  async notifyMakeupOpportunities(): Promise<void> {
    try {
      console.log('Checking for makeup lesson opportunities...');
      
      // Get users with pending makeup lessons
      const usersWithPendingMakeups = await this.db.all(`
        SELECT DISTINCT u.id, u.first_name, u.phone
        FROM users u
        JOIN makeup_lessons ml ON u.id = ml.user_id
        WHERE ml.status = 'pending'
        AND u.phone IS NOT NULL AND u.phone != ''
      `);

      // Check if there are available Saturday sessions this month
      const currentMonth = new Date().getMonth() + 1;
      const currentYear = new Date().getFullYear();
      const firstDayOfMonth = new Date(currentYear, currentMonth - 1, 1);
      const lastDayOfMonth = new Date(currentYear, currentMonth, 0);

      const availableSessions = await this.db.all(`
        SELECT COUNT(*) as count FROM saturday_sessions
        WHERE session_date >= ? AND session_date <= ?
        AND status = 'available'
      `, [firstDayOfMonth.toISOString().split('T')[0], lastDayOfMonth.toISOString().split('T')[0]]);

      if (availableSessions[0].count > 0) {
        for (const user of usersWithPendingMakeups) {
          try {
            await twilioService.sendMakeupAvailableNotice(user);
            console.log(`Makeup opportunity notice sent to user ${user.id}`);
          } catch (error) {
            console.error(`Failed to send makeup notice to user ${user.id}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('Error checking makeup opportunities:', error);
    }
  }

  // Manual trigger methods for admin use
  async triggerDailyReminders(): Promise<void> {
    await this.sendDailyReminders();
  }

  async triggerPaymentReminders(): Promise<void> {
    await this.sendMonthlyPaymentReminders();
  }

  async triggerOverdueCheck(): Promise<void> {
    await this.checkOverduePayments();
  }

  async sendCustomNotification(userId: number, message: string, type: string): Promise<boolean> {
    try {
      const user = await this.db.get(`
        SELECT first_name, phone FROM users WHERE id = ?
      `, [userId]);

      if (!user || !user.phone) {
        console.error('User not found or no phone number');
        return false;
      }

      return await twilioService.sendSMS({
        phone: user.phone,
        message,
        type: type as any
      });
    } catch (error) {
      console.error('Error sending custom notification:', error);
      return false;
    }
  }

  // Generate automatic lesson confirmations when bookings are created
  async sendBookingConfirmation(bookingId: number): Promise<void> {
    try {
      const booking = await this.db.get(`
        SELECT b.*, u.first_name, u.phone 
        FROM bookings b
        JOIN users u ON b.user_id = u.id
        WHERE b.id = ?
      `, [bookingId]);

      if (booking && booking.phone) {
        await twilioService.sendBookingConfirmation(booking, booking);
      }
    } catch (error) {
      console.error('Error sending booking confirmation:', error);
    }
  }

  // Send cancellation notices
  async sendCancellationNotice(bookingId: number, reason?: string): Promise<void> {
    try {
      const booking = await this.db.get(`
        SELECT b.*, u.first_name, u.phone 
        FROM bookings b
        JOIN users u ON b.user_id = u.id
        WHERE b.id = ?
      `, [bookingId]);

      if (booking && booking.phone) {
        await twilioService.sendCancellationNotice(booking, booking, reason);
      }
    } catch (error) {
      console.error('Error sending cancellation notice:', error);
    }
  }
}

export const schedulerService = new SchedulerService();