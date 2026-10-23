-- ORVEXA Phase 3 + 4 — booking concurrency guards and discovery indexes.
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

-- Bounding-box prefilter for "nearby hospitals" map queries. The exact distance
-- is still computed in SQL with the haversine formula; this index only narrows
-- the candidate set so the map does not scan every published facility.
CREATE INDEX "Hospital_latitude_longitude_idx"
  ON "Hospital" ("latitude", "longitude");

