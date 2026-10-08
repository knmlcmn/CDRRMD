export const INCIDENT_STATUS_FILTERS = [
  'active',
  'pending',
  'accepted',
  'in_progress',
  'resolved',
  'declined',
] as const;

export type IncidentStatusFilter = (typeof INCIDENT_STATUS_FILTERS)[number];

const INCIDENT_STATUS_LABELS: Record<IncidentStatusFilter, string> = {
  active: 'Active',
  pending: 'Pending Review',
  accepted: 'Response Accepted',
  in_progress: 'Response in Progress',
  resolved: 'Resolved',
  declined: 'Declined',
};

export function formatIncidentStatus(status?: string | null, pickedUp = false) {
  if (pickedUp) return 'Transporting to Evacuation Center';

  const normalizedStatus = String(status || 'pending').trim().toLowerCase();
  if (normalizedStatus in INCIDENT_STATUS_LABELS) {
    return INCIDENT_STATUS_LABELS[normalizedStatus as IncidentStatusFilter];
  }

  return normalizedStatus
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
