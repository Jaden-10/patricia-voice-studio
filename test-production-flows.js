#!/usr/bin/env node

/**
 * Production Flow Testing Script
 * Tests all critical user journeys end-to-end
 */

const axios = require('axios');
const API_BASE = 'https://patricia-voice-studio-production.up.railway.app/api';
const FRONTEND_BASE = 'https://patricia-voice-studio.vercel.app';

// Test utilities
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const randomEmail = () => `test${Date.now()}@example.com`;

let testResults = {
  passed: 0,
  failed: 0,
  details: []
};

function logTest(name, passed, details = '') {
  const status = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${status}: ${name}${details ? ' - ' + details : ''}`);
  
  testResults.details.push({ name, passed, details });
  if (passed) testResults.passed++;
  else testResults.failed++;
}

async function testAPI(endpoint, method = 'GET', data = null, headers = {}) {
  try {
    const config = {
      method,
      url: `${API_BASE}${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };
    
    if (data) config.data = data;
    const response = await axios(config);
    return { success: true, data: response.data, status: response.status };
  } catch (error) {
    return { 
      success: false, 
      error: error.response?.data || error.message,
      status: error.response?.status 
    };
  }
}

async function testHealthCheck() {
  console.log('\n🔍 Testing Backend Health...');
  
  const result = await testAPI('/health');
  logTest('Backend Health Check', result.success && result.data.status === 'OK');
  
  return result.success;
}

async function testUserRegistration() {
  console.log('\n👤 Testing User Registration Flow...');
  
  const email = randomEmail();
  const userData = {
    email,
    password: 'testpass123',
    first_name: 'Test',
    last_name: 'User'
  };
  
  const result = await testAPI('/auth/register', 'POST', userData);
  const success = result.success && result.data.success && result.data.data.token;
  
  logTest('User Registration', success, success ? `User created: ${email}` : result.error?.error);
  
  if (success) {
    global.testToken = result.data.data.token;
    global.testUser = result.data.data.user;
  }
  
  return success;
}

async function testUserLogin() {
  console.log('\n🔐 Testing User Login Flow...');
  
  // Test with demo account
  const loginData = {
    email: 'demo@example.com',
    password: 'demo123'
  };
  
  const result = await testAPI('/auth/login', 'POST', loginData);
  const success = result.success && result.data.success && result.data.data.token;
  
  logTest('User Login', success, success ? 'Demo user login successful' : result.error?.error);
  
  if (success) {
    global.demoToken = result.data.data.token;
  }
  
  return success;
}

async function testAdminLogin() {
  console.log('\n👑 Testing Admin Login Flow...');
  
  const adminData = {
    email: 'patricia@songbirdvoicestudio.com',
    password: 'admin123'
  };
  
  const result = await testAPI('/auth/login', 'POST', adminData);
  const success = result.success && result.data.success && result.data.data.user.role === 'admin';
  
  logTest('Admin Login', success, success ? 'Admin login successful' : result.error?.error);
  
  if (success) {
    global.adminToken = result.data.data.token;
  }
  
  return success;
}

async function testBookingAvailability() {
  console.log('\n📅 Testing Booking Availability...');
  
  if (!global.testToken) {
    logTest('Booking Availability', false, 'No test token available');
    return false;
  }
  
  // Test availability for tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateStr = tomorrow.toISOString().split('T')[0];
  
  const result = await testAPI(`/bookings/availability/${dateStr}`, 'GET', null, {
    'Authorization': `Bearer ${global.testToken}`
  });
  
  const success = result.success && Array.isArray(result.data.data);
  logTest('Booking Availability Check', success, success ? `Found ${result.data.data.length} slots` : result.error?.error);
  
  return success;
}

async function testPaymentMethods() {
  console.log('\n💳 Testing Payment Methods...');
  
  if (!global.testToken) {
    logTest('Payment Methods', false, 'No test token available');
    return false;
  }
  
  // Test Venmo link generation (requires a booking first)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(14, 0, 0, 0);
  
  // Create a test booking
  const bookingData = {
    lesson_date: tomorrow.toISOString(),
    duration: 60,
    notes: 'Test booking for payment flow'
  };
  
  const bookingResult = await testAPI('/bookings', 'POST', bookingData, {
    'Authorization': `Bearer ${global.testToken}`
  });
  
  if (bookingResult.success && bookingResult.data.success) {
    const bookingId = bookingResult.data.data.bookingId;
    
    // Test Venmo link generation
    const venmoResult = await testAPI('/payments/venmo-link', 'POST', { booking_id: bookingId }, {
      'Authorization': `Bearer ${global.testToken}`
    });
    
    logTest('Venmo Payment Link', venmoResult.success, venmoResult.success ? 'Link generated' : venmoResult.error?.error);
    
    // Test Zelle info generation
    const zelleResult = await testAPI('/payments/zelle-info', 'POST', { booking_id: bookingId }, {
      'Authorization': `Bearer ${global.testToken}`
    });
    
    logTest('Zelle Payment Info', zelleResult.success, zelleResult.success ? 'Info generated' : zelleResult.error?.error);
    
    return venmoResult.success && zelleResult.success;
  } else {
    logTest('Payment Methods', false, 'Could not create test booking');
    return false;
  }
}

async function testAdminDashboard() {
  console.log('\n📊 Testing Admin Dashboard...');
  
  if (!global.adminToken) {
    logTest('Admin Dashboard', false, 'No admin token available');
    return false;
  }
  
  // Test dashboard stats
  const dashboardResult = await testAPI('/admin/dashboard', 'GET', null, {
    'Authorization': `Bearer ${global.adminToken}`
  });
  
  const success = dashboardResult.success && dashboardResult.data.success;
  logTest('Admin Dashboard Stats', success, success ? 'Dashboard data loaded' : dashboardResult.error?.error);
  
  // Test booking management
  const bookingsResult = await testAPI('/admin/bookings', 'GET', null, {
    'Authorization': `Bearer ${global.adminToken}`
  });
  
  const bookingsSuccess = bookingsResult.success && Array.isArray(bookingsResult.data.data);
  logTest('Admin Booking Management', bookingsSuccess, bookingsSuccess ? `${bookingsResult.data.data.length} bookings loaded` : bookingsResult.error?.error);
  
  return success && bookingsSuccess;
}

async function testContactForm() {
  console.log('\n📧 Testing Contact Form...');
  
  const contactData = {
    name: 'Test User',
    email: 'test@example.com',
    phone: '555-123-4567',
    subject: 'lesson-inquiry',
    message: 'This is a test message from the automated test suite.'
  };
  
  const result = await testAPI('/contact', 'POST', contactData);
  const success = result.success && result.data.success;
  
  logTest('Contact Form Submission', success, success ? 'Form submitted successfully' : result.error?.error);
  
  return success;
}

async function testPasswordReset() {
  console.log('\n🔑 Testing Password Reset Flow...');
  
  const resetData = {
    email: 'demo@example.com'
  };
  
  const result = await testAPI('/auth/forgot-password', 'POST', resetData);
  const success = result.success && result.data.success;
  
  logTest('Password Reset Request', success, success ? 'Reset email sent' : result.error?.error);
  
  return success;
}

async function testFrontendPages() {
  console.log('\n🌐 Testing Frontend Pages...');
  
  const pagesToTest = [
    { path: '/', name: 'Home Page' },
    { path: '/about', name: 'About Page' },
    { path: '/contact', name: 'Contact Page' },
    { path: '/terms', name: 'Terms Page' },
    { path: '/privacy', name: 'Privacy Page' },
    { path: '/login', name: 'Login Page' },
    { path: '/register', name: 'Register Page' },
    { path: '/forgot-password', name: 'Forgot Password Page' }
  ];
  
  let allPassed = true;
  
  for (const page of pagesToTest) {
    try {
      const response = await axios.get(`${FRONTEND_BASE}${page.path}`, { timeout: 10000 });
      const success = response.status === 200 && response.data.includes('<!DOCTYPE html>');
      logTest(page.name, success);
      if (!success) allPassed = false;
    } catch (error) {
      logTest(page.name, false, error.message);
      allPassed = false;
    }
    
    await delay(500); // Be nice to the server
  }
  
  return allPassed;
}

async function runAllTests() {
  console.log('🚀 Starting Production Flow Testing...\n');
  console.log(`Backend: ${API_BASE}`);
  console.log(`Frontend: ${FRONTEND_BASE}\n`);
  
  // Initialize global variables
  global.testToken = null;
  global.demoToken = null;
  global.adminToken = null;
  global.testUser = null;
  
  // Run all tests
  await testHealthCheck();
  await testUserRegistration();
  await testUserLogin();
  await testAdminLogin();
  await testBookingAvailability();
  await testPaymentMethods();
  await testAdminDashboard();
  await testContactForm();
  await testPasswordReset();
  await testFrontendPages();
  
  // Print summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(50));
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  console.log(`📊 Success Rate: ${Math.round((testResults.passed / (testResults.passed + testResults.failed)) * 100)}%`);
  
  if (testResults.failed === 0) {
    console.log('\n🎉 ALL TESTS PASSED! Website is ready for production launch! 🚀');
  } else {
    console.log('\n⚠️  Some tests failed. Review the issues above before going live.');
  }
  
  console.log('\n' + '='.repeat(50));
}

// Run tests if called directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = { runAllTests };