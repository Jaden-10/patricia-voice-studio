# Google Calendar Integration Setup Guide

## Overview
This guide walks you through setting up Google Calendar integration for Patricia's voice studio website to achieve Calendly-style two-way sync.

## Prerequisites
- Google Account with Google Calendar access
- Google Cloud Console project
- Railway backend deployment
- Admin access to the voice studio website

## Step 1: Google Cloud Console Setup

### 1.1 Create Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Note your Project ID

### 1.2 Enable Google Calendar API
1. In Google Cloud Console, go to "APIs & Services" → "Library"
2. Search for "Google Calendar API"
3. Click "Enable"

### 1.3 Create OAuth 2.0 Credentials
1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth 2.0 Client IDs"
3. If prompted, configure OAuth consent screen:
   - User Type: External (for production) or Internal (for testing)
   - App name: "Songbird Voice Studio"
   - User support email: patricia@songbirdvoicestudio.com
   - Developer contact: patricia@songbirdvoicestudio.com
4. For OAuth 2.0 Client ID:
   - Application type: Web application
   - Name: "Voice Studio Calendar Integration"
   - Authorized redirect URIs:
     - `https://patricia-voice-studio-production.up.railway.app/api/calendar/auth/callback`
     - `http://localhost:5000/api/calendar/auth/callback` (for testing)

### 1.4 Download Credentials
1. Download the JSON file containing your credentials
2. Note the `client_id` and `client_secret` values

## Step 2: Environment Variables Setup

### 2.1 Railway Environment Variables
Add these environment variables to your Railway backend deployment:

```bash
# Google Calendar Integration
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
GOOGLE_CALENDAR_ID=primary
GOOGLE_REDIRECT_URI=https://patricia-voice-studio-production.up.railway.app/api/calendar/auth/callback

# Optional: Webhook verification (for future webhook integration)
WEBHOOK_SECRET=your_random_secret_here
```

### 2.2 How to Add Environment Variables in Railway
1. Go to your Railway project dashboard
2. Click on your backend service
3. Go to "Variables" tab
4. Add each environment variable listed above

## Step 3: Calendar Configuration

### 3.1 Choose Calendar to Sync
- **Primary Calendar**: Use `GOOGLE_CALENDAR_ID=primary` for main Google Calendar
- **Specific Calendar**: Get Calendar ID from Google Calendar settings:
  1. Go to Google Calendar
  2. Click settings gear → Settings
  3. Select the calendar you want to use
  4. Scroll down to "Calendar ID" section
  5. Copy the Calendar ID (looks like: `abc123@group.calendar.google.com`)

### 3.2 Calendar Permissions
Ensure the Google account has:
- Read/write access to the target calendar
- Permission to create/modify/delete events
- Access to busy/free information

## Step 4: Website Integration

### 4.1 Admin Setup
1. Deploy the backend with environment variables
2. Login as admin: `patricia@songbirdvoicestudio.com` / `admin123`
3. Navigate to Admin → Settings
4. Look for "Google Calendar Integration" section

### 4.2 Connect Google Calendar
1. Click "Connect Google Calendar" button
2. Authenticate with Google account in popup window
3. Grant all requested permissions
4. Return to admin dashboard to verify connection

### 4.3 Enable Sync
1. Toggle "Enable Sync" if not automatically enabled
2. Optionally run "Manual Sync" to sync existing bookings
3. Monitor sync status and logs

## Step 5: Testing the Integration

### 5.1 Test Booking Creation
1. Create a test booking on the website
2. Check that event appears in Google Calendar
3. Verify event details (time, duration, attendee)

### 5.2 Test Availability Blocking
1. Create an event directly in Google Calendar
2. Check that website shows that time as unavailable
3. Confirm students cannot book conflicting times

### 5.3 Test Booking Updates
1. Reschedule a booking on the website
2. Verify Google Calendar event is updated
3. Test canceling a booking removes the calendar event

## Step 6: Advanced Configuration

### 6.1 Time Zone Settings
- Calendar events use `America/Los_Angeles` time zone
- Adjust in `googleCalendar.ts` if needed for different location

### 6.2 Event Templates
Customize event details in `googleCalendar.ts`:
- Event title format
- Description template
- Reminder settings
- Attendee notifications

### 6.3 Sync Frequency
- Background sync runs every 15 minutes
- Full sync runs daily at 2 AM
- Adjust in `calendarSync.ts` if needed

## Troubleshooting

### Common Issues

#### "Calendar not connected" Error
- Check environment variables are set correctly
- Verify OAuth redirect URI matches exactly
- Ensure Google Calendar API is enabled

#### "Authentication failed" Error
- Check client ID and secret are correct
- Verify OAuth consent screen is configured
- Ensure redirect URI is whitelisted

#### "Events not syncing" Error
- Check calendar sync is enabled in admin dashboard
- Verify Google account has calendar permissions
- Check sync logs for detailed error messages

#### "Availability not updating" Error
- Confirm calendar sync is enabled and working
- Check that correct Calendar ID is configured
- Verify API rate limits are not exceeded

### Debug Information

Check sync logs in admin dashboard:
1. Go to Admin → Settings
2. Scroll to Google Calendar Integration
3. View recent sync activity and error messages

### API Rate Limits
- Google Calendar API: 1,000,000 requests/day
- Background sync includes delays to respect limits
- Manual sync processes in batches

## Production Considerations

### Security
- Environment variables are secure in Railway
- OAuth tokens are stored encrypted in database
- API access is restricted to admin users only

### Reliability
- Graceful degradation if Google Calendar is unavailable
- Booking system continues to work without calendar sync
- Automatic retry logic for failed syncs
- Comprehensive error logging

### Performance
- Availability checks are cached appropriately
- Background sync processes efficiently
- Database indexes support calendar queries

## Support

For issues with this integration:
1. Check Railway deployment logs
2. Review sync logs in admin dashboard
3. Verify Google Cloud Console configuration
4. Contact development team with specific error messages

---

**Note**: This integration provides professional-grade calendar sync that rivals Calendly while maintaining all custom business rules and policies specific to Patricia's voice studio.