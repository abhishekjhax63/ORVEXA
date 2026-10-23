-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('PATIENT', 'DOCTOR', 'HOSPITAL_ADMIN', 'PHARMACY_PARTNER', 'LAB_PARTNER', 'AMBULANCE_PARTNER', 'INSURANCE_PARTNER', 'PLATFORM_ADMIN');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('FEMALE', 'MALE', 'OTHER', 'UNDISCLOSED');

-- CreateEnum
CREATE TYPE "BloodGroup" AS ENUM ('A_POSITIVE', 'A_NEGATIVE', 'B_POSITIVE', 'B_NEGATIVE', 'AB_POSITIVE', 'AB_NEGATIVE', 'O_POSITIVE', 'O_NEGATIVE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AuthChallengePurpose" AS ENUM ('EMAIL_VERIFICATION', 'LOGIN_OTP', 'PASSWORD_RESET', 'PHONE_VERIFICATION');

-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('TERMS_OF_SERVICE', 'PRIVACY_POLICY', 'DATA_PROCESSING', 'MARKETING_COMMUNICATIONS', 'HEALTH_RECORD_SHARING', 'TELEMEDICINE_DISCLAIMER', 'AI_ASSISTANT_DISCLAIMER');

-- CreateEnum
CREATE TYPE "FamilyRelationship" AS ENUM ('SPOUSE', 'CHILD', 'PARENT', 'SIBLING', 'GUARDIAN', 'OTHER');

-- CreateEnum
CREATE TYPE "VerificationState" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "DataProvenance" AS ENUM ('DEMO_SAMPLE', 'PROVIDER_SUBMITTED', 'PLATFORM_VERIFIED');

-- CreateEnum
CREATE TYPE "VerificationSubjectType" AS ENUM ('HOSPITAL', 'DOCTOR', 'PARTNER_APPLICATION');

-- CreateEnum
CREATE TYPE "VerificationRequestKind" AS ENUM ('INITIAL_VERIFICATION', 'PROFILE_CHANGE');

-- CreateEnum
CREATE TYPE "VerificationRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "FacilityType" AS ENUM ('MULTISPECIALITY_HOSPITAL', 'SPECIALTY_HOSPITAL', 'CLINIC', 'DAYCARE_CENTER', 'NURSING_HOME', 'DIAGNOSTIC_CENTER');

-- CreateEnum
CREATE TYPE "PriceBand" AS ENUM ('UNPUBLISHED', 'BUDGET', 'MID_RANGE', 'PREMIUM');

-- CreateEnum
CREATE TYPE "ServiceCategory" AS ENUM ('EMERGENCY', 'GENERAL_MEDICINE', 'CARDIOLOGY', 'ORTHOPAEDICS', 'ONCOLOGY', 'MATERNITY', 'PAEDIATRICS', 'NEUROLOGY', 'DIAGNOSTICS', 'PHARMACY', 'TELEMEDICINE', 'DENTAL', 'OPHTHALMOLOGY', 'MENTAL_HEALTH', 'OTHER');

-- CreateEnum
CREATE TYPE "FacilityCategory" AS ENUM ('ICU', 'OPERATION_THEATRE', 'MRI', 'CT_SCAN', 'XRAY', 'LABORATORY', 'DIALYSIS', 'MATERNITY_WARD', 'NEONATAL_ICU', 'PHARMACY', 'BLOOD_BANK', 'AMBULANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "InsuranceNetworkStatus" AS ENUM ('CLAIMED_BY_PROVIDER', 'VERIFIED_BY_PLATFORM');

-- CreateEnum
CREATE TYPE "HospitalMemberStatus" AS ENUM ('INVITED', 'ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "ConsultationMode" AS ENUM ('IN_PERSON', 'TELEMEDICINE');

-- CreateEnum
CREATE TYPE "SlotStatus" AS ENUM ('OPEN', 'BOOKED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "CancelledBy" AS ENUM ('PATIENT', 'PROVIDER', 'PLATFORM', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AppointmentEventType" AS ENUM ('CREATED', 'CONFIRMED', 'RESCHEDULED', 'CANCELLED', 'COMPLETED', 'NO_SHOW', 'NOTES_UPDATED', 'REMINDER_QUEUED');

-- CreateEnum
CREATE TYPE "ReminderChannel" AS ENUM ('EMAIL', 'SMS', 'WHATSAPP', 'IN_APP');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PartnerType" AS ENUM ('PHARMACY', 'LABORATORY', 'AMBULANCE', 'INSURANCE', 'DIAGNOSTIC_CENTER');

-- CreateEnum
CREATE TYPE "PartnerApplicationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "AuditOutcome" AS ENUM ('SUCCESS', 'DENIED', 'FAILURE');

-- CreateEnum
CREATE TYPE "AmbulanceUnitStatus" AS ENUM ('UNKNOWN', 'AVAILABLE', 'ON_DUTY', 'OFFLINE', 'OUT_OF_SERVICE');

-- CreateEnum
CREATE TYPE "EmergencyIncidentType" AS ENUM ('ROAD_ACCIDENT', 'CARDIAC', 'STROKE', 'BREATHING_DIFFICULTY', 'TRAUMA_FALL', 'BURNS', 'PREGNANCY', 'POISONING', 'SEVERE_ALLERGIC_REACTION', 'MENTAL_HEALTH_CRISIS', 'OTHER');

-- CreateEnum
CREATE TYPE "EmergencyIncidentStatus" AS ENUM ('SEEKING_RESPONDERS', 'ACKNOWLEDGED', 'RESPONDER_ACCEPTED', 'EN_ROUTE', 'ON_SCENE', 'TRANSPORTING', 'RESOLVED', 'CANCELLED', 'EXPIRED', 'UNANSWERED');

-- CreateEnum
CREATE TYPE "EmergencyIncidentEventType" AS ENUM ('CREATED', 'LOCATION_CAPTURED', 'DISPATCH_REQUESTED', 'RESPONDER_ACKNOWLEDGED', 'RESPONDER_ACCEPTED', 'RESPONDER_DECLINED', 'DISPATCH_FAILED', 'RETRY_SCHEDULED', 'CONTACT_NOTIFIED', 'LOCATION_SHARED', 'STATUS_CHANGED', 'CANCELLED', 'RESOLVED', 'EXPIRED', 'NOTE');

-- CreateEnum
CREATE TYPE "EmergencyResponderKind" AS ENUM ('HOSPITAL_EMERGENCY', 'AMBULANCE_PARTNER', 'PARTNER_FACILITY');

-- CreateEnum
CREATE TYPE "EmergencyRequestStatus" AS ENUM ('PENDING', 'DELIVERED', 'ACKNOWLEDGED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "EmergencyRequestChannel" AS ENUM ('EMAIL', 'SMS', 'WEBHOOK', 'MANUAL_CALL');

-- CreateEnum
CREATE TYPE "LocationShareStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerifiedAt" TIMESTAMP(3),
    "phone" TEXT,
    "phoneVerifiedAt" TIMESTAMP(3),
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "passwordChangedAt" TIMESTAMP(3),
    "deactivatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "grantedById" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "reason" TEXT,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "replacedById" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthChallenge" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "purpose" "AuthChallengePurpose" NOT NULL,
    "userId" TEXT,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,

    CONSTRAINT "AuthChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitCounter" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "consentType" "ConsentType" NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailAppointments" BOOLEAN NOT NULL DEFAULT true,
    "emailResults" BOOLEAN NOT NULL DEFAULT true,
    "emailMarketing" BOOLEAN NOT NULL DEFAULT false,
    "smsAppointments" BOOLEAN NOT NULL DEFAULT true,
    "smsReminders" BOOLEAN NOT NULL DEFAULT true,
    "whatsappUpdates" BOOLEAN NOT NULL DEFAULT false,
    "inAppUpdates" BOOLEAN NOT NULL DEFAULT true,
    "quietHoursStart" TEXT,
    "quietHoursEnd" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "gender" "Gender",
    "bloodGroup" "BloodGroup" NOT NULL DEFAULT 'UNKNOWN',
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "preferredLanguage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FamilyMember" (
    "id" TEXT NOT NULL,
    "patientProfileId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "relationship" "FamilyRelationship" NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "gender" "Gender",
    "bloodGroup" "BloodGroup" NOT NULL DEFAULT 'UNKNOWN',
    "canBookAppointments" BOOLEAN NOT NULL DEFAULT false,
    "canViewRecords" BOOLEAN NOT NULL DEFAULT false,
    "canManageProfile" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FamilyMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationRequest" (
    "id" TEXT NOT NULL,
    "subjectType" "VerificationSubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "kind" "VerificationRequestKind" NOT NULL,
    "status" "VerificationRequestStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "requiredFields" TEXT[],
    "requestedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewNotes" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hospital" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "facilityType" "FacilityType" NOT NULL,
    "description" TEXT,
    "registrationNumber" TEXT,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "emergency24x7" BOOLEAN NOT NULL DEFAULT false,
    "ambulanceAvailable" BOOLEAN NOT NULL DEFAULT false,
    "wheelchairAccessible" BOOLEAN NOT NULL DEFAULT false,
    "priceBand" "PriceBand" NOT NULL DEFAULT 'UNPUBLISHED',
    "verificationStatus" "VerificationState" NOT NULL DEFAULT 'UNVERIFIED',
    "verificationNotes" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "dataProvenance" "DataProvenance" NOT NULL DEFAULT 'PROVIDER_SUBMITTED',
    "ownerUserId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Hospital_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalMember" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "position" TEXT,
    "status" "HospitalMemberStatus" NOT NULL DEFAULT 'INVITED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalService" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ServiceCategory" NOT NULL DEFAULT 'OTHER',
    "description" TEXT,
    "priceFromInr" INTEGER,
    "priceToInr" INTEGER,
    "pricePublished" BOOLEAN NOT NULL DEFAULT false,
    "available24x7" BOOLEAN NOT NULL DEFAULT false,
    "verificationStatus" "VerificationState" NOT NULL DEFAULT 'UNVERIFIED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalFacility" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "FacilityCategory" NOT NULL DEFAULT 'OTHER',
    "notes" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "verificationStatus" "VerificationState" NOT NULL DEFAULT 'UNVERIFIED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalFacility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalOpeningHours" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "opensAt" TEXT NOT NULL,
    "closesAt" TEXT NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "is24Hours" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "HospitalOpeningHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalInsuranceNetwork" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "insurerName" TEXT NOT NULL,
    "planNames" TEXT[],
    "status" "InsuranceNetworkStatus" NOT NULL DEFAULT 'CLAIMED_BY_PROVIDER',
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HospitalInsuranceNetwork_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "registrationNumber" TEXT NOT NULL,
    "registrationCouncil" TEXT,
    "headline" TEXT,
    "bio" TEXT,
    "qualifications" TEXT[],
    "specialties" TEXT[],
    "languages" TEXT[],
    "yearsOfExperience" INTEGER,
    "consultationFeeInr" INTEGER,
    "teleconsultFeeInr" INTEGER,
    "teleconsultEnabled" BOOLEAN NOT NULL DEFAULT false,
    "acceptingNewPatients" BOOLEAN NOT NULL DEFAULT true,
    "verificationStatus" "VerificationState" NOT NULL DEFAULT 'UNVERIFIED',
    "verificationNotes" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "dataProvenance" "DataProvenance" NOT NULL DEFAULT 'PROVIDER_SUBMITTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoctorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorAffiliation" (
    "id" TEXT NOT NULL,
    "doctorProfileId" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "designation" TEXT,
    "consultationFeeInr" INTEGER,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DoctorAffiliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorSchedule" (
    "id" TEXT NOT NULL,
    "doctorProfileId" TEXT NOT NULL,
    "hospitalId" TEXT,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "slotMinutes" INTEGER NOT NULL DEFAULT 15,
    "mode" "ConsultationMode" NOT NULL DEFAULT 'IN_PERSON',
    "maxBookings" INTEGER NOT NULL DEFAULT 1,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoctorSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppointmentSlot" (
    "id" TEXT NOT NULL,
    "doctorProfileId" TEXT NOT NULL,
    "hospitalId" TEXT,
    "scheduleId" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "mode" "ConsultationMode" NOT NULL,
    "status" "SlotStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppointmentSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "patientUserId" TEXT NOT NULL,
    "familyMemberId" TEXT,
    "doctorProfileId" TEXT NOT NULL,
    "hospitalId" TEXT,
    "slotId" TEXT,
    "scheduledStart" TIMESTAMP(3) NOT NULL,
    "scheduledEnd" TIMESTAMP(3) NOT NULL,
    "mode" "ConsultationMode" NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "patientNotes" TEXT,
    "providerNotes" TEXT,
    "feeInr" INTEGER,
    "cancelledById" TEXT,
    "cancelledByRole" "CancelledBy",
    "cancellationReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "rescheduledFromId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppointmentEvent" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "type" "AppointmentEventType" NOT NULL,
    "fromStatus" "AppointmentStatus",
    "toStatus" "AppointmentStatus",
    "actorUserId" TEXT,
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppointmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppointmentReminder" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "channel" "ReminderChannel" NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppointmentReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerApplication" (
    "id" TEXT NOT NULL,
    "applicantUserId" TEXT NOT NULL,
    "partnerType" "PartnerType" NOT NULL,
    "organizationName" TEXT NOT NULL,
    "registrationNumber" TEXT,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postalCode" TEXT,
    "website" TEXT,
    "description" TEXT,
    "documentKeys" TEXT[],
    "status" "PartnerApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "reviewNotes" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorLabel" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "outcome" "AuditOutcome" NOT NULL DEFAULT 'SUCCESS',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerFacility" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "partnerType" "PartnerType" NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "emergency24x7" BOOLEAN NOT NULL DEFAULT false,
    "homeDeliveryAvailable" BOOLEAN,
    "homeCollectionAvailable" BOOLEAN,
    "verificationStatus" "VerificationState" NOT NULL DEFAULT 'UNVERIFIED',
    "verificationNotes" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "dataProvenance" "DataProvenance" NOT NULL DEFAULT 'PROVIDER_SUBMITTED',
    "ownerUserId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PartnerFacility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmbulancePartnerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationName" TEXT NOT NULL,
    "registrationNumber" TEXT,
    "contactName" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "contactEmail" TEXT,
    "coverageCities" TEXT[],
    "vehicleSummary" TEXT,
    "verificationStatus" "VerificationState" NOT NULL DEFAULT 'UNVERIFIED',
    "verificationNotes" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "dataProvenance" "DataProvenance" NOT NULL DEFAULT 'PROVIDER_SUBMITTED',
    "acceptingRequests" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AmbulancePartnerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmbulanceUnit" (
    "id" TEXT NOT NULL,
    "ambulancePartnerId" TEXT NOT NULL,
    "callSign" TEXT NOT NULL,
    "vehicleType" TEXT,
    "status" "AmbulanceUnitStatus" NOT NULL DEFAULT 'UNKNOWN',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "lastPingAt" TIMESTAMP(3),
    "availabilitySource" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AmbulanceUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmergencyContact" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "relationship" TEXT,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "canReceiveLocation" BOOLEAN NOT NULL DEFAULT false,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmergencyContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmergencyIncident" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "patientUserId" TEXT,
    "familyMemberId" TEXT,
    "createdById" TEXT NOT NULL,
    "incidentType" "EmergencyIncidentType" NOT NULL,
    "injuryDescription" TEXT,
    "status" "EmergencyIncidentStatus" NOT NULL DEFAULT 'SEEKING_RESPONDERS',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "idempotencyKey" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "accuracyMetres" DOUBLE PRECISION,
    "addressText" TEXT,
    "locality" TEXT,
    "city" TEXT,
    "locationConsentAt" TIMESTAMP(3),
    "contactShareConsent" BOOLEAN NOT NULL DEFAULT false,
    "acknowledgedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastRetryAt" TIMESTAMP(3),
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmergencyIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmergencyIncidentEvent" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "eventType" "EmergencyIncidentEventType" NOT NULL,
    "fromStatus" "EmergencyIncidentStatus",
    "toStatus" "EmergencyIncidentStatus",
    "actorUserId" TEXT,
    "actorLabel" TEXT,
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmergencyIncidentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmergencyDispatchRequest" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "responderKind" "EmergencyResponderKind" NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "hospitalId" TEXT,
    "ambulancePartnerId" TEXT,
    "partnerFacilityId" TEXT,
    "responderLabel" TEXT NOT NULL,
    "status" "EmergencyRequestStatus" NOT NULL DEFAULT 'PENDING',
    "channel" "EmergencyRequestChannel" NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "failureReason" TEXT,
    "distanceMetres" INTEGER,
    "etaMinutes" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmergencyDispatchRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmergencyLocationShare" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "contactId" TEXT,
    "contactLabel" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "LocationShareStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmergencyLocationShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE INDEX "UserRole_role_idx" ON "UserRole"("role");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_userId_role_key" ON "UserRole"("userId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "AuthChallenge_identifier_purpose_idx" ON "AuthChallenge"("identifier", "purpose");

-- CreateIndex
CREATE INDEX "AuthChallenge_expiresAt_idx" ON "AuthChallenge"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "RateLimitCounter_key_key" ON "RateLimitCounter"("key");

-- CreateIndex
CREATE INDEX "RateLimitCounter_expiresAt_idx" ON "RateLimitCounter"("expiresAt");

-- CreateIndex
CREATE INDEX "ConsentRecord_userId_consentType_idx" ON "ConsentRecord"("userId", "consentType");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientProfile_userId_key" ON "PatientProfile"("userId");

-- CreateIndex
CREATE INDEX "PatientProfile_city_idx" ON "PatientProfile"("city");

-- CreateIndex
CREATE INDEX "FamilyMember_patientProfileId_idx" ON "FamilyMember"("patientProfileId");

-- CreateIndex
CREATE INDEX "VerificationRequest_status_subjectType_idx" ON "VerificationRequest"("status", "subjectType");

-- CreateIndex
CREATE INDEX "VerificationRequest_subjectId_subjectType_idx" ON "VerificationRequest"("subjectId", "subjectType");

-- CreateIndex
CREATE UNIQUE INDEX "Hospital_slug_key" ON "Hospital"("slug");

-- CreateIndex
CREATE INDEX "Hospital_city_verificationStatus_idx" ON "Hospital"("city", "verificationStatus");

-- CreateIndex
CREATE INDEX "Hospital_facilityType_verificationStatus_idx" ON "Hospital"("facilityType", "verificationStatus");

-- CreateIndex
CREATE INDEX "Hospital_emergency24x7_idx" ON "Hospital"("emergency24x7");

-- CreateIndex
CREATE INDEX "HospitalMember_userId_status_idx" ON "HospitalMember"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalMember_hospitalId_userId_key" ON "HospitalMember"("hospitalId", "userId");

-- CreateIndex
CREATE INDEX "HospitalService_category_idx" ON "HospitalService"("category");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalService_hospitalId_name_key" ON "HospitalService"("hospitalId", "name");

-- CreateIndex
CREATE INDEX "HospitalFacility_category_idx" ON "HospitalFacility"("category");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalFacility_hospitalId_name_key" ON "HospitalFacility"("hospitalId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalOpeningHours_hospitalId_dayOfWeek_key" ON "HospitalOpeningHours"("hospitalId", "dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalInsuranceNetwork_hospitalId_insurerName_key" ON "HospitalInsuranceNetwork"("hospitalId", "insurerName");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorProfile_userId_key" ON "DoctorProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorProfile_registrationNumber_key" ON "DoctorProfile"("registrationNumber");

-- CreateIndex
CREATE INDEX "DoctorProfile_verificationStatus_acceptingNewPatients_idx" ON "DoctorProfile"("verificationStatus", "acceptingNewPatients");

-- CreateIndex
CREATE INDEX "DoctorProfile_registrationNumber_idx" ON "DoctorProfile"("registrationNumber");

-- CreateIndex
CREATE INDEX "DoctorAffiliation_hospitalId_isActive_idx" ON "DoctorAffiliation"("hospitalId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorAffiliation_doctorProfileId_hospitalId_key" ON "DoctorAffiliation"("doctorProfileId", "hospitalId");

-- CreateIndex
CREATE INDEX "DoctorSchedule_doctorProfileId_dayOfWeek_idx" ON "DoctorSchedule"("doctorProfileId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "DoctorSchedule_hospitalId_idx" ON "DoctorSchedule"("hospitalId");

-- CreateIndex
CREATE INDEX "AppointmentSlot_doctorProfileId_startAt_status_idx" ON "AppointmentSlot"("doctorProfileId", "startAt", "status");

-- CreateIndex
CREATE INDEX "AppointmentSlot_status_startAt_idx" ON "AppointmentSlot"("status", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "AppointmentSlot_doctorProfileId_startAt_key" ON "AppointmentSlot"("doctorProfileId", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_reference_key" ON "Appointment"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_slotId_key" ON "Appointment"("slotId");

-- CreateIndex
CREATE INDEX "Appointment_patientUserId_scheduledStart_idx" ON "Appointment"("patientUserId", "scheduledStart");

-- CreateIndex
CREATE INDEX "Appointment_doctorProfileId_scheduledStart_idx" ON "Appointment"("doctorProfileId", "scheduledStart");

-- CreateIndex
CREATE INDEX "Appointment_status_scheduledStart_idx" ON "Appointment"("status", "scheduledStart");

-- CreateIndex
CREATE INDEX "Appointment_hospitalId_scheduledStart_idx" ON "Appointment"("hospitalId", "scheduledStart");

-- CreateIndex
CREATE INDEX "AppointmentEvent_appointmentId_createdAt_idx" ON "AppointmentEvent"("appointmentId", "createdAt");

-- CreateIndex
CREATE INDEX "AppointmentReminder_status_scheduledFor_idx" ON "AppointmentReminder"("status", "scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "AppointmentReminder_appointmentId_channel_scheduledFor_key" ON "AppointmentReminder"("appointmentId", "channel", "scheduledFor");

-- CreateIndex
CREATE INDEX "PartnerApplication_status_partnerType_idx" ON "PartnerApplication"("status", "partnerType");

-- CreateIndex
CREATE INDEX "PartnerApplication_city_idx" ON "PartnerApplication"("city");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerApplication_applicantUserId_partnerType_organization_key" ON "PartnerApplication"("applicantUserId", "partnerType", "organizationName");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_actorUserId_createdAt_idx" ON "AuditEvent"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_action_createdAt_idx" ON "AuditEvent"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerFacility_slug_key" ON "PartnerFacility"("slug");

-- CreateIndex
CREATE INDEX "PartnerFacility_city_partnerType_verificationStatus_idx" ON "PartnerFacility"("city", "partnerType", "verificationStatus");

-- CreateIndex
CREATE INDEX "PartnerFacility_latitude_longitude_idx" ON "PartnerFacility"("latitude", "longitude");

-- CreateIndex
CREATE UNIQUE INDEX "AmbulancePartnerProfile_userId_key" ON "AmbulancePartnerProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AmbulancePartnerProfile_registrationNumber_key" ON "AmbulancePartnerProfile"("registrationNumber");

-- CreateIndex
CREATE INDEX "AmbulancePartnerProfile_verificationStatus_acceptingRequest_idx" ON "AmbulancePartnerProfile"("verificationStatus", "acceptingRequests");

-- CreateIndex
CREATE INDEX "AmbulancePartnerProfile_coverageCities_idx" ON "AmbulancePartnerProfile"("coverageCities");

-- CreateIndex
CREATE INDEX "AmbulanceUnit_status_lastPingAt_idx" ON "AmbulanceUnit"("status", "lastPingAt");

-- CreateIndex
CREATE UNIQUE INDEX "AmbulanceUnit_ambulancePartnerId_callSign_key" ON "AmbulanceUnit"("ambulancePartnerId", "callSign");

-- CreateIndex
CREATE INDEX "EmergencyContact_ownerUserId_idx" ON "EmergencyContact"("ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "EmergencyIncident_reference_key" ON "EmergencyIncident"("reference");

-- CreateIndex
CREATE INDEX "EmergencyIncident_status_createdAt_idx" ON "EmergencyIncident"("status", "createdAt");

-- CreateIndex
CREATE INDEX "EmergencyIncident_patientUserId_createdAt_idx" ON "EmergencyIncident"("patientUserId", "createdAt");

-- CreateIndex
CREATE INDEX "EmergencyIncident_createdById_createdAt_idx" ON "EmergencyIncident"("createdById", "createdAt");

-- CreateIndex
CREATE INDEX "EmergencyIncident_expiresAt_idx" ON "EmergencyIncident"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmergencyIncident_createdById_idempotencyKey_key" ON "EmergencyIncident"("createdById", "idempotencyKey");

-- CreateIndex
CREATE INDEX "EmergencyIncidentEvent_incidentId_createdAt_idx" ON "EmergencyIncidentEvent"("incidentId", "createdAt");

-- CreateIndex
CREATE INDEX "EmergencyIncidentEvent_actorUserId_createdAt_idx" ON "EmergencyIncidentEvent"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "EmergencyDispatchRequest_incidentId_status_idx" ON "EmergencyDispatchRequest"("incidentId", "status");

-- CreateIndex
CREATE INDEX "EmergencyDispatchRequest_status_lastAttemptAt_idx" ON "EmergencyDispatchRequest"("status", "lastAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmergencyDispatchRequest_incidentId_dedupeKey_key" ON "EmergencyDispatchRequest"("incidentId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "EmergencyLocationShare_tokenHash_key" ON "EmergencyLocationShare"("tokenHash");

-- CreateIndex
CREATE INDEX "EmergencyLocationShare_incidentId_status_idx" ON "EmergencyLocationShare"("incidentId", "status");

-- CreateIndex
CREATE INDEX "EmergencyLocationShare_expiresAt_idx" ON "EmergencyLocationShare"("expiresAt");

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthChallenge" ADD CONSTRAINT "AuthChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientProfile" ADD CONSTRAINT "PatientProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyMember" ADD CONSTRAINT "FamilyMember_patientProfileId_fkey" FOREIGN KEY ("patientProfileId") REFERENCES "PatientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationRequest" ADD CONSTRAINT "VerificationRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationRequest" ADD CONSTRAINT "VerificationRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hospital" ADD CONSTRAINT "Hospital_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalMember" ADD CONSTRAINT "HospitalMember_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalMember" ADD CONSTRAINT "HospitalMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalService" ADD CONSTRAINT "HospitalService_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalFacility" ADD CONSTRAINT "HospitalFacility_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalOpeningHours" ADD CONSTRAINT "HospitalOpeningHours_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalInsuranceNetwork" ADD CONSTRAINT "HospitalInsuranceNetwork_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorProfile" ADD CONSTRAINT "DoctorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorAffiliation" ADD CONSTRAINT "DoctorAffiliation_doctorProfileId_fkey" FOREIGN KEY ("doctorProfileId") REFERENCES "DoctorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorAffiliation" ADD CONSTRAINT "DoctorAffiliation_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorSchedule" ADD CONSTRAINT "DoctorSchedule_doctorProfileId_fkey" FOREIGN KEY ("doctorProfileId") REFERENCES "DoctorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorSchedule" ADD CONSTRAINT "DoctorSchedule_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentSlot" ADD CONSTRAINT "AppointmentSlot_doctorProfileId_fkey" FOREIGN KEY ("doctorProfileId") REFERENCES "DoctorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentSlot" ADD CONSTRAINT "AppointmentSlot_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_patientUserId_fkey" FOREIGN KEY ("patientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_familyMemberId_fkey" FOREIGN KEY ("familyMemberId") REFERENCES "FamilyMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_doctorProfileId_fkey" FOREIGN KEY ("doctorProfileId") REFERENCES "DoctorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "AppointmentSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentEvent" ADD CONSTRAINT "AppointmentEvent_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentEvent" ADD CONSTRAINT "AppointmentEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentReminder" ADD CONSTRAINT "AppointmentReminder_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerApplication" ADD CONSTRAINT "PartnerApplication_applicantUserId_fkey" FOREIGN KEY ("applicantUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerFacility" ADD CONSTRAINT "PartnerFacility_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmbulancePartnerProfile" ADD CONSTRAINT "AmbulancePartnerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmbulanceUnit" ADD CONSTRAINT "AmbulanceUnit_ambulancePartnerId_fkey" FOREIGN KEY ("ambulancePartnerId") REFERENCES "AmbulancePartnerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyContact" ADD CONSTRAINT "EmergencyContact_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyIncident" ADD CONSTRAINT "EmergencyIncident_patientUserId_fkey" FOREIGN KEY ("patientUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyIncident" ADD CONSTRAINT "EmergencyIncident_familyMemberId_fkey" FOREIGN KEY ("familyMemberId") REFERENCES "FamilyMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyIncident" ADD CONSTRAINT "EmergencyIncident_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyIncidentEvent" ADD CONSTRAINT "EmergencyIncidentEvent_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "EmergencyIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyIncidentEvent" ADD CONSTRAINT "EmergencyIncidentEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyDispatchRequest" ADD CONSTRAINT "EmergencyDispatchRequest_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "EmergencyIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyDispatchRequest" ADD CONSTRAINT "EmergencyDispatchRequest_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyDispatchRequest" ADD CONSTRAINT "EmergencyDispatchRequest_ambulancePartnerId_fkey" FOREIGN KEY ("ambulancePartnerId") REFERENCES "AmbulancePartnerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyDispatchRequest" ADD CONSTRAINT "EmergencyDispatchRequest_partnerFacilityId_fkey" FOREIGN KEY ("partnerFacilityId") REFERENCES "PartnerFacility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyLocationShare" ADD CONSTRAINT "EmergencyLocationShare_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "EmergencyIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyLocationShare" ADD CONSTRAINT "EmergencyLocationShare_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "EmergencyContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
