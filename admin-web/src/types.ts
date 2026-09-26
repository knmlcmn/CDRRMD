export type AlertItem = {
  id: number;
  title: string;
  body: string;
  category: string;
  severity: string;
  created_at: string;
};

export type AnnouncementItem = {
  id: number;
  title: string;
  body: string;
  created_at: string;
};

export type EvacuationAreaItem = {
  id: number;
  name: string;
  barangay: string;
  place_type?: string | null;
  address?: string | null;
  latitude: number;
  longitude: number;
  capacity: number;
  evacuees: number;
  available_slots?: number;
  evacuation_status?: 'available' | 'nearly_full' | 'full';
  is_active: boolean;
  created_at: string;
};

export type DashboardIncident = {
  caseId: string;
  type: string;
  requesterName?: string | null;
  location: string;
  latitude?: number | null;
  longitude?: number | null;
  status: string;
  title: string;
  createdAt: string;
  imageBase64?: string | null;
};

export type DashboardSummary = {
  cards: {
    emergencyAlerts: number;
    activeTeams: number;
    evacuationAreas: number;
    totalEvacuees: number;
  };
  incidents: DashboardIncident[];
};

export type AdminAccount = {
  id: number;
  admin_id?: string;
  username: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  address: string | null;
  contact_number: string | null;
  role: string;
  archived_at?: string | null;
  created_at: string;
  is_active: boolean;
  last_login: string | null;
};

export type UserAccount = {
  id: number;
  user_id?: string;
  username: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  address: string | null;
  contact_number: string | null;
  role: string;
  archived_at?: string | null;
  created_at: string;
};

export type BarangayAccount = {
  id: number;
  barangay_id?: string;
  username: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  address: string | null;
  contact_number: string | null;
  role: string;
  barangay_name: string | null;
  archived_at?: string | null;
  created_at: string;
  is_active: boolean;
  last_login: string | null;
};

export type RescuerAccount = {
  id: number;
  rescuer_id: string;
  username: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  address: string | null;
  contact_number: string | null;
  created_at: string;
  last_login: string | null;
  is_online: boolean;
  is_available: boolean;
  archived_at?: string | null;
};

export type BackupRequest = {
  id: number;
  report_id: number;
  barangay_name?: string;
  created_at?: string;
  acknowledged_at: string | null;
  declined_at?: string | null;
  decline_reason?: string | null;
  assigned_rescuer_id: number | null;
  assigned_at: string | null;
  picked_up_at: string | null;
  rescuer_name?: string | null;
  rescuer_account_id?: string | null;
  rescuer_latitude?: number | null;
  rescuer_longitude?: number | null;
  rescuer_location_updated_at?: string | null;
  evacuation_latitude?: number | null;
  evacuation_longitude?: number | null;
};

export type MonitoringReport = {
  id: number;
  report_code: string;
  report_type: 'flood' | 'rescue';
  location: string;
  latitude?: number | null;
  longitude?: number | null;
  incident_type: string;
  water_level?: string | null;
  are_people_trapped?: boolean | null;
  estimated_people?: number | null;
  notes?: string | null;
  image_base64?: string | null;
  status: string;
  evacuation_area_id?: number | null;
  evacuation_area_name?: string | null;
  evacuees_reserved?: number | null;
  assigned_team?: string | null;
  admin_notes?: string | null;
  decline_reason?: string | null;
  decline_explanation?: string | null;
  dispatched_at?: string | null;
  resolved_at?: string | null;
  updated_at?: string | null;
  updated_by?: number | null;
  created_at: string;
  reporter_id: number;
  first_name?: string | null;
  last_name?: string | null;
  contact_number?: string | null;
  email?: string | null;
};

export type IncidentReport = MonitoringReport;

export type BarangayUser = {
  id: number;
  username: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  address: string | null;
  contactNumber: string | null;
  role: string;
  barangayName: string | null;
};
