import HistoryRecordsPanel from '../../components/HistoryRecordsPanel';
import BarangayShell from '../components/BarangayShell';

type Props = {
  barangayName: string;
  onLogout: () => void;
  onAuthError: () => void;
  onOpenDashboard: () => void;
  onOpenMonitoring: () => void;
  onOpenFloodMonitoring: () => void;
  onOpenEvacuationCenter: () => void;
  onOpenAccount: () => void;
  onOpenHistory: () => void;
};

export default function HistoryPage(props: Props) {
  return (
    <BarangayShell {...props} activeView="history" title="History" subtitle={`Complete operational records for Barangay ${props.barangayName}`}>
      <HistoryRecordsPanel scopeLabel={`Barangay ${props.barangayName}`} onAuthError={props.onAuthError} />
    </BarangayShell>
  );
}
