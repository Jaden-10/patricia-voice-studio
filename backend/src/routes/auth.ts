import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import { getDatabase } from '../models/database';
import { sendEmail, emailTemplates } from '../services/email';

const router = express.Router();

// Rate limiting for auth endpoints - configured for Railway proxy
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting for local development
  skip: (req) => req.ip === '127.0.0.1' || req.ip === '::1'
});

// Register endpoint
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { email, password, first_name, last_name } = req.body;

    if (!email || !password || !first_name || !last_name) {
      return res.status(400).json({
        success: false,
        error: 'Email, password, first name, and last name are required'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters long'
      });
    }

    const db = getDatabase();

    // Check if user already exists
    const existingUser = await db.get('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'User with this email already exists'
      });
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Insert user with email automatically verified
    const result = await db.run(`
      INSERT INTO users (email, password_hash, first_name, last_name, role, is_verified)
      VALUES (?, ?, ?, ?, 'client', 1)
    `, [email, hashedPassword, first_name, last_name]);

    if (!result || typeof result.lastID !== 'number' || result.lastID <= 0) {
      console.error('Database insert failed. Result:', result);
      throw new Error('Failed to create user - database insert returned invalid result');
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: result.lastID, 
        email, 
        role: 'client' 
      },
      process.env.JWT_SECRET || 'fallback-secret-key',
      { expiresIn: '24h' }
    );

    // Send welcome email
    try {
      const welcomeTemplate = emailTemplates.welcomeEmail(`${first_name} ${last_name}`);
      await sendEmail({
        to: email,
        subject: welcomeTemplate.subject,
        html: welcomeTemplate.html
      });
      console.log(`✅ Welcome email sent to ${email}`);
    } catch (emailError: unknown) {
      const errorMessage = emailError instanceof Error ? emailError.message : String(emailError);
      console.error('Failed to send welcome email:', errorMessage);
      // Don't fail registration if email fails
    }

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: result.lastID,
          email,
          first_name,
          last_name,
          role: 'client'
        },
        token
      },
      message: 'User registered successfully'
    });

  } catch (error) {
    console.error('Registration error:', error);
    
    // Handle specific database errors
    if (error instanceof Error) {
      if (error.message.includes('UNIQUE constraint failed')) {
        return res.status(409).json({
          success: false,
          error: 'User with this email already exists'
        });
      }
      
      if (error.message.includes('database insert returned invalid result')) {
        return res.status(500).json({
          success: false,
          error: 'Database error: Failed to create user account'
        });
      }
    }
    
    res.status(500).json({
      success: false,
      error: 'Registration failed. Please try again.'
    });
  }
});

// Login endpoint
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    const db = getDatabase();

    // Find user
    const user = await db.get(
      'SELECT id, email, password_hash, first_name, last_name, role FROM users WHERE email = ?',
      [email]
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        role: user.role 
      },
      process.env.JWT_SECRET || 'fallback-secret-key',
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          role: user.role
        },
        token
      },
      message: 'Login successful'
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed'
    });
  }
});

// Get current user profile
router.get('/profile', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authorization token required'
      });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-key') as any;

    const db = getDatabase();
    const user = await db.get(
      'SELECT id, email, first_name, last_name, role FROM users WHERE id = ?',
      [decoded.id]
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      data: user
    });

  } catch (error) {
    console.error('Profile error:', error);
    res.status(401).json({
      success: false,
      error: 'Invalid token'
    });
  }
});

// Forgot password endpoint
router.post('/forgot-password', authLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email address is required'
      });
    }

    const db = getDatabase();

    // Check if user exists
    const user = await db.get('SELECT id, email, first_name, last_name FROM users WHERE email = ?', [email]);
    
    // Always return success to prevent email enumeration attacks
    if (!user) {
      return res.json({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.'
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    const resetTokenExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Store reset token in database
    await db.run(
      'UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?',
      [resetTokenHash, resetTokenExpiry.toISOString(), user.id]
    );

    // Send reset email
    const resetUrl = `${process.env.FRONTEND_URL || 'https://patricia-voice-studio.vercel.app'}/reset-password?token=${resetToken}`;
    
    const resetEmailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 10px;">
          Password Reset Request
        </h2>
        
        <p>Hi ${user.first_name},</p>
        
        <p>You requested a password reset for your Songbird Voice Studio account. Click the button below to reset your password:</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" 
             style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            Reset Password
          </a>
        </div>
        
        <p>This link will expire in 15 minutes for security reasons.</p>
        
        <p>If you didn't request this password reset, please ignore this email. Your password will remain unchanged.</p>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
          <p style="margin: 0; font-size: 14px; color: #6b7280;">
            If the button doesn't work, copy and paste this link into your browser:<br>
            <a href="${resetUrl}" style="color: #2563eb; word-break: break-all;">${resetUrl}</a>
          </p>
        </div>
        
        <div style="margin-top: 20px;">
          <p style="margin: 0; font-size: 14px; color: #6b7280;">
            Best regards,<br>
            <strong>Patricia Freund</strong><br>
            Songbird Voice Studio
          </p>
        </div>
      </div>
    `;

    await sendEmail({
      to: email,
      subject: 'Reset Your Password - Songbird Voice Studio',
      html: resetEmailHtml
    });

    console.log(`✅ Password reset email sent to ${email}`);

    res.json({
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent.'
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process password reset request'
    });
  }
});

// Reset password endpoint
router.post('/reset-password', authLimiter, async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        success: false,
        error: 'Token and new password are required'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters long'
      });
    }

    const db = getDatabase();

    // Hash the token to match database
    const resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Find user with valid reset token
    const user = await db.get(
      'SELECT id, email, first_name, last_name FROM users WHERE reset_token = ? AND reset_token_expires > datetime("now")',
      [resetTokenHash]
    );

    if (!user) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired reset token'
      });
    }

    // Hash new password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Update password and clear reset token
    await db.run(
      'UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?',
      [hashedPassword, user.id]
    );

    // Send confirmation email
    const confirmationEmailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #10b981; border-bottom: 2px solid #10b981; padding-bottom: 10px;">
          Password Successfully Reset
        </h2>
        
        <p>Hi ${user.first_name},</p>
        
        <p>Your password has been successfully reset for your Songbird Voice Studio account.</p>
        
        <p>You can now log in with your new password at:</p>
        <p><a href="${process.env.FRONTEND_URL || 'https://patricia-voice-studio.vercel.app'}/login" style="color: #2563eb;">https://patricia-voice-studio.vercel.app/login</a></p>
        
        <p>If you did not make this change, please contact us immediately at patricia@songbirdvoicestudio.com</p>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
          <p style="margin: 0; font-size: 14px; color: #6b7280;">
            Best regards,<br>
            <strong>Patricia Freund</strong><br>
            Songbird Voice Studio
          </p>
        </div>
      </div>
    `;

    await sendEmail({
      to: user.email,
      subject: 'Password Reset Confirmation - Songbird Voice Studio',
      html: confirmationEmailHtml
    });

    console.log(`✅ Password reset completed for ${user.email}`);

    res.json({
      success: true,
      message: 'Password has been reset successfully'
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset password'
    });
  }
});

export { router as authRoutes };