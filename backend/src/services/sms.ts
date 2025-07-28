import twilio from 'twilio';

let twilioClient: twilio.Twilio | null = null;

const initTwilioClient = (): twilio.Twilio => {
  if (twilioClient) {
    return twilioClient;
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    throw new Error('Twilio credentials not configured');
  }

  twilioClient = twilio(accountSid, authToken);
  return twilioClient;
};

export interface SMSResult {
  sid: string;
  status: string;
  to: string;
}

export const sendSMS = async (to: string, message: string): Promise<SMSResult> => {
  try {
    // For development, just log SMS instead of sending
    if (process.env.NODE_ENV === 'development') {
      console.log('SMS (development mode):', {
        to,
        message,
        from: process.env.TWILIO_PHONE_NUMBER
      });
      
      return {
        sid: `dev_${Date.now()}`,
        status: 'delivered',
        to
      };
    }

    const client = initTwilioClient();
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!fromNumber) {
      throw new Error('Twilio phone number not configured');
    }

    const result = await client.messages.create({
      body: message,
      from: fromNumber,
      to: to
    });

    console.log('SMS sent successfully:', {
      sid: result.sid,
      status: result.status,
      to: result.to
    });

    return {
      sid: result.sid,
      status: result.status,
      to: result.to
    };

  } catch (error) {
    console.error('SMS sending failed:', error);
    throw new Error('Failed to send SMS');
  }
};

export const sendBookingConfirmationSMS = async (
  phone: string, 
  name: string, 
  lessonDate: Date, 
  duration: number
): Promise<SMSResult> => {
  const formattedDate = lessonDate.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
  
  const formattedTime = lessonDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  const message = `Hi ${name}! Your ${duration}-min voice lesson is confirmed for ${formattedDate} at ${formattedTime}. See you then! - Patricia, Songbird Voice Studio`;

  return await sendSMS(phone, message);
};

export const sendReschedulingSMS = async (
  phone: string, 
  name: string, 
  newDate: Date,
  duration: number
): Promise<SMSResult> => {
  const formattedDate = newDate.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
  
  const formattedTime = newDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  const message = `Hi ${name}! Your voice lesson has been rescheduled to ${formattedDate} at ${formattedTime} (${duration} min). - Patricia, Songbird Voice Studio`;

  return await sendSMS(phone, message);
};

export const sendLessonReminderSMS = async (
  phone: string, 
  name: string, 
  lessonDate: Date, 
  hoursUntil: number
): Promise<SMSResult> => {
  const formattedTime = lessonDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  const timeText = hoursUntil === 24 ? 'tomorrow' : `in ${hoursUntil} hours`;
  const message = `Hi ${name}! Reminder: Voice lesson ${timeText} at ${formattedTime}. See you soon! - Patricia, Songbird Voice Studio`;

  return await sendSMS(phone, message);
};