import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getDatabase } from '../models/database';
import { CreateUserData, LoginData, AuthResponse, ApiResponse } from '../types';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { sendEmail } from '../services/email';

const router = express.Router();

// Register new user
router.post('/register', async (req, res) => {
  try {
    const { email, password, first_name, last_name, phone }: CreateUserData = req.body;

    // Validation
    if (!email || !password || !first_name || !last_name) {
      res.status(400).json({ 
        success: false, 
        message: 'Email, password, first name, and last name are required' 
      });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ 
        success: false, 
        message: 'Password must be at least 8 characters long' 
      });
      return;
    }

    const db = getDatabase();

    // Check if user already exists
    const existingUser = await db.get('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUser) {
      res.status(400).json({ 
        success: false, 
        message: 'User with this email already exists' 
      });
      return;
    }

    // Hash password
    const saltRounds = 12;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // Generate verification token
    const verification_token = crypto.randomBytes(32).toString('hex');

    // Insert user
const result = await db.run(`
    INSERT INTO users (email, password_hash, first_name, last_name, phone, 
    verification_token)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [email, password_hash, first_name, last_name, phone,
  verification_token]);

  if (!result || typeof result.lastID === 'undefined') {
    console.error('Database insert failed:', result);
    return res.status(500).json({
      success: false,
      message: 'Failed to create user account'
    });
  }
const userId = result.lastID;

    // Send verification email
    try {
      await sendEmail({
        to: email,
        subject: 'Welcome to Songbird Voice Studio - Verify Your Email',
        html: `
          <h1>Welcome to Songbird Voice Studio!</h1>
          <p>Hi ${first_name},</p>
          <p>Thank you for registering with Songbird Voice Studio. Please verify your email address by clicking the link below:</p>
          <a href="${process.env.FRONTEND_URL}/verify-email?token=${verification_token}">Verify Email Address</a>
          <p>If you didn't create this account, please ignore this email.</p>
          <p>Best regards,<br>Patricia Freund<br>Songbird Voice Studio</p>
        `
      });
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
      // Don't fail registration if email fails
    }

    res.status(201).json({
      success: true,
      message: 'User registered successfully. Please check your email to verify your account.',
      data: { userId: result.lastID }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Registration failed' 
    });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    const { email, password }: LoginData = req.body;

    if (!email || !password) {
      res.status(400).json({ 
        success: false, 
        message: 'Email and password are required' 
      });
      return;
    }

    const db = getDatabase();
    const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);

    if (!user) {
      res.status(401).json({ 
        success: false, 
        message: 'Invalid email or password' 
      });
      return;
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      res.status(401).json({ 
        success: false, 
        message: 'Invalid email or password' 
      });
      return;
    }

    // Generate JWT token
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('JWT_SECRET not configured');
      res.status(500).json({ 
        success: false, 
        message: 'Server configuration error' 
      });
      return;
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      jwtSecret,
      { expiresIn: '7d' }
    );

    // Remove password from response
    const { password_hash, verification_token, reset_token, ...userResponse } = user;

    res.json({
      success: true,
      data: {
        user: userResponse,
        token
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Login failed' 
    });
  }
});

// Verify email
router.post('/verify-email', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      res.status(400).json({ 
        success: false, 
        message: 'Verification token is required' 
      });
      return;
    }

    const db = getDatabase();
    const user = await db.get('SELECT id FROM users WHERE verification_token = ?', [token]);

    if (!user) {
      res.status(400).json({ 
        success: false, 
        message: 'Invalid verification token' 
      });
      return;
    }

    await db.run(
      'UPDATE users SET is_verified = TRUE, verification_token = NULL WHERE id = ?',
      [user.id]
    );

    res.json({
      success: true,
      message: 'Email verified successfully'
    });

  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Email verification failed' 
    });
  }
});

// Request password reset
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ 
        success: false, 
        message: 'Email is required' 
      });
      return;
    }

    const db = getDatabase();
    const user = await db.get('SELECT id, email, first_name FROM users WHERE email = ?', [email]);

    if (!user) {
      // Don't reveal if email exists or not
      res.json({
        success: true,
        message: 'If an account with that email exists, a password reset link will be sent.'
      });
      return;
    }

    // Generate reset token
    const reset_token = crypto.randomBytes(32).toString('hex');
    const reset_token_expires = new Date(Date.now() + 3600000); // 1 hour from now

    await db.run(
      'UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?',
      [reset_token, reset_token_expires.toISOString(), user.id]
    );

    // Send password reset email
    try {
      await sendEmail({
        to: email,
        subject: 'Password Reset - Songbird Voice Studio',
        html: `
          <h1>Password Reset</h1>
          <p>Hi ${user.first_name},</p>
          <p>You requested a password reset for your Songbird Voice Studio account. Click the link below to reset your password:</p>
          <a href="${process.env.FRONTEND_URL}/reset-password?token=${reset_token}">Reset Password</a>
          <p>This link will expire in 1 hour.</p>
          <p>If you didn't request this password reset, please ignore this email.</p>
          <p>Best regards,<br>Patricia Freund<br>Songbird Voice Studio</p>
        `
      });
    } catch (emailError) {
      console.error('Failed to send password reset email:', emailError);
    }

    res.json({
      success: true,
      message: 'If an account with that email exists, a password reset link will be sent.'
    });

  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Password reset request failed' 
    });
  }
});

// Reset password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      res.status(400).json({ 
        success: false, 
        message: 'Token and password are required' 
      });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ 
        success: false, 
        message: 'Password must be at least 8 characters long' 
      });
      return;
    }

    const db = getDatabase();
    const user = await db.get(
      'SELECT id FROM users WHERE reset_token = ? AND reset_token_expires > CURRENT_TIMESTAMP',
      [token]
    );

    if (!user) {
      res.status(400).json({ 
        success: false, 
        message: 'Invalid or expired reset token' 
      });
      return;
    }

    // Hash new password
    const saltRounds = 12;
    const password_hash = await bcrypt.hash(password, saltRounds);

    await db.run(
      'UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?',
      [password_hash, user.id]
    );

    res.json({
      success: true,
      message: 'Password reset successfully'
    });

  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Password reset failed' 
    });
  }
});

// Get current user
router.get('/me', authenticateToken, async (req: AuthenticatedRequest, res) => {
  res.json({
    success: true,
    data: { user: req.user }
  });
});

// Refresh token
router.post('/refresh', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      res.status(500).json({ 
        success: false, 
        message: 'Server configuration error' 
      });
      return;
    }

    const token = jwt.sign(
      { userId: req.user!.id, email: req.user!.email, role: req.user!.role },
      jwtSecret,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      data: { token }
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Token refresh failed' 
    });
  }
});

export { router as authRoutes };
