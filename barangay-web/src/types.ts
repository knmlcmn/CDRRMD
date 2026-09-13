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

export type IncidentReport = {
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
  created_at: string;
  reporter_id: number;
  first_name?: string | null;
  last_name?: string | null;
  contact_number?: string | null;
  email?: string | null;
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
