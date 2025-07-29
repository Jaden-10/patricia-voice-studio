const { initDatabase, getDatabase } = require('./dist/models/database');

async function disableEmailVerification() {
  try {
    console.log('🔧 DISABLING EMAIL VERIFICATION FOR ALL USERS');
    console.log('==============================================');
    
    // Initialize database
    await initDatabase();
    const db = getDatabase();
    
    // Update all users to be verified
    const result = await db.run('UPDATE users SET is_verified = 1');
    console.log(`✅ Updated ${result.changes} users to verified status`);
    
    // Check admin user specifically
    const adminUser = await db.get(
      'SELECT id, email, is_verified FROM users WHERE email = ?',
      ['patricia@songbirdvoicestudio.com']
    );
    
    if (adminUser) {
      console.log('✅ Admin user status:');
      console.log(`   Email: ${adminUser.email}`);
      console.log(`   Verified: ${adminUser.is_verified ? 'YES' : 'NO'}`);
    } else {
      console.log('❌ Admin user not found');
    }
    
    // Check all users verification status
    const allUsers = await db.all('SELECT email, is_verified FROM users');
    console.log('\n📊 All Users Verification Status:');
    allUsers.forEach(user => {
      console.log(`   ${user.email}: ${user.is_verified ? 'VERIFIED' : 'NOT VERIFIED'}`);
    });
    
    console.log('\n✅ Email verification disabled successfully!');
    console.log('Admin can now login without verification.');
    
  } catch (error) {
    console.error('❌ Failed to disable email verification:', error);
  }
}

disableEmailVerification();