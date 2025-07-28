export interface User {
  id: number;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  phone?: string;
  role: 'client' | 'admin';
  is_verified: boolean;
  verification_token?: string;
  reset_token?: string;
  reset_token_expires?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface CreateUserData {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  phone?: string;
  role?: 'client' | 'admin';
}

export interface LoginData {
  email: string;
  password: string;
}

export interface Booking {
  id: number;
  user_id: number;
  lesson_date: Date;
  duration: number;
  price: number;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'rescheduled';
  notes?: string;
  reschedule_count: number;
  original_date?: Date;
  recurring_booking_id?: number;
  lesson_type: 'regular' | 'makeup' | 'audition_coaching';
  cancellation_reason?: string;
  cancelled_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface CreateBookingData {
  user_id: number;
  lesson_date: Date;
  duration: number;
  notes?: string;
}

export interface Payment {
  id: number;
  booking_id: number;
  amount: number;
  payment_method: 'venmo' | 'zelle' | 'cash' | 'check';
  payment_reference?: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  payment_date?: Date;
  venmo_link?: string;
  zelle_reference?: string;
  created_at: Date;
  updated_at: Date;
}

export interface Availability {
  id: number;
  date: Date;
  start_time: string;
  end_time: string;
  is_available: boolean;
  reason?: string;
  created_at: Date;
  updated_at: Date;
}

export interface Message {
  id: number;
  user_id: number;
  sender_id: number;
  subject?: string;
  message: string;
  is_read: boolean;
  message_type: 'general' | 'booking' | 'payment' | 'reminder';
  created_at: Date;
}

export interface Notification {
  id: number;
  user_id: number;
  booking_id?: number;
  title: string;
  message: string;
  type: 'reminder' | 'confirmation' | 'cancellation' | 'payment' | 'general';
  is_read: boolean;
  scheduled_for?: Date;
  sent_at?: Date;
  sms_sent: boolean;
  email_sent: boolean;
  created_at: Date;
}

export interface Setting {
  id: number;
  key: string;
  value: string;
  description?: string;
  created_at: Date;
  updated_at: Date;
}

export interface AuthResponse {
  user: Omit<User, 'password_hash'>;
  token: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface BookingWithUser extends Booking {
  user: Omit<User, 'password_hash'>;
}

export interface PaymentWithBooking extends Payment {
  booking: Booking;
}

export interface CalendarSlot {
  date: Date;
  time: string;
  available: boolean;
  duration?: number;
}

export interface BusinessHours {
  start: string;
  end: string;
  days: number[]; // 0-6, Sunday to Saturday
}

export interface VenmoPaymentLink {
  url: string;
  amount: number;
  note: string;
}

export interface ZellePaymentInfo {
  email: string;
  amount: number;
  reference: string;
}

export interface RecurringBooking {
  id: number;
  user_id: number;
  duration: number;
  price: number;
  day_of_week: number; // 0-6, Sunday to Saturday
  time: string;
  frequency: 'weekly' | 'biweekly';
  start_date: Date;
  end_date?: Date;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  lesson_type: 'regular' | 'audition_coaching';
  created_at: Date;
  updated_at: Date;
}

export interface CreateRecurringBookingData {
  user_id: number;
  duration: number;
  day_of_week: number;
  time: string;
  frequency: 'weekly' | 'biweekly';
  start_date: Date;
  end_date?: Date;
  lesson_type: 'regular' | 'audition_coaching';
}

export interface BillingCycle {
  id: number;
  user_id: number;
  recurring_booking_id: number;
  cycle_month: number;
  cycle_year: number;
  total_amount: number;
  lessons_count: number;
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  billing_date: Date;
  due_date: Date;
  paid_date?: Date;
  payment_method?: string;
  payment_reference?: string;
  created_at: Date;
  updated_at: Date;
}

export interface MakeupLesson {
  id: number;
  user_id: number;
  original_booking_id: number;
  makeup_date?: Date;
  reason: string;
  status: 'pending' | 'scheduled' | 'completed' | 'expired';
  created_at: Date;
  updated_at: Date;
}

export interface BlackoutDate {
  id: number;
  start_date: Date;
  end_date: Date;
  reason: string;
  description?: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface SaturdaySession {
  id: number;
  session_date: Date;
  start_time: string;
  end_time: string;
  max_students: number;
  current_students: number;
  status: 'available' | 'full' | 'cancelled';
  created_at: Date;
  updated_at: Date;
}

export interface RecurringBookingWithUser extends RecurringBooking {
  user: Omit<User, 'password_hash'>;
}

export interface BillingCycleWithBooking extends BillingCycle {
  recurring_booking: RecurringBooking;
  user: Omit<User, 'password_hash'>;
}

export interface AcademicYearConfig {
  start_date: Date;
  end_date: Date;
  total_months: number;
  blackout_dates: BlackoutDate[];
}