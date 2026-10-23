-- ORVEXA Phase 3 — booking concurrency guards.
--
-- The application layer books a slot with a conditional UPDATE inside a
-- transaction, which already serialises concurrent claims. These indexes are the
-- database-level backstop that makes double booking impossible even if a future
-- code path forgets the guard.

-- At most one live appointment per doctor and start time. Cancelled and
-- completed appointments are excluded so history is preserved.
CREATE UNIQUE INDEX "Appointment_doctor_scheduledStart_active_key"
  ON "Appointment" ("doctorProfileId", "scheduledStart")
  WHERE "status" IN ('PENDING', 'CONFIRMED');

-- Fast specialty filtering for doctor discovery (Postgres array containment).
CREATE INDEX "DoctorProfile_specialties_gin_idx"
  ON "DoctorProfile" USING GIN ("specialties");

CREATE INDEX "DoctorProfile_languages_gin_idx"
  ON "DoctorProfile" USING GIN ("languages");

-- Hospital discovery lookups (city + facility type + verification state).
CREATE INDEX "Hospital_city_type_verified_idx"
  ON "Hospital" ("city", "facilityType", "verificationStatus");
