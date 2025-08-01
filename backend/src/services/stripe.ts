import Stripe from 'stripe';
import { getDatabase } from '../models/database';
import { sendEmail, emailTemplates } from './email';

// Initialize Stripe with secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16',
});

export interface PaymentIntentData {
  amount: number; // in cents
  bookingId: number;
  clientEmail: string;
  clientName: string;
  lessonDate: string;
  duration: number;
}

export interface PaymentResult {
  success: boolean;
  paymentIntentId?: string;
  clientSecret?: string;
  error?: string;
}

class StripeService {
  /**
   * Create a payment intent for a lesson booking
   */
  async createPaymentIntent(data: PaymentIntentData): Promise<PaymentResult> {
    try {
      if (!process.env.STRIPE_SECRET_KEY) {
        console.error('Stripe secret key not configured');
        return { success: false, error: 'Payment processing not configured' };
      }

      const paymentIntent = await stripe.paymentIntents.create({
        amount: data.amount,
        currency: 'usd',
        metadata: {
          bookingId: data.bookingId.toString(),
          clientEmail: data.clientEmail,
          clientName: data.clientName,
          lessonDate: data.lessonDate,
          duration: data.duration.toString(),
          service: 'voice_lesson'
        },
        receipt_email: data.clientEmail,
        description: `Voice Lesson - ${data.duration} minutes with Patricia Freund`,
        automatic_payment_methods: {
          enabled: true,
        },
      });

      // Store payment intent in database
      const db = getDatabase();
      await db.run(
        `INSERT INTO payments (booking_id, stripe_payment_intent_id, amount, status, created_at) 
         VALUES (?, ?, ?, 'pending', CURRENT_TIMESTAMP)`,
        [data.bookingId, paymentIntent.id, data.amount]
      );

      console.log(`✅ Payment intent created: ${paymentIntent.id} for booking ${data.bookingId}`);

      return {
        success: true,
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret || undefined
      };

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Stripe payment intent creation failed:', errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Handle webhook events from Stripe
   */
  async handleWebhook(body: string, signature: string): Promise<{ success: boolean; error?: string }> {
    try {
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!webhookSecret) {
        console.error('Stripe webhook secret not configured');
        return { success: false, error: 'Webhook secret not configured' };
      }

      const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
      
      switch (event.type) {
        case 'payment_intent.succeeded':
          await this.handlePaymentSuccess(event.data.object as Stripe.PaymentIntent);
          break;
        
        case 'payment_intent.payment_failed':
          await this.handlePaymentFailure(event.data.object as Stripe.PaymentIntent);
          break;
          
        default:
          console.log(`Unhandled Stripe event type: ${event.type}`);
      }

      return { success: true };

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Stripe webhook error:', errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Handle successful payment
   */
  private async handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    try {
      const db = getDatabase();
      const bookingId = paymentIntent.metadata.bookingId;

      // Update payment status
      await db.run(
        `UPDATE payments SET 
         status = 'completed', 
         stripe_charge_id = ?, 
         paid_at = CURRENT_TIMESTAMP 
         WHERE stripe_payment_intent_id = ?`,
        [paymentIntent.latest_charge, paymentIntent.id]
      );

      // Update booking status to confirmed
      await db.run(
        `UPDATE bookings SET 
         status = 'confirmed', 
         payment_status = 'paid',
         updated_at = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        [bookingId]
      );

      console.log(`✅ Payment completed for booking ${bookingId}`);

      // Send confirmation email to client
      try {
        const booking = await db.get(`
          SELECT b.*, u.first_name, u.last_name, u.email
          FROM bookings b
          JOIN users u ON b.user_id = u.id
          WHERE b.id = ?
        `, [bookingId]);

        if (booking) {
          const clientName = `${booking.first_name} ${booking.last_name}`;
          const emailTemplate = emailTemplates.bookingConfirmation(
            clientName,
            booking.lesson_date,
            booking.duration,
            booking.price
          );

          await sendEmail({
            to: booking.email,
            subject: emailTemplate.subject,
            html: emailTemplate.html
          });

          console.log(`✅ Confirmation email sent to ${booking.email}`);
        }
      } catch (emailError: unknown) {
        const errorMessage = emailError instanceof Error ? emailError.message : String(emailError);
        console.error('Failed to send confirmation email:', errorMessage);
      }

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Error handling payment success:', errorMessage);
    }
  }

  /**
   * Handle failed payment
   */
  private async handlePaymentFailure(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    try {
      const db = getDatabase();
      const bookingId = paymentIntent.metadata.bookingId;

      // Update payment status
      await db.run(
        `UPDATE payments SET 
         status = 'failed', 
         updated_at = CURRENT_TIMESTAMP 
         WHERE stripe_payment_intent_id = ?`,
        [paymentIntent.id]
      );

      // Update booking status
      await db.run(
        `UPDATE bookings SET 
         status = 'payment_failed',
         payment_status = 'failed',
         updated_at = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        [bookingId]
      );

      console.log(`❌ Payment failed for booking ${bookingId}`);

      // TODO: Send payment failure notification to client

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Error handling payment failure:', errorMessage);
    }
  }

  /**
   * Refund a payment
   */
  async refundPayment(paymentIntentId: string, amount?: number): Promise<PaymentResult> {
    try {
      const refund = await stripe.refunds.create({
        payment_intent: paymentIntentId,
        amount: amount, // If not provided, refunds the full amount
      });

      // Update database
      const db = getDatabase();
      await db.run(
        `UPDATE payments SET 
         status = 'refunded', 
         refund_id = ?, 
         updated_at = CURRENT_TIMESTAMP 
         WHERE stripe_payment_intent_id = ?`,
        [refund.id, paymentIntentId]
      );

      console.log(`✅ Refund processed: ${refund.id}`);
      return { success: true };

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Refund failed:', errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Get payment details
   */
  async getPaymentDetails(paymentIntentId: string): Promise<Stripe.PaymentIntent | null> {
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      return paymentIntent;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Error retrieving payment details:', errorMessage);
      return null;
    }
  }
}

export const stripeService = new StripeService();