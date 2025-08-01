import express from 'express';
import rateLimit from 'express-rate-limit';
import { sendEmail, emailTemplates } from '../services/email';

const router = express.Router();

// Rate limiting for contact form
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // limit each IP to 3 contact form submissions per windowMs
  message: 'Too many contact form submissions, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting for local development
  skip: (req) => req.ip === '127.0.0.1' || req.ip === '::1'
});

// Contact form submission
router.post('/', contactLimiter, async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;

    // Validate required fields
    if (!name || !email || !subject || !message) {
      return res.status(400).json({
        success: false,
        error: 'Name, email, subject, and message are required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Please provide a valid email address'
      });
    }

    // Send email to Patricia
    const contactEmailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 10px;">
          New Contact Form Submission
        </h2>
        
        <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #374151;">Contact Information</h3>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          ${phone ? `<p><strong>Phone:</strong> ${phone}</p>` : ''}
          <p><strong>Subject:</strong> ${subject}</p>
        </div>
        
        <div style="background-color: #ffffff; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <h3 style="margin-top: 0; color: #374151;">Message</h3>
          <p style="white-space: pre-wrap; line-height: 1.6;">${message}</p>
        </div>
        
        <div style="margin-top: 20px; padding: 15px; background-color: #eff6ff; border-radius: 8px; border-left: 4px solid #2563eb;">
          <p style="margin: 0; font-size: 14px; color: #1e40af;">
            <strong>Reply directly to this email to respond to ${name}</strong>
          </p>
        </div>
      </div>
    `;

    await sendEmail({
      to: 'patricia@songbirdvoicestudio.com',
      subject: `Contact Form: ${subject}`,
      html: contactEmailHtml,
      replyTo: email // Allow Patricia to reply directly to the sender
    });

    // Send confirmation email to the person who submitted the form
    const confirmationEmailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 10px;">
          Thank You for Contacting Songbird Voice Studio!
        </h2>
        
        <p>Hi ${name},</p>
        
        <p>Thank you for reaching out to us! We've received your message and Patricia will get back to you within 24-48 hours.</p>
        
        <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #374151;">Your Message Summary</h3>
          <p><strong>Subject:</strong> ${subject}</p>
          <p><strong>Message:</strong></p>
          <p style="white-space: pre-wrap; line-height: 1.6; font-style: italic;">${message}</p>
        </div>
        
        <p>In the meantime, feel free to:</p>
        <ul style="line-height: 1.6;">
          <li>Check out our <a href="https://songbirdvoicestudio.com/about" style="color: #2563eb;">About page</a> to learn more about Patricia's background</li>
          <li>Call us directly at <a href="tel:+18585395946" style="color: #2563eb;">(858) 539-5946</a></li>
          <li>Visit our studio at 5550 Carmel Mountain Road, Suite 210, San Diego, CA 92130</li>
        </ul>
        
        <p>We look forward to hearing from you soon!</p>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
          <p style="margin: 0; font-size: 14px; color: #6b7280;">
            Best regards,<br>
            <strong>Patricia Freund</strong><br>
            Songbird Voice Studio<br>
            <a href="mailto:patricia@songbirdvoicestudio.com" style="color: #2563eb;">patricia@songbirdvoicestudio.com</a><br>
            <a href="tel:+18585395946" style="color: #2563eb;">(858) 539-5946</a>
          </p>
        </div>
      </div>
    `;

    await sendEmail({
      to: email,
      subject: 'Thank you for contacting Songbird Voice Studio!',
      html: confirmationEmailHtml
    });

    console.log(`✅ Contact form submission processed from ${email} (${name})`);

    res.json({
      success: true,
      message: 'Message sent successfully. We\'ll get back to you soon!'
    });

  } catch (error) {
    console.error('Contact form error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to send message. Please try again or contact us directly.'
    });
  }
});

export { router as contactRoutes };