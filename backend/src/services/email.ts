import nodemailer from 'nodemailer';

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
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
      from: process.env.EMAIL_FROM || 'noreply@songbirdvoicestudio.com',
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text || options.html.replace(/<[^>]*>/g, '')
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