import nodemailer from 'nodemailer';

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

let transporter: nodemailer.Transporter | null = null;

const initEmailTransporter = (): nodemailer.Transporter => {
  if (transporter) {
    return transporter;
  }

  // For development, just log emails instead of sending
  if (process.env.NODE_ENV === 'development') {
    transporter = nodemailer.createTransport({
      streamTransport: true,
      newline: 'unix',
      buffer: true
    });
  } else {
    // Production email configuration
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
      }
    });
  }

  return transporter;
};

export const sendEmail = async (options: EmailOptions): Promise<void> => {
  try {
    const emailTransporter = initEmailTransporter();

    const mailOptions = {
      from: process.env.EMAIL_FROM || 'patricia@songbirdvoicestudio.com',
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text || options.html.replace(/<[^>]*>/g, ''),
      ...(options.replyTo && { replyTo: options.replyTo })
    };

    const result = await emailTransporter.sendMail(mailOptions);
    
    console.log('Email sent:', {
      to: options.to,
      subject: options.subject,
      messageId: result.messageId
    });

  } catch (error) {
    console.error('Email sending failed:', error);
    throw new Error('Failed to send email');
  }
};

// Email Templates
export const emailTemplates = {
  bookingConfirmation: (clientName: string, lessonDate: string, duration: number, price: number) => ({
    subject: 'Your Voice Lesson is Confirmed! 🎵',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Lesson Confirmed</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .lesson-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
          .button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎵 Songbird Voice Studio</h1>
            <h2>Your Lesson is Confirmed!</h2>
          </div>
          <div class="content">
            <p>Dear ${clientName},</p>
            
            <p>Wonderful news! Your voice lesson with Patricia Freund has been confirmed and payment received.</p>
            
            <div class="lesson-details">
              <h3>📅 Lesson Details</h3>
              <p><strong>Date & Time:</strong> ${new Date(lessonDate).toLocaleString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                timeZoneName: 'short'
              })}</p>
              <p><strong>Duration:</strong> ${duration} minutes</p>
              <p><strong>Location:</strong> 5550 Carmel Mountain Road, Ste. 210, San Diego, CA 92130</p>
              <p><strong>Amount Paid:</strong> $${price.toFixed(2)}</p>
            </div>
            
            <p><strong>What to Expect:</strong></p>
            <ul>
              <li>Personalized vocal coaching tailored to your goals</li>
              <li>Professional techniques from Patricia's extensive training</li>
              <li>Supportive environment to build confidence</li>
              <li>Please arrive 5 minutes early</li>
            </ul>
            
            <p><strong>Need to make changes?</strong> Please contact us at least 24 hours in advance:</p>
            <ul>
              <li>📧 Email: patricia@songbirdvoicestudio.com</li>
              <li>📱 Phone: (858) 539-5946</li>
            </ul>
            
            <p>Looking forward to helping you discover and develop your unique voice!</p>
            
            <p>Warm regards,<br><strong>Patricia Freund</strong><br>Songbird Voice Studio</p>
          </div>
          <div class="footer">
            <p>© 2024 Songbird Voice Studio | 5550 Carmel Mountain Road, Ste. 210, San Diego, CA 92130</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  bookingReminder: (clientName: string, lessonDate: string, duration: number) => ({
    subject: 'Reminder: Your Voice Lesson Tomorrow 🎵',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎵 Lesson Reminder</h1>
          </div>
          <div class="content">
            <p>Hi ${clientName},</p>
            
            <p>This is a friendly reminder that you have a voice lesson scheduled for tomorrow!</p>
            
            <p><strong>📅 Tomorrow, ${new Date(lessonDate).toLocaleString()}</strong></p>
            <p><strong>⏱️ Duration:</strong> ${duration} minutes</p>
            <p><strong>📍 Location:</strong> 5550 Carmel Mountain Road, Ste. 210, San Diego, CA 92130</p>
            
            <p>Please arrive 5 minutes early. If you need to reschedule, please contact us as soon as possible.</p>
            
            <p>Looking forward to seeing you!<br>Patricia</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  welcomeEmail: (clientName: string) => ({
    subject: 'Welcome to Songbird Voice Studio! 🎵',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎵 Welcome to Songbird Voice Studio!</h1>
          </div>
          <div class="content">
            <p>Dear ${clientName},</p>
            
            <p>Welcome! I'm Patricia Freund, and I'm thrilled you've chosen Songbird Voice Studio for your vocal journey.</p>
            
            <p>With my training from Northwestern University, NYU Tisch School, and extensive experience in opera and musical theater, I'm here to help you discover and develop your unique voice.</p>
            
            <p><strong>Ready to get started?</strong> You can now book your first lesson through your dashboard!</p>
            
            <p><strong>What makes our studio special:</strong></p>
            <ul>
              <li>Personalized instruction tailored to your goals</li>
              <li>Professional techniques from classical and contemporary training</li>
              <li>Supportive environment to build confidence</li>
              <li>Flexible scheduling to fit your life</li>
            </ul>
            
            <p>I can't wait to work with you and help you achieve your vocal goals!</p>
            
            <p>Musically yours,<br><strong>Patricia Freund</strong></p>
          </div>
        </div>
      </body>
      </html>
    `
  })
};