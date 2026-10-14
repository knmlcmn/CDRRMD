import type { RescuerAssignment } from '../services/rescuerAssignmentPreview';

type Props = {
  responderLabel: string;
  rescuer: RescuerAssignment | null | undefined;
  loading: boolean;
  onSelect?: () => void;
};

export default function AssignedRescuerField({ responderLabel, rescuer, loading, onSelect }: Props) {
  let value = `No ${responderLabel} available`;
  if (loading) value = `Finding nearest ${responderLabel}…`;
  else if (rescuer) value = `${rescuer.rescuerName} • ${rescuer.barangayName}`;

  return (
    <div>
      <dt>Assigned rescuer</dt>
      <dd>{rescuer && onSelect ? <button type="button" className="rescue-request-detail-button" onClick={onSelect}>{value}</button> : value}</dd>
    </div>
  );
}
