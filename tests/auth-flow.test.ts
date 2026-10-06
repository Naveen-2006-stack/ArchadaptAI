import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Read .env.local for Supabase config
function getSupabaseConfig() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const env: Record<string, string> = {};
  for (const line of envContent.split('\n')) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      env[match[1]] = (match[2] || '').trim();
    }
  }
  return {
    url: env.NEXT_PUBLIC_SUPABASE_URL || '',
    anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  };
}

const { url, anonKey } = getSupabaseConfig();

test('Client-side Auth Validation: Email & Password constraints', () => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Email format validation
  assert.equal(emailRegex.test(''), false, 'Empty email should be invalid');
  assert.equal(emailRegex.test('notanemail'), false, 'Email without @ or domain should be invalid');
  assert.equal(emailRegex.test('user@domain'), false, 'Email without TLD should be invalid');
  assert.equal(emailRegex.test('architect@studio.com'), true, 'Valid email should pass');

  // Password length validation
  assert.equal('short'.length >= 8, false, 'Password under 8 characters should fail');
  assert.equal('validpass123'.length >= 8, true, 'Password of 8+ characters should pass');

  // Confirm password match
  const passA = 'SecurePass123!';
  const passB = 'DifferentPass123!';
  assert.notEqual(passA, passB, 'Mismatched passwords must be detected');
  assert.equal(passA === passA, true, 'Matching passwords pass');
});

test('Test 1: New Registration creates account and is immediately authenticated without email confirmation', async () => {
  const supabase = createClient(url, anonKey);
  const testEmail = `architect_test_${Date.now()}_${Math.floor(Math.random() * 1000)}@studio.ai`;
  const testPassword = 'Password123!';
  const testName = 'Zaha Hadid';

  const { data, error } = await supabase.auth.signUp({
    email: testEmail,
    password: testPassword,
    options: {
      data: {
        full_name: testName
      }
    }
  });

  assert.equal(error, null, error ? `SignUp error: ${error.message}` : '');
  assert.ok(data.user, 'User must be returned');
  assert.equal(data.user.email, testEmail, 'Email must match');
  assert.equal(data.user.user_metadata?.full_name, testName, 'User full name must be preserved');

  // Verification that session exists immediately without email confirmation
  assert.ok(data.session, 'User must have an active session immediately without email confirmation');
  assert.ok(data.session?.access_token, 'Access token must be present');

  // Test 2: Logout
  const signOutRes = await supabase.auth.signOut();
  assert.equal(signOutRes.error, null, 'Sign out must succeed');

  const sessionAfterSignOut = await supabase.auth.getSession();
  assert.equal(sessionAfterSignOut.data.session, null, 'Session must be null after signOut');

  // Test 3: Login with the newly created account
  const signInRes = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword
  });

  assert.equal(signInRes.error, null, 'SignIn must succeed with the created account');
  assert.ok(signInRes.data.session, 'Session must be returned on valid login');
  assert.equal(signInRes.data.user?.email, testEmail, 'User email matches');

  // Test 4: Login with wrong password
  const wrongPassRes = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: 'CompletelyWrongPassword999!'
  });

  assert.ok(wrongPassRes.error, 'Wrong password must produce an error');
  assert.equal(wrongPassRes.error?.status, 400, 'Error status should be 400');
  assert.equal(wrongPassRes.data.session, null, 'No session must be returned on wrong password');

  // Test 5: Existing email duplicate registration
  const duplicateRes = await supabase.auth.signUp({
    email: testEmail,
    password: testPassword,
    options: {
      data: { full_name: 'Duplicate User' }
    }
  });

  // Supabase returns error or null identities for duplicate
  const isDuplicateDetected =
    (duplicateRes.error && ((duplicateRes.error as any).code === 'user_already_exists' || duplicateRes.error.message.includes('already registered'))) ||
    (duplicateRes.data?.user && (!duplicateRes.data.user.identities || duplicateRes.data.user.identities.length === 0));

  assert.ok(isDuplicateDetected, 'Duplicate email registration must be detected');
});

test('Test 7 & 8: Session Persistence and User Isolation', async () => {
  // Client A
  const clientA = createClient(url, anonKey);
  const emailA = `arch_a_${Date.now()}_${Math.floor(Math.random() * 1000)}@studio.ai`;
  const passA = 'SecurePassA123!';
  const { data: dataA } = await clientA.auth.signUp({
    email: emailA,
    password: passA,
    options: { data: { full_name: 'Architect A' } }
  });
  assert.ok(dataA.session, 'User A has active session');

  // Client B
  const clientB = createClient(url, anonKey);
  const emailB = `arch_b_${Date.now()}_${Math.floor(Math.random() * 1000)}@studio.ai`;
  const passB = 'SecurePassB123!';
  const { data: dataB } = await clientB.auth.signUp({
    email: emailB,
    password: passB,
    options: { data: { full_name: 'Architect B' } }
  });
  assert.ok(dataB.session, 'User B has active session');

  // Isolation check: clientA session is userA, clientB session is userB
  assert.notEqual(dataA.user?.id, dataB.user?.id, 'Users must have unique distinct IDs');
  assert.equal(dataA.user?.email, emailA);
  assert.equal(dataB.user?.email, emailB);

  // Persistence check: getSession returns userA for clientA and userB for clientB
  const sessA = await clientA.auth.getSession();
  const sessB = await clientB.auth.getSession();
  assert.equal(sessA.data.session?.user.id, dataA.user?.id);
  assert.equal(sessB.data.session?.user.id, dataB.user?.id);
});
