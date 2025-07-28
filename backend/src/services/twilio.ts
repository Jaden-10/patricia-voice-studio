import twilio from 'twilio';
import { getDatabase } from '../models/database';

interface SMSNotification {
  phone: string;
  message: string;
  booking_id?: number;
  type: 'reminder' | 'confirmation' | 'cancellation' | 'payment';
}

class TwilioService {
  private client: twilio.Twilio | null = null;
  private fromPhone: string;

  constructor() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    this.fromPhone = process.env.TWILIO_PHONE_NUMBER || '';

    if (accountSid && authToken && this.fromPhone) {
      this.client = twilio(accountSid, authToken);
    } else {
      console.warn('Twilio credentials not configured. SMS notifications will be disabled.');
    }
  }

  async sendSMS(notification: SMSNotification): Promise<boolean> {
    if (!this.client) {
      console.warn('Twilio not configured, skipping SMS:', notification.message);
      return false;
    }

    try {
      // Clean phone number (remove any formatting)
      const cleanPhone = notification.phone.replace(/\D/g, '');
      const formattedPhone = cleanPhone.startsWith('1') ? `+${cleanPhone}` : `+1${cleanPhone}`;

      const message = await this.client.messages.create({
        body: notification.message,
        from: this.fromPhone,
        to: formattedPhone
      });

      console.log(`SMS sent successfully: ${message.sid}`);

      // Log notification in database
      await this.logNotification(notification, true, message.sid);
      
      return true;
    } catch (error) {
      console.error('Failed to send SMS:', error);
      
      // Log failed notification
      await this.logNotification(notification, false, null, error.message);
      
      return false;
    }
  }

  private async logNotification(
    notification: SMSNotification,
    success: boolean,
    messageId?: string,
    error?: string
  ): Promise<void> {
    try {
      const db = getDatabase();
      await db.run(`
        INSERT INTO notifications (
          user_id, booking_id, title, message, type, 
          sms_sent, sent_at, scheduled_for
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        0, // Will need to get user_id from booking if booking_id provided
        notification.booking_id || null,
        `SMS ${notification.type}`,
        notification.message,
        notification.type,
        success,
        success ? new Date().toISOString() : null,
        new Date().toISOString()
      ]);
    } catch (dbError) {
      console.error('Failed to log notification:', dbError);
    }
  }

  async sendLessonReminder(booking: any, user: any): Promise<boolean> {
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

    const message = `Hi ${user.first_name}! Reminder: You have a ${booking.duration}-minute voice lesson tomorrow at ${formattedTime} with Patricia at Songbird Voice Studio. See you soon! 🎵`;

    return await this.sendSMS({
      phone: user.phone,
      message,
      booking_id: booking.id,
      type: 'reminder'
    });
  }

  async sendBookingConfirmation(booking: any, user: any): Promise<boolean> {
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

    const message = `Hi ${user.first_name}! Your voice lesson is confirmed for ${formattedDate} at ${formattedTime}. Patricia is looking forward to working with you! 🎤`;

    return await this.sendSMS({
      phone: user.phone,
      message,
      booking_id: booking.id,
      type: 'confirmation'
    });
  }

  async sendCancellationNotice(booking: any, user: any, reason?: string): Promise<boolean> {
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

    let message = `Hi ${user.first_name}, your voice lesson scheduled for ${formattedDate} at ${formattedTime} has been cancelled.`;
    
    if (reason) {
      message += ` Reason: ${reason}`;
    }
    
    message += ' Please contact Patricia to reschedule. Thank you!';

    return await this.sendSMS({
      phone: user.phone,
      message,
      booking_id: booking.id,
      type: 'cancellation'
    });
  }

  async sendPaymentReminder(billingCycle: any, user: any): Promise<boolean> {
    const dueDate = new Date(billingCycle.due_date);
    const formattedDate = dueDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const message = `Hi ${user.first_name}! Your monthly voice lesson payment of $${billingCycle.total_amount} is due on ${formattedDate}. You can pay via Venmo or Zelle. Thank you! 💳`;

    return await this.sendSMS({
      phone: user.phone,
      message,
      type: 'payment'
    });
  }

  async sendMakeupAvailableNotice(user: any): Promise<boolean> {
    const message = `Hi ${user.first_name}! A Saturday make-up session is available this month. Log into your account to view available times and schedule your make-up lesson. 📅`;

    return await this.sendSMS({
      phone: user.phone,
      message,
      type: 'reminder'
    });
  }
}

export const twilioService = new TwilioService();