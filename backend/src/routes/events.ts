import express from 'express';
import { getDatabase } from '../models/database';
import { authenticateToken, requireRole, AuthenticatedRequest } from '../middleware/auth';

const router = express.Router();

interface StudioEvent {
  id?: number;
  name: string;
  description: string;
  event_date: string;
  event_type: 'cabaret' | 'recital' | 'holiday_video' | 'masterclass' | 'workshop';
  max_participants?: number;
  current_participants: number;
  is_virtual: boolean;
  virtual_link?: string;
  location?: string;
  status: 'planned' | 'open_registration' | 'full' | 'completed' | 'cancelled';
  registration_deadline?: string;
  cost?: number;
}

// Get all upcoming events
router.get('/', async (req, res) => {
  try {
    const db = getDatabase();
    const events = await db.all(`
      SELECT * FROM studio_events 
      WHERE event_date >= date('now') 
      ORDER BY event_date ASC
    `);

    res.json({
      success: true,
      data: events
    });
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch events'
    });
  }
});

// Get specific event
router.get('/:id', async (req, res) => {
  try {
    const db = getDatabase();
    const { id } = req.params;
    
    const event = await db.get(`
      SELECT * FROM studio_events WHERE id = ?
    `, [id]);

    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Event not found'
      });
    }

    // Get registered participants if user is admin
    const participants = await db.all(`
      SELECT u.first_name, u.last_name, u.email, ep.registered_at
      FROM event_participants ep
      JOIN users u ON ep.user_id = u.id
      WHERE ep.event_id = ?
      ORDER BY ep.registered_at ASC
    `, [id]);

    res.json({
      success: true,
      data: {
        ...event,
        participants
      }
    });
  } catch (error) {
    console.error('Error fetching event:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch event'
    });
  }
});

// Register for event
router.post('/:id/register', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const db = getDatabase();
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    const { id } = req.params;
    const userId = req.user.id;

    // Check if event exists and is open for registration
    const event = await db.get(`
      SELECT * FROM studio_events 
      WHERE id = ? AND status = 'open_registration'
    `, [id]);

    if (!event) {
      return res.status(404).json({
        success: false,
        error: 'Event not found or registration not open'
      });
    }

    // Check registration deadline
    if (event.registration_deadline && new Date() > new Date(event.registration_deadline)) {
      return res.status(400).json({
        success: false,
        error: 'Registration deadline has passed'
      });
    }

    // Check if already registered
    const existingRegistration = await db.get(`
      SELECT id FROM event_participants 
      WHERE event_id = ? AND user_id = ?
    `, [id, userId]);

    if (existingRegistration) {
      return res.status(400).json({
        success: false,
        error: 'You are already registered for this event'
      });
    }

    // Check capacity
    if (event.max_participants && event.current_participants >= event.max_participants) {
      return res.status(400).json({
        success: false,
        error: 'Event is at full capacity'
      });
    }

    // Register user
    await db.run(`
      INSERT INTO event_participants (event_id, user_id, registered_at)
      VALUES (?, ?, ?)
    `, [id, userId, new Date().toISOString().split('T')[0]]);

    // Update participant count
    await db.run(`
      UPDATE studio_events 
      SET current_participants = current_participants + 1
      WHERE id = ?
    `, [id]);

    // Check if event is now full
    const updatedEvent = await db.get('SELECT * FROM studio_events WHERE id = ?', [id]);
    if (updatedEvent.max_participants && updatedEvent.current_participants >= updatedEvent.max_participants) {
      await db.run(`
        UPDATE studio_events SET status = 'full' WHERE id = ?
      `, [id]);
    }

    res.json({
      success: true,
      message: 'Successfully registered for event'
    });

  } catch (error) {
    console.error('Error registering for event:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to register for event'
    });
  }
});

// Unregister from event
router.delete('/:id/register', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const db = getDatabase();
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    const { id } = req.params;
    const userId = req.user.id;

    // Check if registered
    const registration = await db.get(`
      SELECT id FROM event_participants 
      WHERE event_id = ? AND user_id = ?
    `, [id, userId]);

    if (!registration) {
      return res.status(404).json({
        success: false,
        error: 'You are not registered for this event'
      });
    }

    // Remove registration
    await db.run(`
      DELETE FROM event_participants 
      WHERE event_id = ? AND user_id = ?
    `, [id, userId]);

    // Update participant count and status
    await db.run(`
      UPDATE studio_events 
      SET current_participants = current_participants - 1,
          status = CASE 
            WHEN status = 'full' THEN 'open_registration'
            ELSE status
          END
      WHERE id = ?
    `, [id]);

    res.json({
      success: true,
      message: 'Successfully unregistered from event'
    });

  } catch (error) {
    console.error('Error unregistering from event:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to unregister from event'
    });
  }
});

// Create new event (admin only)
router.post('/', authenticateToken, requireRole('admin'), async (req: AuthenticatedRequest, res) => {
  try {
    const db = getDatabase();
    const {
      name,
      description,
      event_date,
      event_type,
      max_participants,
      is_virtual,
      virtual_link,
      location,
      registration_deadline,
      cost
    }: StudioEvent = req.body;

    const result = await db.run(`
      INSERT INTO studio_events (
        name, description, event_date, event_type, max_participants,
        current_participants, is_virtual, virtual_link, location,
        status, registration_deadline, cost
      ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, 'planned', ?, ?)
    `, [
      name, description, event_date, event_type, max_participants,
      is_virtual, virtual_link, location, registration_deadline, cost
    ]);

    res.status(201).json({
      success: true,
      data: { id: result.lastID },
      message: 'Event created successfully'
    });

  } catch (error) {
    console.error('Error creating event:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create event'
    });
  }
});

// Update event (admin only)
router.put('/:id', authenticateToken, requireRole('admin'), async (req: AuthenticatedRequest, res) => {
  try {
    const db = getDatabase();
    const { id } = req.params;
    const updateFields = req.body;

    // Build dynamic update query
    const fields = Object.keys(updateFields);
    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const values = fields.map(field => updateFields[field]);

    await db.run(`
      UPDATE studio_events 
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [...values, id]);

    res.json({
      success: true,
      message: 'Event updated successfully'
    });

  } catch (error) {
    console.error('Error updating event:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update event'
    });
  }
});

// Open registration for event (admin only)
router.post('/:id/open-registration', authenticateToken, requireRole('admin'), async (req: AuthenticatedRequest, res) => {
  try {
    const db = getDatabase();
    const { id } = req.params;

    await db.run(`
      UPDATE studio_events 
      SET status = 'open_registration' 
      WHERE id = ? AND status = 'planned'
    `, [id]);

    res.json({
      success: true,
      message: 'Registration opened for event'
    });

  } catch (error) {
    console.error('Error opening registration:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to open registration'
    });
  }
});

// Get user's registered events
router.get('/my/registrations', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const db = getDatabase();
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    const userId = req.user.id;

    const registeredEvents = await db.all(`
      SELECT se.*, ep.registered_at
      FROM studio_events se
      JOIN event_participants ep ON se.id = ep.event_id
      WHERE ep.user_id = ?
      ORDER BY se.event_date ASC
    `, [userId]);

    res.json({
      success: true,
      data: registeredEvents
    });

  } catch (error) {
    console.error('Error fetching user registrations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch registrations'
    });
  }
});

export default router;