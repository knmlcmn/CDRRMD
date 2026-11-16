import assert from 'node:assert/strict';
import test from 'node:test';
import {
  handleAuthFailureForSession,
  handleAuthFailureIfSessionActive,
  isRefreshableAuthFailure,
  isCurrentAuthRequest,
  shouldRetryRotatedAccessToken,
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

test('old and new backend authentication failures both enter refresh handling', () => {
  assert.equal(isRefreshableAuthFailure(401, 'AUTH_TOKEN_EXPIRED', ''), true);
  assert.equal(isRefreshableAuthFailure(401, 'AUTH_SESSION_INVALID', 'Responder session is no longer active.'), true);
  assert.equal(isRefreshableAuthFailure(401, '', 'Access token is invalid.'), true);
  assert.equal(isRefreshableAuthFailure(403, 'AUTH_SESSION_INVALID', ''), false);
});

test('only a stale same-session access token retries with the rotated token', () => {
  assert.equal(shouldRetryRotatedAccessToken({
    status: 401,
    code: 'AUTH_SESSION_INVALID',
    retried: false,
    requestAuthorization: 'Bearer old',
    currentAuthorization: 'Bearer rotated',
  }), true);
  assert.equal(shouldRetryRotatedAccessToken({
    status: 401,
    code: 'AUTH_SESSION_INVALID',
    retried: true,
    requestAuthorization: 'Bearer old',
    currentAuthorization: 'Bearer rotated',
  }), false);
  assert.equal(shouldRetryRotatedAccessToken({
    status: 401,
    code: 'AUTH_SESSION_INVALID',
    retried: false,
    requestAuthorization: 'Bearer current',
    currentAuthorization: 'Bearer current',
  }), false);
});
