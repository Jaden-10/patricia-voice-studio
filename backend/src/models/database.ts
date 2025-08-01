import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import path from 'path';

export interface RunResult {
  lastID: number;
  changes: number;
}

export interface Database {
  run: (sql: string, params?: any[]) => Promise<RunResult>;
  get: (sql: string, params?: any[]) => Promise<any>;
  all: (sql: string, params?: any[]) => Promise<any[]>;
  close: () => Promise<void>;
}

let db: Database;

const getDatabasePath = (): string => {
  const dbPath = process.env.DATABASE_URL || path.join(__dirname, '../../data/voice_studio.db');
  return dbPath.replace('sqlite:', '');
};

export const initDatabase = async (): Promise<Database> => {
  return new Promise((resolve, reject) => {
    const dbPath = getDatabasePath();
    console.log(`Initializing database at: ${dbPath}`);
    
    // Ensure data directory exists
    const fs = require('fs');
    const dataDir = path.dirname(dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const database = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err);
        reject(err);
        return;
      }

      // Promisify database methods with proper handling for run method
      const dbWrapper: Database = {
        run: (sql: string, params?: any[]) => {
          return new Promise((resolve, reject) => {
            database.run(sql, params || [], function(err: Error | null) {
              if (err) {
                reject(err);
              } else {
                resolve({
                  lastID: this.lastID,
                  changes: this.changes
                });
              }
            });
          });
        },
        get: promisify(database.get.bind(database)),
        all: promisify(database.all.bind(database)),
        close: promisify(database.close.bind(database))
      };

      db = dbWrapper;
      resolve(dbWrapper);
    });
  });
};

export const createTables = async (): Promise<void> => {
  if (!db) {
    throw new Error('Database not initialized');
  }

  // Users table
  await db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      phone TEXT,
      role TEXT NOT NULL DEFAULT 'client',
      is_verified BOOLEAN DEFAULT FALSE,
      verification_token TEXT,
      reset_token TEXT,
      reset_token_expires DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Bookings table
  await db.run(`
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      lesson_date DATETIME NOT NULL,
      duration INTEGER NOT NULL DEFAULT 60,
      price DECIMAL(10,2) NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      payment_status TEXT DEFAULT 'pending',
      notes TEXT,
      reschedule_count INTEGER DEFAULT 0,
      original_date DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `);

  // Payments table
  await db.run(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      payment_method TEXT DEFAULT 'stripe',
      payment_reference TEXT,
      stripe_payment_intent_id TEXT,
      stripe_charge_id TEXT,
      refund_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      payment_date DATETIME,
      paid_at DATETIME,
      venmo_link TEXT,
      zelle_reference TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (booking_id) REFERENCES bookings (id) ON DELETE CASCADE
    )
  `);

  // Availability table
  await db.run(`
    CREATE TABLE IF NOT EXISTS availability (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date DATE NOT NULL,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      is_available BOOLEAN DEFAULT TRUE,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Messages table
  await db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      sender_id INTEGER NOT NULL,
      subject TEXT,
      message TEXT NOT NULL,
      is_read BOOLEAN DEFAULT FALSE,
      message_type TEXT DEFAULT 'general',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (sender_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `);

  // Notifications table
  await db.run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      booking_id INTEGER,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL,
      is_read BOOLEAN DEFAULT FALSE,
      scheduled_for DATETIME,
      sent_at DATETIME,
      sms_sent BOOLEAN DEFAULT FALSE,
      email_sent BOOLEAN DEFAULT FALSE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (booking_id) REFERENCES bookings (id) ON DELETE SET NULL
    )
  `);

  // Recurring bookings table - for weekly/bi-weekly schedules
  await db.run(`
    CREATE TABLE IF NOT EXISTS recurring_bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      duration INTEGER NOT NULL DEFAULT 60,
      price DECIMAL(10,2) NOT NULL,
      day_of_week INTEGER NOT NULL,
      time TIME NOT NULL,
      frequency TEXT NOT NULL DEFAULT 'weekly',
      start_date DATE NOT NULL,
      end_date DATE,
      status TEXT NOT NULL DEFAULT 'active',
      lesson_type TEXT NOT NULL DEFAULT 'regular',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `);

  // Billing cycles table - for monthly billing
  await db.run(`
    CREATE TABLE IF NOT EXISTS billing_cycles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      recurring_booking_id INTEGER NOT NULL,
      cycle_month INTEGER NOT NULL,
      cycle_year INTEGER NOT NULL,
      total_amount DECIMAL(10,2) NOT NULL,
      lessons_count INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      billing_date DATE NOT NULL,
      due_date DATE NOT NULL,
      paid_date DATE,
      payment_method TEXT,
      payment_reference TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (recurring_booking_id) REFERENCES recurring_bookings (id) ON DELETE CASCADE
    )
  `);

  // Make-up lessons table
  await db.run(`
    CREATE TABLE IF NOT EXISTS makeup_lessons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      original_booking_id INTEGER NOT NULL,
      makeup_date DATETIME,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (original_booking_id) REFERENCES bookings (id) ON DELETE CASCADE
    )
  `);

  // Blackout dates table
  await db.run(`
    CREATE TABLE IF NOT EXISTS blackout_dates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      reason TEXT NOT NULL,
      description TEXT,
      is_active BOOLEAN DEFAULT TRUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Saturday makeup sessions table
  await db.run(`
    CREATE TABLE IF NOT EXISTS saturday_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_date DATE NOT NULL,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      max_students INTEGER DEFAULT 4,
      current_students INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'available',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Update bookings table to support recurring patterns
  await db.run(`
    ALTER TABLE bookings ADD COLUMN recurring_booking_id INTEGER REFERENCES recurring_bookings(id)
  `).catch(() => {}); // Ignore error if column already exists

  await db.run(`
    ALTER TABLE bookings ADD COLUMN lesson_type TEXT DEFAULT 'regular'
  `).catch(() => {}); // Ignore error if column already exists

  await db.run(`
    ALTER TABLE bookings ADD COLUMN cancellation_reason TEXT
  `).catch(() => {}); // Ignore error if column already exists

  await db.run(`
    ALTER TABLE bookings ADD COLUMN cancelled_at DATETIME
  `).catch(() => {}); // Ignore error if column already exists

  await db.run(`
    ALTER TABLE bookings ADD COLUMN google_calendar_event_id TEXT
  `).catch(() => {}); // Ignore error if column already exists

  await db.run(`
    ALTER TABLE recurring_bookings ADD COLUMN google_calendar_event_id TEXT
  `).catch(() => {}); // Ignore error if column already exists

  // Add Google Calendar integration fields to users table
  await db.run(`
    ALTER TABLE users ADD COLUMN calendar_sync_enabled BOOLEAN DEFAULT 0
  `).catch(() => {}); // Ignore error if column already exists

  await db.run(`
    ALTER TABLE users ADD COLUMN google_access_token TEXT
  `).catch(() => {}); // Ignore error if column already exists

  await db.run(`
    ALTER TABLE users ADD COLUMN google_refresh_token TEXT
  `).catch(() => {}); // Ignore error if column already exists

  await db.run(`
    ALTER TABLE users ADD COLUMN google_token_expiry INTEGER
  `).catch(() => {}); // Ignore error if column already exists

  // Studio events table
  await db.run(`
    CREATE TABLE IF NOT EXISTS studio_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      event_date DATETIME NOT NULL,
      event_type TEXT NOT NULL,
      max_participants INTEGER,
      current_participants INTEGER DEFAULT 0,
      is_virtual BOOLEAN DEFAULT FALSE,
      virtual_link TEXT,
      location TEXT,
      status TEXT NOT NULL DEFAULT 'planned',
      registration_deadline DATETIME,
      cost DECIMAL(10,2),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Event participants table
  await db.run(`
    CREATE TABLE IF NOT EXISTS event_participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      attended BOOLEAN DEFAULT FALSE,
      FOREIGN KEY (event_id) REFERENCES studio_events (id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      UNIQUE(event_id, user_id)
    )
  `);

  // Virtual lesson options table
  await db.run(`
    CREATE TABLE IF NOT EXISTS virtual_lesson_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER,
      recurring_booking_id INTEGER,
      platform TEXT NOT NULL DEFAULT 'facetime',
      meeting_link TEXT,
      meeting_id TEXT,
      passcode TEXT,
      phone_number TEXT,
      backup_platform TEXT,
      backup_link TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (booking_id) REFERENCES bookings (id) ON DELETE CASCADE,
      FOREIGN KEY (recurring_booking_id) REFERENCES recurring_bookings (id) ON DELETE CASCADE
    )
  `);

  // Calendar sync log table for debugging
  await db.run(`
    CREATE TABLE IF NOT EXISTS calendar_sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      booking_id INTEGER,
      google_event_id TEXT,
      status TEXT NOT NULL,
      error_message TEXT,
      sync_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (booking_id) REFERENCES bookings (id) ON DELETE SET NULL
    )
  `);

  // Settings table
  await db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Insert default settings
  await db.run(`
    INSERT OR IGNORE INTO settings (key, value, description) VALUES
    ('business_hours_start', '09:00', 'Business hours start time'),
    ('business_hours_end', '18:00', 'Business hours end time'),
    ('booking_advance_hours', '24', 'Minimum hours in advance for booking'),
    ('lesson_30_price', '60.00', 'Price for 30-minute lesson'),
    ('lesson_45_price', '80.00', 'Price for 45-minute lesson'),
    ('lesson_60_price', '95.00', 'Price for 60-minute lesson'),
    ('audition_coaching_price', '95.00', 'Base price for audition coaching'),
    ('max_reschedules_per_month', '2', 'Maximum reschedules allowed per month'),
    ('max_pending_makeups', '2', 'Maximum pending make-up lessons'),
    ('cancellation_policy_hours', '24', '24-hour cancellation policy'),
    ('saturday_makeup_max_students', '4', 'Maximum students per Saturday makeup session'),
    ('academic_year_start', '2025-09-01', 'Academic year start date'),
    ('academic_year_end', '2026-06-30', 'Academic year end date'),
    ('reminder_24h_enabled', 'true', 'Enable 24-hour reminder notifications'),
    ('reminder_2h_enabled', 'true', 'Enable 2-hour reminder notifications'),
    ('monthly_billing', 'true', 'Enable monthly billing system'),
    ('venmo_username', 'patricia-freund', 'Venmo username for payments'),
    ('zelle_email', 'patricia@songbirdvoicestudio.com', 'Zelle email for payments'),
    ('studio_address', '5550 Carmel Mountain Road, Ste. 210, San Diego, CA 92130', 'Studio address'),
    ('studio_phone', '(858) 539-5946', 'Studio phone number'),
    ('studio_website', 'sandiegosongbirdstudio.com', 'Studio website')
  `);

  // Insert blackout dates for 2025-2026 academic year
  await db.run(`
    INSERT OR IGNORE INTO blackout_dates (start_date, end_date, reason, description) VALUES
    ('2025-09-22', '2025-09-22', 'Rosh Hashanah', 'After 5pm - Jewish holiday'),
    ('2025-10-02', '2025-10-02', 'Yom Kippur', 'Jewish holiday - full day'),
    ('2025-11-24', '2025-11-29', 'Thanksgiving Break', 'Thanksgiving week break'),
    ('2025-12-19', '2026-01-03', 'Winter Break', 'Winter holiday break'),
    ('2026-03-15', '2026-03-22', 'Spring Break', 'Spring break week'),
    ('2026-05-26', '2026-05-26', 'Memorial Day', 'Federal holiday'),
    ('2026-06-07', '2026-06-30', 'Studio Closure', 'End of academic year closure')
  `);

  // Insert default studio events for 2025-2026 academic year
  await db.run(`
    INSERT OR IGNORE INTO studio_events (name, description, event_date, event_type, max_participants, is_virtual, location, status, registration_deadline) VALUES
    ('Friday Night Lights Cabaret - Fall', 'Intimate cabaret performance showcasing student talents in a cozy, supportive environment', '2025-11-15 19:00:00', 'cabaret', 20, 0, 'Songbird Voice Studio', 'planned', '2025-11-08'),
    ('Holiday Video Production', 'Create professional holiday performance videos to share with family and friends', '2025-12-14 14:00:00', 'holiday_video', 15, 0, 'Songbird Voice Studio', 'planned', '2025-12-07'),
    ('Winter Masterclass Series', 'Advanced technique workshops with guest vocal coaches', '2026-01-11 15:00:00', 'masterclass', 12, 0, 'Songbird Voice Studio', 'planned', '2026-01-04'),
    ('Spring Recital Preparation Workshop', 'Intensive preparation for spring recital performances', '2026-03-07 14:00:00', 'workshop', 25, 0, 'Songbird Voice Studio', 'planned', '2026-02-28'),
    ('Friday Night Lights Cabaret - Spring', 'Spring semester cabaret featuring student growth and new repertoire', '2026-04-18 19:00:00', 'cabaret', 20, 0, 'Songbird Voice Studio', 'planned', '2026-04-11'),
    ('Spring Recital 2026', 'Annual spring recital celebrating student achievements and progress', '2026-05-16 18:00:00', 'recital', 50, 0, 'Community Performance Hall', 'planned', '2026-05-02')
  `);

  console.log('Database tables created successfully');
};

export const getDatabase = (): Database => {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
};

// Database will be initialized manually from server.ts