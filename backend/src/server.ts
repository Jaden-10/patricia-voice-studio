 import express from 'express';
  import cors from 'cors';
  import helmet from 'helmet';
  import rateLimit from 'express-rate-limit';
  import dotenv from 'dotenv';
  import { authRoutes } from './routes/auth';
  import { bookingRoutes } from './routes/bookings';
  import { userRoutes } from './routes/users';
  import { adminRoutes } from './routes/admin';
  import { paymentRoutes } from './routes/payments';
  import { notificationRoutes } from './routes/notifications';
  import recurringRoutes from './routes/recurring';
  import makeupRoutes from './routes/makeup';
  import eventsRoutes from './routes/events';
  import emergencyRoutes from './routes/emergency';
  import calendarRoutes from './routes/calendar';
  import { initDatabase, createTables } from './models/database';
  import { seedDatabase } from './utils/seed';
  import { schedulerService } from './services/scheduler';
  import { calendarSyncService } from './services/calendarSync';

  dotenv.config();
  const app = express();
  app.set('trust proxy', 1);
const PORT = process.env.PORT || 5000;

// Security middleware
app.use(helmet());
 app.use(cors({
    origin: true, // Allow all origins for now
    credentials: true
  }));
// Rate limiting - configured for Railway proxy
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  // Trust the first proxy (Railway)
  skip: (req) => req.ip === '127.0.0.1' || req.ip === '::1'
});

app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint (available before database initialization)
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Initialize database and start server
const startServer = async () => {
  try {
    await initDatabase();
    await createTables();
    console.log('Database initialized successfully');
    
    // Automatically seed database with admin account and initial data
    console.log('Running database seeding...');
    try {
      await seedDatabase();
      console.log('Database seeding completed successfully');
    } catch (seedError) {
      console.error('Database seeding failed:', seedError);
      console.log('Server will continue without seeding - admin account may need to be created manually');
    }

    // Register routes after database is initialized
    app.use('/api/auth', authRoutes);
    app.use('/api/bookings', bookingRoutes);
    app.use('/api/users', userRoutes);
    app.use('/api/admin', adminRoutes);
    app.use('/api/payments', paymentRoutes);
    app.use('/api/notifications', notificationRoutes);
    app.use('/api/recurring', recurringRoutes);
    app.use('/api/makeup', makeupRoutes);
    app.use('/api/events', eventsRoutes);
    app.use('/api/emergency', emergencyRoutes);
    app.use('/api/calendar', calendarRoutes);

    // Error handling middleware
    app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      console.error(err.stack);
      res.status(500).json({ 
        message: 'Something went wrong!',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    });

    // 404 handler
    app.use((req, res) => {
      res.status(404).json({ message: 'Route not found' });
    });
    
    // Initialize notification scheduler
    console.log('Initializing notification scheduler...');
    
    // Initialize Google Calendar sync service
    console.log('Initializing Google Calendar sync service...');
    calendarSyncService.start();
    
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log('API endpoints available at:');
      console.log(`  Health: http://localhost:${PORT}/api/health`);
      console.log(`  Auth: http://localhost:${PORT}/api/auth`);
      console.log(`  Bookings: http://localhost:${PORT}/api/bookings`);
      console.log(`  Admin: http://localhost:${PORT}/api/admin`);
      console.log('Run "npm run seed" to populate database with initial data');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export default app;
