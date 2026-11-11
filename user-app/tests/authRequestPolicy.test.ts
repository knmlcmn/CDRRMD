import assert from 'node:assert/strict';
import test from 'node:test';
import {
  handleAuthFailureForSession,
  handleAuthFailureIfSessionActive,
  isCurrentAuthRequest,
} from '../src/services/authRequestPolicy.ts';

test('a request from before logout cannot act on a new rescuer auth generation', () => {
  assert.equal(isCurrentAuthRequest(4, 5), false);
  assert.equal(isCurrentAuthRequest(5, 5), true);
});

test('a delayed old-session 401 cannot log out the newly authenticated account', () => {
  const oldSession = { token: 'old', user: { id: 1, role: 'user' } };
  const newSession = { token: 'new', user: { id: 2, role: 'rescuer' } };
  let loggedOut = false;
  assert.equal(handleAuthFailureForSession(oldSession, newSession, () => { loggedOut = true; }), false);
  assert.equal(loggedOut, false);
  assert.equal(handleAuthFailureForSession(newSession, newSession, () => { loggedOut = true; }), true);
  assert.equal(loggedOut, true);
});

test('global auth failures are ignored when no session is active', () => {
  let redirected = false;
  assert.equal(handleAuthFailureIfSessionActive(null, () => { redirected = true; }), false);
  assert.equal(redirected, false);
});
