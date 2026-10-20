export type ResponderRole = 'rescuer' | 'barangay_rescuer';

export type Coordinate = { latitude: number; longitude: number };

export type Assignment = {
  backup_request_id: number;
  id: number;
  report_code: string;
  incident_type: string;
  status: string;
  location: string;
  latitude: number;
  longitude: number;
  reported_latitude?: number | null;
  reported_longitude?: number | null;
  resident_location_updated_at?: string | null;
  notes: string | null;
  estimated_people: number | null;
  evacuees_reserved: number;
  assigned_barangay: string;
  evacuation_area_id: number | null;
  evacuation_area_name: string | null;
  evacuation_latitude: number | null;
  evacuation_longitude: number | null;
  reporter_name: string | null;
  reporter_contact: string | null;
  assigned_at: string;
  responder_acknowledged_at: string | null;
  picked_up_at: string | null;
};

export type AssignmentHistory = {
  backup_request_id: number;
  id: number;
  report_code: string;
  incident_type: string;
  status: string;
  location: string;
  assigned_barangay: string;
  evacuation_area_name: string | null;
  reporter_name: string | null;
  assigned_at: string;
  picked_up_at: string | null;
  arrived_at: string;
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
  barangay_name?: string | null;
  is_online: boolean;
  is_self: boolean;
  last_login: string | null;
};

export type FloodReport = {
  id: number;
  report_code: string;
  location: string;
  water_level: string | null;
  status: string;
  assigned_barangay: string | null;
  reporter_name: string | null;
};

export type WaterLevelSensor = {
  id: string;
  barangayName: string;
  status: 'Active' | 'Unavailable';
  distanceCm: number | null;
  waterLevelPercentage: number;
  hasReading: boolean;
  temperatureCelsius: number | null;
  humidityPercentage: number | null;
};
