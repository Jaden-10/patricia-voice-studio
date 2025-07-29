import bcrypt from 'bcryptjs';
import { getDatabase, initDatabase, createTables } from '../models/database';

const seedDatabase = async (): Promise<void> => {
  try {
    console.log('Initializing database...');
    await initDatabase();
    await createTables();

    const db = getDatabase();

    // Check if admin user already exists
    const existingAdmin = await db.get('SELECT id FROM users WHERE email = ? AND role = ?', ['patricia@songbirdvoicestudio.com', 'admin']);
    
    if (!existingAdmin) {
      console.log('Creating admin user...');
      
      // Create admin user (Patricia) with exact credentials needed
      const adminPassword = 'admin123'; // Default password - should be changed
      const hashedPassword = await bcrypt.hash(adminPassword, 12);
      
      const adminResult = await db.run(
        `INSERT INTO users (email, password_hash, first_name, last_name, phone, role, is_verified) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          'patricia@songbirdvoicestudio.com',
          hashedPassword,
          'Patricia',
          'Freund',
          '(858) 539-5946',
          'admin',
          1  // Force verified as integer
        ]
      );

      if (adminResult && adminResult.lastID) {
        console.log('✅ Admin user created successfully:');
        console.log('   ID:', adminResult.lastID);
        console.log('   Email: patricia@songbirdvoicestudio.com');
        console.log('   Password: admin123');
        console.log('   Role: admin');
        console.log('   IMPORTANT: Change this password after first login!');
      } else {
        throw new Error('Failed to create admin user');
      }
    } else {
      console.log('✅ Admin user already exists:', existingAdmin.id);
    }

    // Check if demo client exists
    const existingClient = await db.get('SELECT id FROM users WHERE email = \'demo@example.com\'');
    
    if (!existingClient) {
      console.log('Creating demo client...');
      
      const clientPassword = 'demo123';
      const hashedClientPassword = await bcrypt.hash(clientPassword, 12);
      
      const clientResult = await db.run(
        `INSERT INTO users (email, password_hash, first_name, last_name, phone, role, is_verified) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          'demo@example.com',
          hashedClientPassword,
          'Demo',
          'Client',
          '+1987654321',
          'client',
          1  // Force verified as integer
        ]
      );

      // Create sample booking for demo client
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7); // One week from now
      futureDate.setHours(14, 0, 0, 0); // 2 PM

      await db.run(
        `INSERT INTO bookings (user_id, lesson_date, duration, price, status, notes) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          clientResult.lastID,
          futureDate.toISOString(),
          60,
          85.00,
          'confirmed',
          'Demo lesson for testing purposes'
        ]
      );

      console.log('Demo client created:');
      console.log('Email: demo@example.com');
      console.log('Password: demo123');
    }

    // Update default settings if needed
    const settings = [
      ['business_hours_start', '09:00', 'Business hours start time'],
      ['business_hours_end', '18:00', 'Business hours end time'],
      ['booking_advance_hours', '24', 'Minimum hours in advance for booking'],
      ['lesson_45_price', '70.00', 'Price for 45-minute lesson'],
      ['lesson_60_price', '85.00', 'Price for 60-minute lesson'],
      ['max_reschedules_per_month', '2', 'Maximum reschedules allowed per month'],
      ['reminder_24h_enabled', 'true', 'Enable 24-hour reminder notifications'],
      ['reminder_2h_enabled', 'true', 'Enable 2-hour reminder notifications'],
      ['venmo_username', 'patricia-freund', 'Venmo username for payments'],
      ['zelle_email', 'patricia@songbirdvoicestudio.com', 'Zelle email for payments']
    ];

    for (const [key, value, description] of settings) {
      await db.run(
        'INSERT OR IGNORE INTO settings (key, value, description) VALUES (?, ?, ?)',
        [key, value, description]
      );
    }

    // URGENT: Mark all existing users as verified to disable email verification
    console.log('Marking all existing users as verified...');
    await db.run('UPDATE users SET is_verified = 1 WHERE is_verified IS NULL OR is_verified = 0');
    console.log('✅ All users marked as verified');

    console.log('Database seeding completed successfully!');

  } catch (error) {
    console.error('Database seeding failed:', error);
    throw error;
  }
};

// Run seeding if this file is executed directly
if (require.main === module) {
  seedDatabase()
    .then(() => {
      console.log('Seeding completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Seeding failed:', error);
      process.exit(1);
    });
}

export { seedDatabase };