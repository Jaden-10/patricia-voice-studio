import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { getDatabase } from '../models/database';
import { addMinutes, format, parseISO } from 'date-fns';

interface CalendarEvent {
  id: string;
  summary: string;
  start: {
    dateTime: string;
    timeZone?: string;
  };
  end: {
    dateTime: string;
    timeZone?: string;
  };
  status: string;
}

interface AvailabilitySlot {
  start: string;
  end: string;
  available: boolean;
}

interface BookingDetails {
  id: number;
  user_id: number;
  lesson_date: string;
  duration: number;
  client_name: string;
  client_email: string;
  notes?: string;
}

class GoogleCalendarService {
  private oauth2Client: OAuth2Client;
  private calendar: any;
  private isInitialized: boolean = false;

  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/calendar/auth/callback'
    );

    this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
  }

  /**
   * Initialize the service with stored credentials
   */
  async initialize(): Promise<boolean> {
    try {
      const db = getDatabase();
      
      // Get stored Google credentials for admin user
      const credentials = await db.get(
        'SELECT google_access_token, google_refresh_token, google_token_expiry FROM users WHERE role = ? AND google_access_token IS NOT NULL',
        ['admin']
      );

      if (!credentials) {
        console.log('No Google Calendar credentials found. Admin needs to authenticate.');
        return false;
      }

      // Set credentials
      this.oauth2Client.setCredentials({
        access_token: credentials.google_access_token,
        refresh_token: credentials.google_refresh_token,
        expiry_date: credentials.google_token_expiry
      });

      // Test the connection
      await this.calendar.calendarList.list();
      this.isInitialized = true;
      console.log('✅ Google Calendar service initialized successfully');
      return true;

    } catch (error) {
      console.error('❌ Failed to initialize Google Calendar service:', error);
      
      // Try to refresh token if it expired
      if (error.code === 401) {
        return await this.refreshAccessToken();
      }
      
      return false;
    }
  }

  /**
   * Generate OAuth URL for admin authentication
   */
  getAuthUrl(): string {
    const scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events'
    ];

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent'
    });
  }

  /**
   * Handle OAuth callback and store credentials
   */
  async handleAuthCallback(code: string): Promise<boolean> {
    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      this.oauth2Client.setCredentials(tokens);

      // Store credentials in database
      const db = getDatabase();
      await db.run(
        `UPDATE users SET 
         google_access_token = ?, 
         google_refresh_token = ?, 
         google_token_expiry = ?,
         calendar_sync_enabled = 1,
         updated_at = CURRENT_TIMESTAMP
         WHERE role = 'admin'`,
        [
          tokens.access_token,
          tokens.refresh_token,
          tokens.expiry_date
        ]
      );

      this.isInitialized = true;
      console.log('✅ Google Calendar authentication successful');
      return true;

    } catch (error) {
      console.error('❌ Google Calendar authentication failed:', error);
      return false;
    }
  }

  /**
   * Refresh access token when expired
   */
  private async refreshAccessToken(): Promise<boolean> {
    try {
      const { credentials } = await this.oauth2Client.refreshAccessToken();
      this.oauth2Client.setCredentials(credentials);

      // Update stored credentials
      const db = getDatabase();
      await db.run(
        `UPDATE users SET 
         google_access_token = ?, 
         google_token_expiry = ?,
         updated_at = CURRENT_TIMESTAMP
         WHERE role = 'admin'`,
        [credentials.access_token, credentials.expiry_date]
      );

      this.isInitialized = true;
      console.log('✅ Google Calendar token refreshed successfully');
      return true;

    } catch (error) {
      console.error('❌ Failed to refresh Google Calendar token:', error);
      return false;
    }
  }

  /**
   * Get busy times from Google Calendar
   */
  async getBusyTimes(startDate: string, endDate: string): Promise<{ start: string; end: string }[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.isInitialized) {
      console.warn('Google Calendar not initialized, returning empty busy times');
      return [];
    }

    try {
      const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
      
      const response = await this.calendar.events.list({
        calendarId,
        timeMin: startDate,
        timeMax: endDate,
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 250
      });

      const busyTimes = response.data.items
        .filter((event: any) => event.status !== 'cancelled' && event.start?.dateTime)
        .map((event: any) => ({
          start: event.start.dateTime,
          end: event.end.dateTime
        }));

      console.log(`Found ${busyTimes.length} busy periods in Google Calendar`);
      return busyTimes;

    } catch (error) {
      console.error('Error fetching Google Calendar busy times:', error);
      
      // Try to refresh token and retry once
      if (error.code === 401 && await this.refreshAccessToken()) {
        return await this.getBusyTimes(startDate, endDate);
      }
      
      return [];
    }
  }

  /**
   * Create a booking event in Google Calendar
   */
  async createBookingEvent(booking: BookingDetails): Promise<string | null> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.isInitialized) {
      console.warn('Google Calendar not initialized, skipping event creation');
      return null;
    }

    try {
      const startTime = parseISO(booking.lesson_date);
      const endTime = addMinutes(startTime, booking.duration);
      const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';

      const event = {
        summary: `Voice Lesson - ${booking.client_name}`,
        description: `Voice lesson with ${booking.client_name}\n\nDuration: ${booking.duration} minutes\nClient Email: ${booking.client_email}\n\nNotes: ${booking.notes || 'None'}\n\nBooked via Songbird Voice Studio Website`,
        start: {
          dateTime: startTime.toISOString(),
          timeZone: 'America/Los_Angeles'
        },
        end: {
          dateTime: endTime.toISOString(),
          timeZone: 'America/Los_Angeles'
        },
        attendees: [
          {
            email: booking.client_email,
            displayName: booking.client_name
          }
        ],
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 }, // 24 hours
            { method: 'email', minutes: 60 }       // 1 hour
          ]
        }
      };

      const response = await this.calendar.events.insert({
        calendarId,
        resource: event,
        sendUpdates: 'all'
      });

      console.log(`✅ Created Google Calendar event: ${response.data.id}`);
      return response.data.id;

    } catch (error) {
      console.error('❌ Failed to create Google Calendar event:', error);
      
      // Try to refresh token and retry once  
      if (error.code === 401 && await this.refreshAccessToken()) {
        return await this.createBookingEvent(booking);
      }
      
      return null;
    }
  }

  /**
   * Update a booking event in Google Calendar
   */
  async updateBookingEvent(googleEventId: string, booking: BookingDetails): Promise<boolean> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.isInitialized || !googleEventId) {
      console.warn('Google Calendar not initialized or no event ID, skipping event update');
      return false;
    }

    try {
      const startTime = parseISO(booking.lesson_date);
      const endTime = addMinutes(startTime, booking.duration);
      const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';

      const event = {
        summary: `Voice Lesson - ${booking.client_name}`,
        description: `Voice lesson with ${booking.client_name}\n\nDuration: ${booking.duration} minutes\nClient Email: ${booking.client_email}\n\nNotes: ${booking.notes || 'None'}\n\nBooked via Songbird Voice Studio Website`,
        start: {
          dateTime: startTime.toISOString(),
          timeZone: 'America/Los_Angeles'
        },
        end: {
          dateTime: endTime.toISOString(),
          timeZone: 'America/Los_Angeles'
        },
        attendees: [
          {
            email: booking.client_email,
            displayName: booking.client_name
          }
        ]
      };

      await this.calendar.events.update({
        calendarId,
        eventId: googleEventId,
        resource: event,
        sendUpdates: 'all'
      });

      console.log(`✅ Updated Google Calendar event: ${googleEventId}`);
      return true;

    } catch (error) {
      console.error('❌ Failed to update Google Calendar event:', error);
      
      // Try to refresh token and retry once
      if (error.code === 401 && await this.refreshAccessToken()) {
        return await this.updateBookingEvent(googleEventId, booking);
      }
      
      return false;
    }
  }

  /**
   * Delete a booking event from Google Calendar
   */
  async deleteBookingEvent(googleEventId: string): Promise<boolean> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.isInitialized || !googleEventId) {
      console.warn('Google Calendar not initialized or no event ID, skipping event deletion');
      return false;
    }

    try {
      const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';

      await this.calendar.events.delete({
        calendarId,
        eventId: googleEventId,
        sendUpdates: 'all'
      });

      console.log(`✅ Deleted Google Calendar event: ${googleEventId}`);
      return true;

    } catch (error) {
      console.error('❌ Failed to delete Google Calendar event:', error);
      
      // Try to refresh token and retry once
      if (error.code === 401 && await this.refreshAccessToken()) {
        return await this.deleteBookingEvent(googleEventId);
      }
      
      return false;
    }
  }

  /**
   * Check if calendar sync is enabled
   */
  async isCalendarSyncEnabled(): Promise<boolean> {
    try {
      const db = getDatabase();
      
      const result = await db.get(
        'SELECT calendar_sync_enabled FROM users WHERE role = ?',
        ['admin']
      );

      return result?.calendar_sync_enabled === 1;

    } catch (error) {
      console.error('Error checking calendar sync status:', error);
      return false;
    }
  }

  /**
   * Generate available time slots considering Google Calendar busy times
   */
  async getAvailableSlots(date: string, duration: number): Promise<AvailabilitySlot[]> {
    try {
      // Get business hours from settings
      const db = getDatabase();
      const startHour = await db.get('SELECT value FROM settings WHERE key = ?', ['business_hours_start']);
      const endHour = await db.get('SELECT value FROM settings WHERE key = ?', ['business_hours_end']);

      const businessStart = startHour?.value || '09:00';
      const businessEnd = endHour?.value || '18:00';

      // Generate all possible slots for the day
      const dayStart = new Date(`${date}T${businessStart}:00`);
      const dayEnd = new Date(`${date}T${businessEnd}:00`);
      
      const slots: AvailabilitySlot[] = [];
      let currentTime = dayStart;

      while (currentTime < dayEnd) {
        const slotEnd = addMinutes(currentTime, duration);
        
        if (slotEnd <= dayEnd) {
          slots.push({
            start: currentTime.toISOString(),
            end: slotEnd.toISOString(),
            available: true
          });
        }
        
        currentTime = addMinutes(currentTime, 30); // 30-minute intervals
      }

      // Get busy times from Google Calendar
      const busyTimes = await this.getBusyTimes(
        dayStart.toISOString(),
        dayEnd.toISOString()
      );

      // Mark slots as unavailable if they conflict with busy times
      for (const slot of slots) {
        const slotStart = new Date(slot.start);
        const slotEnd = new Date(slot.end);

        for (const busy of busyTimes) {
          const busyStart = new Date(busy.start);
          const busyEnd = new Date(busy.end);

          // Check for overlap
          if (slotStart < busyEnd && slotEnd > busyStart) {
            slot.available = false;
            break;
          }
        }
      }

      // Also check against existing bookings in database
      const existingBookings = await db.all(
        'SELECT lesson_date, duration FROM bookings WHERE DATE(lesson_date) = ? AND status IN (?, ?)',
        [date, 'confirmed', 'pending']
      );

      for (const slot of slots) {
        if (!slot.available) continue;

        const slotStart = new Date(slot.start);
        const slotEnd = new Date(slot.end);

        for (const booking of existingBookings) {
          const bookingStart = parseISO(booking.lesson_date);
          const bookingEnd = addMinutes(bookingStart, booking.duration);

          // Check for overlap
          if (slotStart < bookingEnd && slotEnd > bookingStart) {
            slot.available = false;
            break;
          }
        }
      }

      return slots.filter(slot => slot.available);

    } catch (error) {
      console.error('Error generating available slots:', error);
      return [];
    }
  }

  /**
   * Get sync status and statistics
   */
  async getSyncStatus(): Promise<{
    enabled: boolean;
    initialized: boolean;
    lastSync?: string;
    eventCount?: number;
    errors?: string[];
  }> {
    try {
      const db = getDatabase();
      
      const adminUser = await db.get(
        'SELECT calendar_sync_enabled, google_access_token FROM users WHERE role = ?',
        ['admin']
      );

      const eventCount = await db.get(
        'SELECT COUNT(*) as count FROM bookings WHERE google_calendar_event_id IS NOT NULL'
      );

      return {
        enabled: adminUser?.calendar_sync_enabled === 1,
        initialized: this.isInitialized && !!adminUser?.google_access_token,
        eventCount: eventCount?.count || 0
      };

    } catch (error) {
      console.error('Error getting sync status:', error);
      return {
        enabled: false,
        initialized: false
      };
    }
  }
}

// Export singleton instance
export const googleCalendarService = new GoogleCalendarService();