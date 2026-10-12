import AdminShell from '../components/AdminShell';
import HistoryRecordsPanel from '../components/HistoryRecordsPanel';

type Props = {
  onLogout: () => void;
  onOpenDashboard: () => void;
  onOpenAdmin: () => void;
  onOpenUsers: () => void;
  onOpenBarangay: () => void;
  onOpenRescuers: () => void;
  onOpenMonitoring: () => void;
  onOpenFloodMonitoring: () => void;
  onOpenEvacuationAreas: () => void;
  onOpenPostUpdates: () => void;
  onOpenHistory: () => void;
  onAuthError: () => void;
};

export default function HistoryPage(props: Props) {
  return (
    <AdminShell {...props} activeView="history" title="History" subtitle="Complete incident, backup request, and hardware water-level records">
      <HistoryRecordsPanel scopeLabel="the CDRRMD administrator" onAuthError={props.onAuthError} />
    </AdminShell>
  );
}
