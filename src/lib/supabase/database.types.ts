/**
 * Typed mirror of the `public` schema created by
 * `supabase/migrations/0001_patient_schema.sql`.
 *
 * Kept in the shape the Supabase CLI generates so it can be replaced by
 * `supabase gen types typescript --linked > src/lib/supabase/database.types.ts`
 * without touching any call site.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type AppointmentMode = "in-person" | "video" | "chat";
type AppointmentStatus = "confirmed" | "completed" | "cancelled" | "pending";
type PrescriptionItemStatus = "active" | "completed" | "refill-due";
type HealthRecordType = "lab-report" | "imaging" | "discharge" | "vaccination" | "invoice";
type VitalTrend = "up" | "down" | "steady";
type VitalStatus = "normal" | "watch" | "attention";
type CareTaskType = "medicine" | "test" | "follow-up" | "vaccination";

export type ProfileRow = {
  id: string;
  full_name: string;
  phone: string | null;
  date_of_birth: string | null;
  city: string | null;
  blood_group: string | null;
  abha_id: string | null;
  allergies: string[];
  conditions: string[];
  emergency_contact_name: string | null;
  emergency_contact_relation: string | null;
  emergency_contact_phone: string | null;
  created_at: string;
  updated_at: string;
};

export type AppointmentRow = {
  id: string;
  user_id: string;
  doctor_name: string;
  specialty: string;
  hospital_name: string;
  mode: AppointmentMode;
  scheduled_at: string;
  status: AppointmentStatus;
  location: string;
  fee: number;
  created_at: string;
};

export type PrescriptionRow = {
  id: string;
  user_id: string;
  issued_by: string;
  issued_on: string;
  hospital_name: string;
  diagnosis: string;
  created_at: string;
};

export type PrescriptionItemRow = {
  id: string;
  prescription_id: string;
  user_id: string;
  name: string;
  dosage: string;
  duration: string;
  status: PrescriptionItemStatus;
  sort_order: number;
};

export type HealthRecordRow = {
  id: string;
  user_id: string;
  title: string;
  type: HealthRecordType;
  record_date: string;
  provider: string;
  size_kb: number;
  shared_with: string[];
  created_at: string;
};

export type VitalRow = {
  id: string;
  user_id: string;
  label: string;
  value: string;
  unit: string;
  trend: VitalTrend;
  status: VitalStatus;
  recorded_at: string;
  sort_order: number;
};

export type CareTaskRow = {
  id: string;
  user_id: string;
  title: string;
  detail: string;
  due_label: string;
  type: CareTaskType;
  done: boolean;
  sort_order: number;
};

export type NotificationRow = {
  id: string;
  user_id: string;
  title: string;
  body: string;
  time_label: string;
  unread: boolean;
  created_at: string;
};

export type FamilyMemberRow = {
  id: string;
  user_id: string;
  name: string;
  relation: string;
  age: number;
  blood_group: string;
  abha_id: string;
  sort_order: number;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Partial<Omit<ProfileRow, "id">> & { id: string };
        Update: Partial<Omit<ProfileRow, "id" | "created_at">>;
        Relationships: [];
      };
      appointments: {
        Row: AppointmentRow;
        Insert: Partial<Omit<AppointmentRow, "id" | "created_at">> & { user_id: string };
        Update: Partial<Omit<AppointmentRow, "id" | "user_id" | "created_at">>;
        Relationships: [];
      };
      prescriptions: {
        Row: PrescriptionRow;
        Insert: Partial<Omit<PrescriptionRow, "id" | "created_at">> & { user_id: string };
        Update: Partial<Omit<PrescriptionRow, "id" | "user_id" | "created_at">>;
        Relationships: [];
      };
      prescription_items: {
        Row: PrescriptionItemRow;
        Insert: Partial<Omit<PrescriptionItemRow, "id">> & { prescription_id: string; user_id: string };
        Update: Partial<Omit<PrescriptionItemRow, "id" | "prescription_id" | "user_id">>;
        Relationships: [];
      };
      health_records: {
        Row: HealthRecordRow;
        Insert: Partial<Omit<HealthRecordRow, "id" | "created_at">> & { user_id: string };
        Update: Partial<Omit<HealthRecordRow, "id" | "user_id" | "created_at">>;
        Relationships: [];
      };
      vitals: {
        Row: VitalRow;
        Insert: Partial<Omit<VitalRow, "id">> & { user_id: string };
        Update: Partial<Omit<VitalRow, "id" | "user_id">>;
        Relationships: [];
      };
      care_tasks: {
        Row: CareTaskRow;
        Insert: Partial<Omit<CareTaskRow, "id">> & { user_id: string };
        Update: Partial<Omit<CareTaskRow, "id" | "user_id">>;
        Relationships: [];
      };
      notifications: {
        Row: NotificationRow;
        Insert: Partial<Omit<NotificationRow, "id" | "created_at">> & { user_id: string };
        Update: Partial<Omit<NotificationRow, "id" | "user_id" | "created_at">>;
        Relationships: [];
      };
      family_members: {
        Row: FamilyMemberRow;
        Insert: Partial<Omit<FamilyMemberRow, "id">> & { user_id: string };
        Update: Partial<Omit<FamilyMemberRow, "id" | "user_id">>;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: {
      appointment_mode: AppointmentMode;
      appointment_status: AppointmentStatus;
      prescription_item_status: PrescriptionItemStatus;
      health_record_type: HealthRecordType;
      vital_trend: VitalTrend;
      vital_status: VitalStatus;
      care_task_type: CareTaskType;
    };
    CompositeTypes: Record<never, never>;
  };
};
