import { google } from 'googleapis';
import { getDatabase } from '../models/database';

interface CalendarEvent {
  id?: string;
  summary: string;
  description?: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  attendees?: Array<{
    email: string;
    displayName?: string;
  }>;
}

class GoogleCalendarService {
  private calendar: any = null;
  private db = getDatabase();
  private calendarId: string;

  constructor() {
    this.calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
    this.initializeCalendar();
  }

  private async initializeCalendar() {
    try {
      const credentials = process.env.GOOGLE_CALENDAR_CREDENTIALS;
      
      if (!credentials) {
        console.warn('Google Calendar credentials not configured. Calendar sync will be disabled.');
        return;
      }

      const auth = new google.auth.GoogleAuth({
        credentials: JSON.parse(credentials),
        scopes: ['https://www.googleapis.com/auth/calendar']
      });

      this.calendar = google.calendar({ version: 'v3', auth });
      console.log('Google Calendar integration initialized');
    } catch (error) {
      console.error('Failed to initialize Google Calendar:', error);
    }
  }

  async createRecurringLessonEvents(recurringBookingId: number): Promise<boolean> {
    if (!this.calendar) {
      console.warn('Google Calendar not initialized, skipping event creation');
      return false;
    }

    try {
      // Get recurring booking details
      const recurringBooking = await this.db.get(`
        SELECT rb.*, u.first_name, u.last_name, u.email
        FROM recurring_bookings rb
        JOIN users u ON rb.user_id = u.id
        WHERE rb.id = ?
      `, [recurringBookingId]);

      if (!recurringBooking) {
        console.error('Recurring booking not found');
        return false;
      }

      // Get blackout dates to exclude from recurring events
      const blackoutDates = await this.db.all(`
        SELECT start_date, end_date FROM blackout_dates 
        WHERE is_active = 1
      `);

      // Create recurring rule
      const frequency = recurringBooking.frequency === 'weekly' ? 'WEEKLY' : 'WEEKLY;INTERVAL=2';
      const dayOfWeek = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][recurringBooking.day_of_week];
      
      const startDate = new Date(recurringBooking.start_date);
      startDate.setHours(parseInt(recurringBooking.time.split(':')[0]));
      startDate.setMinutes(parseInt(recurringBooking.time.split(':')[1]));

      const endDate = new Date(startDate);
      endDate.setMinutes(endDate.getMinutes() + recurringBooking.duration);

      const endRecurrence = new Date(recurringBooking.end_date || '2026-06-30');

      const event: CalendarEvent = {
        summary: `Voice Lesson - ${recurringBooking.first_name} ${recurringBooking.last_name}`,
        description: `${recurringBooking.duration}-minute ${recurringBooking.lesson_type} lesson\nStudent: ${recurringBooking.first_name} ${recurringBooking.last_name}\nEmail: ${recurringBooking.email}`,
        start: {
          dateTime: startDate.toISOString(),
          timeZone: 'America/Los_Angeles'
        },
        end: {
          dateTime: endDate.toISOString(),
          timeZone: 'America/Los_Angeles'
        },
        attendees: [
          {
            email: recurringBooking.email,
            displayName: `${recurringBooking.first_name} ${recurringBooking.last_name}`
          }
        ],
        recurrence: [
          `RRULE:FREQ=${frequency};BYDAY=${dayOfWeek};UNTIL=${endRecurrence.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`
        ]
      };

      const response = await this.calendar.events.insert({
        calendarId: this.calendarId,
        resource: event,
        sendUpdates: 'all'
      });

      // Store the Google Calendar event ID
      await this.db.run(`
        UPDATE recurring_bookings 
        SET google_calendar_id = ? 
        WHERE id = ?
      `, [response.data.id, recurringBookingId]);

      console.log(`Created recurring calendar event: ${response.data.id}`);
      return true;

    } catch (error) {
      console.error('Error creating recurring calendar events:', error);
      return false;
    }
  }

  async createSingleLessonEvent(bookingId: number): Promise<boolean> {
    if (!this.calendar) {
      console.warn('Google Calendar not initialized, skipping event creation');
      return false;
    }

    try {
      // Get booking details
      const booking = await this.db.get(`
        SELECT b.*, u.first_name, u.last_name, u.email
        FROM bookings b
        JOIN users u ON b.user_id = u.id
        WHERE b.id = ?
      `, [bookingId]);

      if (!booking) {
        console.error('Booking not found');
        return false;
      }

      const startDate = new Date(booking.lesson_date);
      const endDate = new Date(startDate);
      endDate.setMinutes(endDate.getMinutes() + booking.duration);

      const event: CalendarEvent = {
        summary: `Voice Lesson - ${booking.first_name} ${booking.last_name}`,
        description: `${booking.duration}-minute ${booking.lesson_type || 'regular'} lesson\nStudent: ${booking.first_name} ${booking.last_name}\nEmail: ${booking.email}\nNotes: ${booking.notes || 'None'}`,
        start: {
          dateTime: startDate.toISOString(),
          timeZone: 'America/Los_Angeles'
        },
        end: {
          dateTime: endDate.toISOString(),
          timeZone: 'America/Los_Angeles'
        },
        attendees: [
          {
            email: booking.email,
            displayName: `${booking.first_name} ${booking.last_name}`
          }
        ]
      };

      const response = await this.calendar.events.insert({
        calendarId: this.calendarId,
        resource: event,
        sendUpdates: 'all'
      });

      // Store the Google Calendar event ID
      await this.db.run(`
        UPDATE bookings 
        SET google_calendar_id = ? 
        WHERE id = ?
      `, [response.data.id, bookingId]);

      console.log(`Created calendar event: ${response.data.id}`);
      return true;

    } catch (error) {
      console.error('Error creating calendar event:', error);
      return false;
    }
  }

  async updateCalendarEvent(bookingId: number): Promise<boolean> {
    if (!this.calendar) {
      return false;
    }

    try {
      // Get booking with calendar ID
      const booking = await this.db.get(`
        SELECT b.*, u.first_name, u.last_name, u.email
        FROM bookings b
        JOIN users u ON b.user_id = u.id
        WHERE b.id = ?
      `, [bookingId]);

      if (!booking || !booking.google_calendar_id) {
        console.warn('Booking not found or no calendar event ID');
        return false;
      }

      const startDate = new Date(booking.lesson_date);
      const endDate = new Date(startDate);
      endDate.setMinutes(endDate.getMinutes() + booking.duration);

      const updatedEvent = {
        summary: `Voice Lesson - ${booking.first_name} ${booking.last_name}`,
        description: `${booking.duration}-minute ${booking.lesson_type || 'regular'} lesson\nStudent: ${booking.first_name} ${booking.last_name}\nEmail: ${booking.email}\nNotes: ${booking.notes || 'None'}`,
        start: {
          dateTime: startDate.toISOString(),
          timeZone: 'America/Los_Angeles'
        },
        end: {
          dateTime: endDate.toISOString(),
          timeZone: 'America/Los_Angeles'
        }
      };

      await this.calendar.events.update({
        calendarId: this.calendarId,
        eventId: booking.google_calendar_id,
        resource: updatedEvent,
        sendUpdates: 'all'
      });

      console.log(`Updated calendar event: ${booking.google_calendar_id}`);
      return true;

    } catch (error) {
      console.error('Error updating calendar event:', error);
      return false;
    }
  }

  async deleteCalendarEvent(bookingId: number): Promise<boolean> {
    if (!this.calendar) {
      return false;
    }

    try {
      // Get calendar event ID
      const booking = await this.db.get(`
        SELECT google_calendar_id FROM bookings WHERE id = ?
      `, [bookingId]);

      if (!booking || !booking.google_calendar_id) {
        console.warn('No calendar event ID found for booking');
        return false;
      }

      await this.calendar.events.delete({
        calendarId: this.calendarId,
        eventId: booking.google_calendar_id,
        sendUpdates: 'all'
      });

      // Clear the calendar ID from database
      await this.db.run(`
        UPDATE bookings SET google_calendar_id = NULL WHERE id = ?
      `, [bookingId]);

      console.log(`Deleted calendar event: ${booking.google_calendar_id}`);
      return true;

    } catch (error) {
      console.error('Error deleting calendar event:', error);
      return false;
    }
  }

  async syncCalendarEvents(): Promise<void> {
    if (!this.calendar) {
      return;
    }

    try {
      console.log('Syncing calendar events...');

      // Get all confirmed bookings without calendar events
      const bookingsWithoutEvents = await this.db.all(`
        SELECT id FROM bookings 
        WHERE status = 'confirmed' 
        AND google_calendar_id IS NULL
        AND lesson_date > datetime('now')
      `);

      for (const booking of bookingsWithoutEvents) {
        await this.createSingleLessonEvent(booking.id);
      }

      console.log(`Synced ${bookingsWithoutEvents.length} calendar events`);

    } catch (error) {
      console.error('Error syncing calendar events:', error);
    }
  }
}

export const calendarService = new GoogleCalendarService();