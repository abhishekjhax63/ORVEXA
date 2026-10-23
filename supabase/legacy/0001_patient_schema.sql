-- ---------------------------------------------------------------------------
-- ORVEXA patient platform — initial schema
--
-- Everything a signed-in patient owns lives in a row keyed by `user_id` and is
-- readable only by that patient. RLS is the security boundary: the browser only
-- ever holds the public anon key.
-- ---------------------------------------------------------------------------

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type appointment_mode as enum ('in-person', 'video', 'chat');
create type appointment_status as enum ('confirmed', 'completed', 'cancelled', 'pending');
create type prescription_item_status as enum ('active', 'completed', 'refill-due');
create type health_record_type as enum ('lab-report', 'imaging', 'discharge', 'vaccination', 'invoice');
create type vital_trend as enum ('up', 'down', 'steady');
create type vital_status as enum ('normal', 'watch', 'attention');
create type care_task_type as enum ('medicine', 'test', 'follow-up', 'vaccination');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  phone text,
  date_of_birth date,
  city text,
  blood_group text,
  abha_id text,
  allergies text[] not null default '{}',
  conditions text[] not null default '{}',
  emergency_contact_name text,
  emergency_contact_relation text,
  emergency_contact_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  doctor_name text not null,
  specialty text not null,
  hospital_name text not null,
  mode appointment_mode not null default 'in-person',
  scheduled_at timestamptz not null,
  status appointment_status not null default 'pending',
  location text not null default '',
  fee numeric(10, 2) not null default 0,
  created_at timestamptz not null default now()
);

create table prescriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  issued_by text not null,
  issued_on date not null,
  hospital_name text not null,
  diagnosis text not null default '',
  created_at timestamptz not null default now()
);

create table prescription_items (
  id uuid primary key default gen_random_uuid(),
  prescription_id uuid not null references prescriptions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  dosage text not null,
  duration text not null,
  status prescription_item_status not null default 'active',
  sort_order integer not null default 0
);

create table health_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  type health_record_type not null,
  record_date date not null,
  provider text not null,
  size_kb integer not null default 0,
  shared_with text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table vitals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null,
  value text not null,
  unit text not null default '',
  trend vital_trend not null default 'steady',
  status vital_status not null default 'normal',
  recorded_at timestamptz not null default now(),
  sort_order integer not null default 0
);

create table care_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  detail text not null default '',
  due_label text not null default '',
  type care_task_type not null default 'medicine',
  done boolean not null default false,
  sort_order integer not null default 0
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  body text not null,
  time_label text not null default '',
  unread boolean not null default true,
  created_at timestamptz not null default now()
);

create table family_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  relation text not null,
  age integer,
  blood_group text,
  abha_id text,
  sort_order integer not null default 0
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index appointments_user_id_scheduled_at_idx on appointments (user_id, scheduled_at desc);
create index health_records_user_id_record_date_idx on health_records (user_id, record_date desc);
create index notifications_user_id_created_at_idx on notifications (user_id, created_at desc);
create index prescription_items_prescription_id_idx on prescription_items (prescription_id, sort_order);
create index care_tasks_user_id_sort_order_idx on care_tasks (user_id, sort_order);
create index vitals_user_id_sort_order_idx on vitals (user_id, sort_order);
create index family_members_user_id_sort_order_idx on family_members (user_id, sort_order);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table profiles enable row level security;
alter table appointments enable row level security;
alter table prescriptions enable row level security;
alter table prescription_items enable row level security;
alter table health_records enable row level security;
alter table vitals enable row level security;
alter table care_tasks enable row level security;
alter table notifications enable row level security;
alter table family_members enable row level security;

-- `profiles` is keyed by the auth user id rather than a separate user_id column.
create policy "profiles are readable by owner" on profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "profiles are insertable by owner" on profiles
  for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles are editable by owner" on profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- Every other table shares the same `user_id` ownership rule.
do $$
declare
  target text;
begin
  foreach target in array array[
    'appointments', 'prescriptions', 'prescription_items', 'health_records',
    'vitals', 'care_tasks', 'notifications', 'family_members'
  ]
  loop
    execute format(
      'create policy %I on %I for select to authenticated using ((select auth.uid()) = user_id)',
      target || ' are readable by owner', target
    );
    execute format(
      'create policy %I on %I for insert to authenticated with check ((select auth.uid()) = user_id)',
      target || ' are insertable by owner', target
    );
    execute format(
      'create policy %I on %I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
      target || ' are editable by owner', target
    );
    execute format(
      'create policy %I on %I for delete to authenticated using ((select auth.uid()) = user_id)',
      target || ' are removable by owner', target
    );
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on profiles
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Patient onboarding
--
-- A new account gets a profile row, then a starter care timeline so the
-- dashboard is never an empty shell on first sign-in. The rows are clearly
-- sample data and belong to that user alone.
-- ---------------------------------------------------------------------------

create or replace function seed_patient_data(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prescription_id uuid;
begin
  insert into appointments (user_id, doctor_name, specialty, hospital_name, mode, scheduled_at, status, location, fee)
  values
    (p_user_id, 'Dr. Neha Bhatt', 'Endocrinology', 'Sanjeevani Multi-Speciality Hospital', 'in-person', '2026-10-24 17:45:00+05:30', 'confirmed', 'Indiranagar, Bengaluru', 1100),
    (p_user_id, 'Dr. Karthik Reddy', 'General medicine', 'Sanjeevani Multi-Speciality Hospital', 'video', '2026-10-26 11:00:00+05:30', 'confirmed', 'ORVEXA video consultation', 600),
    (p_user_id, 'Dr. Sameer Joshi', 'ENT surgery', 'Trinetra Eye & ENT Institute', 'in-person', '2026-11-02 12:30:00+05:30', 'pending', 'Adyar, Chennai', 900),
    (p_user_id, 'Dr. Ananya Rao', 'Interventional cardiology', 'Aarogya Heart Institute', 'in-person', '2026-09-18 18:30:00+05:30', 'completed', 'Bandra West, Mumbai', 1200),
    (p_user_id, 'Dr. Sneha Gupta', 'Dermatology', 'Anantam Cancer Care Centre', 'video', '2026-08-29 20:00:00+05:30', 'cancelled', 'ORVEXA video consultation', 850);

  insert into prescriptions (user_id, issued_by, issued_on, hospital_name, diagnosis)
  values (p_user_id, 'Dr. Neha Bhatt', '2026-10-18', 'Sanjeevani Multi-Speciality Hospital', 'Sub-clinical hypothyroidism with vitamin D insufficiency')
  returning id into v_prescription_id;

  insert into prescription_items (prescription_id, user_id, name, dosage, duration, status, sort_order)
  values
    (v_prescription_id, p_user_id, 'Thyronorm 25 mcg', '1 tablet, empty stomach', '90 days', 'active', 0),
    (v_prescription_id, p_user_id, 'Vitamin D3 60,000 IU', '1 capsule weekly', '8 weeks', 'active', 1),
    (v_prescription_id, p_user_id, 'Iron + Folic Acid', '1 tablet after dinner', '60 days', 'refill-due', 2);

  insert into prescriptions (user_id, issued_by, issued_on, hospital_name, diagnosis)
  values (p_user_id, 'Dr. Arjun Deshmukh', '2026-09-06', 'Prana Critical Care Hospital', 'Seasonal allergic rhinitis')
  returning id into v_prescription_id;

  insert into prescription_items (prescription_id, user_id, name, dosage, duration, status, sort_order)
  values
    (v_prescription_id, p_user_id, 'Montelukast 10 mg', '1 tablet at bedtime', '30 days', 'completed', 0),
    (v_prescription_id, p_user_id, 'Budesonide nasal spray', '2 puffs each nostril', '30 days', 'completed', 1);

  insert into prescriptions (user_id, issued_by, issued_on, hospital_name, diagnosis)
  values (p_user_id, 'Dr. Karthik Reddy', '2026-07-22', 'Sanjeevani Multi-Speciality Hospital', 'Acute viral fever with dehydration')
  returning id into v_prescription_id;

  insert into prescription_items (prescription_id, user_id, name, dosage, duration, status, sort_order)
  values
    (v_prescription_id, p_user_id, 'Paracetamol 650 mg', '1 tablet every 8 hours', '5 days', 'completed', 0),
    (v_prescription_id, p_user_id, 'ORS sachets', '1 sachet in 1 L water', '3 days', 'completed', 1);

  insert into health_records (user_id, title, type, record_date, provider, size_kb, shared_with)
  values
    (p_user_id, 'Thyroid & vitamin panel', 'lab-report', '2026-10-18', 'ORVEXA partner lab — Indiranagar', 842, array['Dr. Neha Bhatt']),
    (p_user_id, '2D echocardiogram report', 'imaging', '2026-09-18', 'Aarogya Heart Institute', 5120, array['Dr. Ananya Rao']),
    (p_user_id, 'Lipid profile — fasting', 'lab-report', '2026-09-18', 'Aarogya Heart Institute', 612, array['Dr. Ananya Rao', 'Dr. Neha Bhatt']),
    (p_user_id, 'Day-care procedure discharge summary', 'discharge', '2026-06-11', 'Sparsh Orthopaedic & Spine Centre', 1480, '{}'),
    (p_user_id, 'Influenza vaccination', 'vaccination', '2026-05-04', 'ORVEXA preventive care', 96, '{}'),
    (p_user_id, 'Consultation invoice — cardiology', 'invoice', '2026-09-18', 'Aarogya Heart Institute', 210, array['Bharat Assure']);

  insert into vitals (user_id, label, value, unit, trend, status, recorded_at, sort_order)
  values
    (p_user_id, 'Blood pressure', '128/84', 'mmHg', 'down', 'watch', '2026-10-18 09:10:00+05:30', 0),
    (p_user_id, 'Resting heart rate', '72', 'bpm', 'steady', 'normal', '2026-10-18 09:10:00+05:30', 1),
    (p_user_id, 'Fasting glucose', '104', 'mg/dL', 'up', 'watch', '2026-10-18 09:10:00+05:30', 2),
    (p_user_id, 'BMI', '24.6', 'kg/m²', 'steady', 'normal', '2026-10-18 09:10:00+05:30', 3),
    (p_user_id, 'Vitamin D', '18', 'ng/mL', 'up', 'attention', '2026-10-18 09:10:00+05:30', 4);

  insert into care_tasks (user_id, title, detail, due_label, type, done, sort_order)
  values
    (p_user_id, 'Take Thyronorm 25 mcg', 'Empty stomach, 30 minutes before breakfast', 'Today, 7:30 AM', 'medicine', true, 0),
    (p_user_id, 'Log morning blood pressure', 'Target under 130/85 mmHg', 'Today, 8:00 AM', 'medicine', false, 1),
    (p_user_id, 'Repeat vitamin D test', 'Fasting not required, home collection booked', '28 Oct 2026', 'test', false, 2),
    (p_user_id, 'Video follow-up with Dr. Karthik Reddy', 'Review BP log and medicine adherence', '26 Oct 2026, 11:00 AM', 'follow-up', false, 3),
    (p_user_id, 'Influenza booster', 'Annual shot, recommended before monsoon', 'Due in 12 days', 'vaccination', false, 4);

  insert into notifications (user_id, title, body, time_label, unread)
  values
    (p_user_id, 'Report ready', 'Your thyroid and vitamin panel report is available in records.', '2 hours ago', true),
    (p_user_id, 'Appointment confirmed', 'Dr. Neha Bhatt, tomorrow at 5:45 PM, Indiranagar.', 'Yesterday', true),
    (p_user_id, 'Refill due', 'Iron + Folic Acid runs out in 4 days. Order from MediCare in one tap.', '2 days ago', false),
    (p_user_id, 'Claim update', 'Pre-authorisation approved for ₹24,000 by Bharat Assure.', '5 days ago', false);

  insert into family_members (user_id, name, relation, age, blood_group, abha_id, sort_order)
  values
    (p_user_id, 'Self', 'Self', null, null, null, 0);
end;
$$;

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, full_name, phone, date_of_birth, city)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.raw_user_meta_data ->> 'phone',
    nullif(new.raw_user_meta_data ->> 'date_of_birth', '')::date,
    new.raw_user_meta_data ->> 'city'
  )
  on conflict (id) do nothing;

  perform seed_patient_data(new.id);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
