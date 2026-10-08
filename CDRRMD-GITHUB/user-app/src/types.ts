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
