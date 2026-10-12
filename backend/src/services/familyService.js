const pool = require('../config/db');
const { httpError } = require('../utils/httpError');

const ACCOUNT_ID_SQL = `CONCAT('USR-', EXTRACT(YEAR FROM u.created_at)::text, '-', LPAD(u.id::text, 5, '0'))`;

function requireResident(user) {
  if (user?.role !== 'user') throw httpError(403, 'Resident account access required.');
  return Number(user.userId);
}

function mapInvitation(row, direction) {
  return {
    id: Number(row.id),
    direction,
    status: row.status,
    createdAt: row.created_at,
    respondedAt: row.responded_at,
    member: {
      accountId: row.account_id,
      firstName: row.first_name || '',
      lastName: row.last_name || '',
    },
  };
}

async function listInvitations(actor) {
  const userId = requireResident(actor);
  const [outgoing, incoming] = await Promise.all([
    pool.query(
      `SELECT fi.*, ${ACCOUNT_ID_SQL} AS account_id, u.first_name, u.last_name
       FROM family_invitations fi JOIN users u ON u.id = fi.invitee_id
       WHERE fi.inviter_id = $1 AND fi.status <> 'declined'
       ORDER BY fi.created_at DESC`,
      [userId],
    ),
    pool.query(
      `SELECT fi.*, ${ACCOUNT_ID_SQL} AS account_id, u.first_name, u.last_name
       FROM family_invitations fi JOIN users u ON u.id = fi.inviter_id
       WHERE fi.invitee_id = $1 AND fi.status <> 'declined'
       ORDER BY fi.created_at DESC`,
      [userId],
    ),
  ]);
  return {
    outgoing: outgoing.rows.map((row) => mapInvitation(row, 'outgoing')),
    incoming: incoming.rows.map((row) => mapInvitation(row, 'incoming')),
  };
}

async function invite(actor, accountIdValue) {
  const inviterId = requireResident(actor);
  const accountId = String(accountIdValue || '').trim().toUpperCase();
  if (!/^USR-\d{4}-\d{5}$/.test(accountId)) throw httpError(400, 'Enter a valid resident account ID.');

  const target = await pool.query(
    `SELECT u.id FROM users u
     WHERE u.role = 'user' AND COALESCE(u.is_archived, FALSE) = FALSE
       AND ${ACCOUNT_ID_SQL} = $1
     LIMIT 1`,
    [accountId],
  );
  const inviteeId = Number(target.rows[0]?.id);
  if (!inviteeId) throw httpError(404, 'Resident account ID not found.');
  if (inviteeId === inviterId) throw httpError(400, 'You cannot invite your own account.');

  const existing = await pool.query(
    `SELECT id, status FROM family_invitations
     WHERE (inviter_id = $1 AND invitee_id = $2) OR (inviter_id = $2 AND invitee_id = $1)
     ORDER BY created_at DESC LIMIT 1`,
    [inviterId, inviteeId],
  );
  if (existing.rows[0]?.status === 'pending') throw httpError(409, 'A family invitation is already pending.');
  if (existing.rows[0]?.status === 'accepted') throw httpError(409, 'This resident is already in your family list.');

  const result = await pool.query(
    `INSERT INTO family_invitations (inviter_id, invitee_id, status)
     VALUES ($1, $2, 'pending')
     ON CONFLICT (inviter_id, invitee_id) DO UPDATE
       SET status = 'pending', created_at = NOW(), responded_at = NULL
     RETURNING id`,
    [inviterId, inviteeId],
  );
  return { id: Number(result.rows[0].id), message: 'Family invitation sent.' };
}

async function respond(actor, invitationIdValue, statusValue) {
  const inviteeId = requireResident(actor);
  const invitationId = Number(invitationIdValue);
  const status = String(statusValue || '').toLowerCase();
  if (!Number.isSafeInteger(invitationId) || invitationId <= 0) throw httpError(400, 'Invalid family invitation.');
  if (!['accepted', 'declined'].includes(status)) throw httpError(400, 'Choose accept or decline.');
  const result = await pool.query(
    `UPDATE family_invitations SET status = $1, responded_at = NOW()
     WHERE id = $2 AND invitee_id = $3 AND status = 'pending'
     RETURNING id`,
    [status, invitationId, inviteeId],
  );
  if (!result.rows[0]) throw httpError(404, 'Pending family invitation not found.');
  return { message: status === 'accepted' ? 'Family invitation accepted.' : 'Family invitation declined.' };
}

module.exports = { listInvitations, invite, respond };
