import cron from 'node-cron';
import { googleCalendarService } from './googleCalendar';
import { getDatabase } from '../models/database';

class CalendarSyncService {
  private isRunning: boolean = false;
  private syncInterval: NodeJS.Timeout | null = null;

  /**
   * Start the background sync service
   */
  start(): void {
    if (this.isRunning) {
      console.log('Calendar sync service is already running');
      return;
    }

    console.log('Starting Google Calendar sync service...');
    
    // Run sync every 15 minutes
    this.syncInterval = setInterval(async () => {
      await this.performSync();
    }, 15 * 60 * 1000);

    // Also schedule daily full sync at 2 AM
    cron.schedule('0 2 * * *', async () => {
      console.log('Running daily full calendar sync...');
      await this.performFullSync();
    });

    this.isRunning = true;
    console.log('✅ Calendar sync service started');

    // Run initial sync
    setTimeout(() => {
      this.performSync();
    }, 10000); // Wait 10 seconds after startup
  }

  /**
   * Stop the background sync service
   */
  stop(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    this.isRunning = false;
    console.log('Calendar sync service stopped');
  }

  /**
   * Perform incremental sync for recent bookings
   */
  private async performSync(): Promise<void> {
    try {
      const syncEnabled = await googleCalendarService.isCalendarSyncEnabled();
      if (!syncEnabled) {
        return; // Skip sync if disabled
      }

      const db = getDatabase();

      // Sync bookings without Google Calendar events (created in last 24 hours)
      const unsyncedBookings = await db.all(`
        SELECT b.*, u.first_name, u.last_name, u.email
        FROM bookings b
        JOIN users u ON b.user_id = u.id
        WHERE b.google_calendar_event_id IS NULL 
        AND b.status IN ('confirmed', 'pending')
        AND b.lesson_date > datetime('now')
        AND b.created_at > datetime('now', '-24 hours')
        LIMIT 10
      `);

      let syncCount = 0;
      for (const booking of unsyncedBookings) {
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
            await db.run(
              'UPDATE bookings SET google_calendar_event_id = ? WHERE id = ?',
              [googleEventId, booking.id]
            );

            await db.run(
              'INSERT INTO calendar_sync_log (action, booking_id, google_event_id, status) VALUES (?, ?, ?, ?)',
              ['sync_create', booking.id, googleEventId, 'success']
            );

            syncCount++;
          }
        } catch (error) {
          console.error(`Sync error for booking ${booking.id}:`, error);
          
          await db.run(
            'INSERT INTO calendar_sync_log (action, booking_id, status, error_message) VALUES (?, ?, ?, ?)',
            ['sync_create', booking.id, 'error', error.message]
          );
        }
      }

      if (syncCount > 0) {
        console.log(`✅ Background sync: ${syncCount} bookings synced to calendar`);
      }

    } catch (error) {
      console.error('Background sync error:', error);
    }
  }

  /**
   * Perform full sync (daily maintenance)
   */
  private async performFullSync(): Promise<void> {
    try {
      const syncEnabled = await googleCalendarService.isCalendarSyncEnabled();
      if (!syncEnabled) {
        return;
      }

      console.log('Starting full calendar sync...');
      const db = getDatabase();

      // Clean up old sync logs (keep last 30 days)
      await db.run(
        'DELETE FROM calendar_sync_log WHERE sync_time < datetime(\'now\', \'-30 days\')'
      );

      // Sync all unsynced future bookings
      const unsyncedBookings = await db.all(`
        SELECT b.*, u.first_name, u.last_name, u.email
        FROM bookings b
        JOIN users u ON b.user_id = u.id
        WHERE b.google_calendar_event_id IS NULL 
        AND b.status IN ('confirmed', 'pending')
        AND b.lesson_date > datetime('now')
        ORDER BY b.lesson_date ASC
        LIMIT 50
      `);

      let syncCount = 0;
      let errorCount = 0;

      for (const booking of unsyncedBookings) {
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
            await db.run(
              'UPDATE bookings SET google_calendar_event_id = ? WHERE id = ?',
              [googleEventId, booking.id]
            );

            await db.run(
              'INSERT INTO calendar_sync_log (action, booking_id, google_event_id, status) VALUES (?, ?, ?, ?)',
              ['full_sync', booking.id, googleEventId, 'success']
            );

            syncCount++;
          } else {
            errorCount++;
            await db.run(
              'INSERT INTO calendar_sync_log (action, booking_id, status, error_message) VALUES (?, ?, ?, ?)',
              ['full_sync', booking.id, 'error', 'Failed to create Google Calendar event']
            );
          }

          // Add small delay to respect API rate limits
          await new Promise(resolve => setTimeout(resolve, 500));

        } catch (error) {
          console.error(`Full sync error for booking ${booking.id}:`, error);
          errorCount++;
          
          await db.run(
            'INSERT INTO calendar_sync_log (action, booking_id, status, error_message) VALUES (?, ?, ?, ?)',
            ['full_sync', booking.id, 'error', error.message]
          );
        }
      }

      console.log(`✅ Full sync completed: ${syncCount} synced, ${errorCount} errors`);

    } catch (error) {
      console.error('Full sync error:', error);
    }
  }

  /**
   * Get sync service status
   */
  getStatus(): {
    isRunning: boolean;
    lastSync?: string;
  } {
    return {
      isRunning: this.isRunning
    };
  }
}

// Export singleton instance
export const calendarSyncService = new CalendarSyncService();