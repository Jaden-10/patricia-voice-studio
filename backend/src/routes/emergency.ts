import express from 'express';
import bcrypt from 'bcryptjs';
import { getDatabase } from '../models/database';

const router = express.Router();

// Emergency admin creation endpoint (only works if no admin exists)
router.post('/create-admin', async (req, res) => {
  try {
    const db = getDatabase();
    
    // Check if any admin user already exists
    const existingAdmin = await db.get('SELECT id FROM users WHERE role = ?', ['admin']);
    
    if (existingAdmin) {
      return res.status(400).json({
        success: false,
        error: 'Admin user already exists. This endpoint is only for emergency admin creation.'
      });
    }
    
    // Create admin user with default credentials
    const adminPassword = 'admin123';
    const hashedPassword = await bcrypt.hash(adminPassword, 12);
    
    const result = await db.run(`
      INSERT INTO users (email, password_hash, first_name, last_name, phone, role, is_verified)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      'patricia@songbirdvoicestudio.com',
      hashedPassword,
      'Patricia',
      'Freund',
      '(858) 539-5946',
      'admin',
      1  // Force verified as integer
    ]);
    
    if (!result || typeof result.lastID !== 'number' || result.lastID <= 0) {
      throw new Error('Failed to create admin user');
    }
    
    res.json({
      success: true,
      message: 'Emergency admin user created successfully',
      admin: {
        id: result.lastID,
        email: 'patricia@songbirdvoicestudio.com',
        role: 'admin'
      },
      credentials: {
        email: 'patricia@songbirdvoicestudio.com',
        password: 'admin123'
      }
    });
    
  } catch (error) {
    console.error('Emergency admin creation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create emergency admin user'
    });
  }
});

export default router;