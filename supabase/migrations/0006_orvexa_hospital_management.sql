-- ORVEXA Phase 9 — multi-hospital management system.
--
-- Additive migration: it extends the existing schema with the hospital
-- management tables (modules 1-12) and adds a nullable "AuditEvent"."hospitalId"
-- so tenant-scoped audit reads are possible without a join. No existing column,
-- index or row is dropped.
--
-- Tenant model: every operational row carries "hospitalId" and every query is
-- scoped by it. "HospitalMember" is the membership record that maps a platform
-- user to one hospital and one HospitalStaffRole; the service layer resolves the
-- caller's hospital from that table and never from the request body.
--
-- Money is stored in integer paise. Clinical facts (diagnoses, notes, triage
-- levels, report verification) are only ever written by a named staff member;
-- nothing in this schema lets the platform author a clinical fact by itself.
--
-- There is no "live bed availability" column. "Bed"."status" is operational
-- data that a staff member sets, and the dashboard labels it as such.

-- CreateEnum
CREATE TYPE "HospitalStaffRole" AS ENUM ('HOSPITAL_ADMIN', 'DOCTOR', 'NURSE', 'RECEPTIONIST', 'PHARMACIST', 'LAB_STAFF', 'IMAGING_TECHNICIAN', 'BILLING_STAFF', 'WARD_COORDINATOR', 'EMERGENCY_STAFF');

-- CreateEnum
CREATE TYPE "ShiftType" AS ENUM ('MORNING', 'EVENING', 'NIGHT', 'GENERAL', 'ON_CALL');

-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OpdPriority" AS ENUM ('ROUTINE', 'URGENT', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "OpdVisitStatus" AS ENUM ('WAITING', 'CALLED', 'IN_CONSULTATION', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "OpdVisitEventType" AS ENUM ('REGISTERED', 'QUEUED', 'CALLED', 'CONSULTATION_STARTED', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'PRIORITY_CHANGED', 'NOTE');

-- CreateEnum
CREATE TYPE "WardType" AS ENUM ('GENERAL', 'PRIVATE', 'SEMI_PRIVATE', 'ICU', 'HDU', 'NICU', 'MATERNITY', 'PAEDIATRIC', 'ISOLATION', 'EMERGENCY', 'OTHER');

-- CreateEnum
CREATE TYPE "BedStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'RESERVED', 'CLEANING', 'MAINTENANCE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "AdmissionType" AS ENUM ('ELECTIVE', 'EMERGENCY', 'DAY_CARE', 'MATERNITY', 'TRANSFER_IN');

-- CreateEnum
CREATE TYPE "AdmissionStatus" AS ENUM ('ADMITTED', 'DISCHARGE_REQUESTED', 'DISCHARGED', 'TRANSFERRED_OUT', 'DECEASED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BedTransferStatus" AS ENUM ('REQUESTED', 'APPROVED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MedicalRecordEntryType" AS ENUM ('NOTE', 'VITALS', 'DIAGNOSIS', 'PROCEDURE', 'ALLERGY', 'IMMUNISATION', 'OBSERVATION', 'DISCHARGE_SUMMARY', 'OPERATIVE_NOTE');

-- CreateEnum
CREATE TYPE "DiagnosisType" AS ENUM ('PROVISIONAL', 'FINAL', 'DIFFERENTIAL', 'RULE_OUT');

-- CreateEnum
CREATE TYPE "DiagnosisCertainty" AS ENUM ('SUSPECTED', 'LIKELY', 'CONFIRMED', 'RULED_OUT');

-- CreateEnum
CREATE TYPE "HospitalPrescriptionStatus" AS ENUM ('DRAFT', 'ISSUED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HospitalLabOrderStatus" AS ENUM ('ORDERED', 'COLLECTED', 'IN_PROGRESS', 'RESULTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HospitalLabOrderPriority" AS ENUM ('ROUTINE', 'URGENT', 'STAT');

-- CreateEnum
CREATE TYPE "ImagingModality" AS ENUM ('XRAY', 'CT', 'MRI', 'ULTRASOUND', 'MAMMOGRAPHY', 'FLUOROSCOPY', 'PET', 'OTHER');

-- CreateEnum
CREATE TYPE "ImagingReferralStatus" AS ENUM ('REFERRED', 'SCHEDULED', 'PERFORMED', 'REPORTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HospitalStockItemKind" AS ENUM ('MEDICINE', 'CONSUMABLE', 'EQUIPMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('RECEIPT', 'DISPENSE', 'ADJUSTMENT', 'RETURN', 'EXPIRY_WRITE_OFF', 'TRANSFER_OUT', 'TRANSFER_IN');

-- CreateEnum
CREATE TYPE "HospitalDispenseStatus" AS ENUM ('PENDING', 'DISPENSED', 'PARTIALLY_DISPENSED', 'RETURNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HospitalStockAlertType" AS ENUM ('LOW_STOCK', 'OUT_OF_STOCK', 'NEAR_EXPIRY', 'EXPIRED');

-- CreateEnum
CREATE TYPE "HospitalStockAlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ChargeCategory" AS ENUM ('CONSULTATION', 'PROCEDURE', 'SURGERY', 'ROOM', 'NURSING', 'LABORATORY', 'IMAGING', 'PHARMACY', 'EQUIPMENT', 'CONSUMABLE', 'OTHER');

-- CreateEnum
CREATE TYPE "HospitalInvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "HospitalPaymentMethod" AS ENUM ('CASH', 'CARD', 'UPI', 'NETBANKING', 'INSURANCE', 'WALLET', 'CHEQUE', 'OTHER');

-- CreateEnum
CREATE TYPE "HospitalRefundStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'PROCESSED');

-- CreateEnum
CREATE TYPE "EmergencyArrivalMode" AS ENUM ('WALK_IN', 'AMBULANCE', 'REFERRAL', 'POLICE', 'OTHER');

-- CreateEnum
CREATE TYPE "TriageLevel" AS ENUM ('RED', 'ORANGE', 'YELLOW', 'GREEN', 'BLUE');

-- CreateEnum
CREATE TYPE "EmergencyEpisodeStatus" AS ENUM ('TRIAGE', 'WAITING', 'IN_TREATMENT', 'ADMITTED', 'DISCHARGED', 'TRANSFERRED', 'DECEASED', 'LEFT_WITHOUT_TREATMENT');

-- CreateEnum
CREATE TYPE "HospitalAssetStatus" AS ENUM ('OPERATIONAL', 'UNDER_MAINTENANCE', 'OUT_OF_SERVICE', 'RETIRED');

-- CreateEnum
CREATE TYPE "AssetMaintenanceType" AS ENUM ('PREVENTIVE', 'CORRECTIVE', 'CALIBRATION', 'INSPECTION');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FeedbackCategory" AS ENUM ('CARE_QUALITY', 'WAITING_TIME', 'STAFF_BEHAVIOUR', 'CLEANLINESS', 'BILLING', 'FACILITIES', 'PHARMACY', 'LABORATORY', 'OTHER');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('NEW', 'REVIEWED', 'ACTIONED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ComplaintSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'RESOLVED', 'ESCALATED', 'CLOSED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ConsentType" ADD VALUE 'HOSPITAL_TREATMENT_CONSENT';
ALTER TYPE "ConsentType" ADD VALUE 'HOSPITAL_RECORD_SHARING';

-- AlterTable
ALTER TABLE "HospitalMember" ADD COLUMN     "department" TEXT,
ADD COLUMN     "joinedAt" TIMESTAMP(3),
ADD COLUMN     "staffNumber" TEXT,
ADD COLUMN     "staffRole" "HospitalStaffRole";

-- AlterTable
ALTER TABLE "AuditEvent" ADD COLUMN     "hospitalId" TEXT;

-- CreateTable
CREATE TABLE "HospitalPatient" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "mrn" TEXT NOT NULL,
    "userId" TEXT,
    "fullName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "approximateAgeYears" INTEGER,
    "gender" "Gender",
    "bloodGroup" "BloodGroup",
    "phone" TEXT,
    "email" TEXT,
    "addressLine1" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "nationalIdLast4" TEXT,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "allergies" TEXT[],
    "chronicConditions" TEXT[],
    "registrationSource" TEXT,
    "registeredById" TEXT,
    "notes" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "HospitalPatient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpdDepartment" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpdDepartment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpdVisit" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "doctorProfileId" TEXT,
    "appointmentId" TEXT,
    "tokenNumber" INTEGER NOT NULL,
    "priority" "OpdPriority" NOT NULL DEFAULT 'ROUTINE',
    "status" "OpdVisitStatus" NOT NULL DEFAULT 'WAITING',
    "chiefComplaint" TEXT,
    "registeredById" TEXT,
    "registeredByName" TEXT,
    "consultationFeePaise" INTEGER,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "calledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "notes" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpdVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpdVisitEvent" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "type" "OpdVisitEventType" NOT NULL,
    "fromStatus" "OpdVisitStatus",
    "toStatus" "OpdVisitStatus",
    "actorUserId" TEXT,
    "actorRole" "HospitalStaffRole",
    "actorLabel" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpdVisitEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ward" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "wardType" "WardType" NOT NULL DEFAULT 'GENERAL',
    "floor" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bed" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "wardId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "BedStatus" NOT NULL DEFAULT 'AVAILABLE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "statusChangedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Admission" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "admissionNumber" TEXT NOT NULL,
    "admissionType" "AdmissionType" NOT NULL DEFAULT 'ELECTIVE',
    "status" "AdmissionStatus" NOT NULL DEFAULT 'ADMITTED',
    "wardId" TEXT,
    "bedId" TEXT,
    "admittingDoctorProfileId" TEXT,
    "attendingMemberId" TEXT,
    "reasonForAdmission" TEXT,
    "primaryDiagnosis" TEXT,
    "admittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "admittedById" TEXT,
    "dischargeRequestedAt" TIMESTAMP(3),
    "dischargeRequestedById" TEXT,
    "dischargedAt" TIMESTAMP(3),
    "dischargedById" TEXT,
    "dischargeType" TEXT,
    "dischargeSummary" TEXT,
    "followUpInstructions" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Admission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BedTransfer" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "fromBedId" TEXT,
    "toBedId" TEXT NOT NULL,
    "fromWardId" TEXT,
    "toWardId" TEXT NOT NULL,
    "reason" TEXT,
    "status" "BedTransferStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedById" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BedTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalShift" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "wardId" TEXT,
    "departmentId" TEXT,
    "shiftType" "ShiftType" NOT NULL DEFAULT 'GENERAL',
    "status" "ShiftStatus" NOT NULL DEFAULT 'SCHEDULED',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "assignedById" TEXT,
    "notes" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NursingAssignment" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "shiftId" TEXT,
    "assignedById" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NursingAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicalRecordEntry" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "opdVisitId" TEXT,
    "admissionId" TEXT,
    "entryType" "MedicalRecordEntryType" NOT NULL,
    "title" TEXT,
    "body" TEXT,
    "structured" JSONB,
    "recordedById" TEXT NOT NULL,
    "recordedByName" TEXT,
    "recordedByRole" "HospitalStaffRole",
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amendedFromId" TEXT,
    "amendmentReason" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicalRecordEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Diagnosis" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "opdVisitId" TEXT,
    "admissionId" TEXT,
    "code" TEXT,
    "description" TEXT NOT NULL,
    "diagnosisType" "DiagnosisType" NOT NULL DEFAULT 'PROVISIONAL',
    "certainty" "DiagnosisCertainty" NOT NULL DEFAULT 'SUSPECTED',
    "diagnosedById" TEXT NOT NULL,
    "diagnosedByName" TEXT,
    "diagnosedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Diagnosis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VitalSignsObservation" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "admissionId" TEXT,
    "opdVisitId" TEXT,
    "temperatureC" DOUBLE PRECISION,
    "pulseBpm" INTEGER,
    "respiratoryRate" INTEGER,
    "systolicBp" INTEGER,
    "diastolicBp" INTEGER,
    "spo2Percent" INTEGER,
    "painScore" INTEGER,
    "weightKg" DOUBLE PRECISION,
    "heightCm" DOUBLE PRECISION,
    "notes" TEXT,
    "recordedById" TEXT NOT NULL,
    "recordedByName" TEXT,
    "recordedByRole" "HospitalStaffRole",
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VitalSignsObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalPrescription" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "opdVisitId" TEXT,
    "admissionId" TEXT,
    "status" "HospitalPrescriptionStatus" NOT NULL DEFAULT 'DRAFT',
    "prescriberUserId" TEXT NOT NULL,
    "prescriberName" TEXT,
    "prescriberRegistration" TEXT,
    "issuedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "notes" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalPrescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalPrescriptionItem" (
    "id" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "medicineName" TEXT NOT NULL,
    "dosageForm" TEXT,
    "strength" TEXT,
    "route" TEXT,
    "frequency" TEXT,
    "durationDays" INTEGER,
    "quantity" TEXT,
    "instructions" TEXT,
    "isControlled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HospitalPrescriptionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalLabOrder" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "opdVisitId" TEXT,
    "admissionId" TEXT,
    "priority" "HospitalLabOrderPriority" NOT NULL DEFAULT 'ROUTINE',
    "status" "HospitalLabOrderStatus" NOT NULL DEFAULT 'ORDERED',
    "clinicalNotes" TEXT,
    "orderedById" TEXT NOT NULL,
    "orderedByName" TEXT,
    "orderedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "collectedAt" TIMESTAMP(3),
    "resultedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalLabOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalLabOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "testCode" TEXT,
    "testName" TEXT NOT NULL,
    "specimen" TEXT,
    "status" "HospitalLabOrderStatus" NOT NULL DEFAULT 'ORDERED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalLabOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalLabResult" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "analyteName" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "unit" TEXT,
    "referenceRange" TEXT,
    "flag" "LabResultFlag" NOT NULL DEFAULT 'UNKNOWN',
    "resultedById" TEXT NOT NULL,
    "resultedByName" TEXT,
    "resultedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedById" TEXT,
    "verifiedByName" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HospitalLabResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImagingReferral" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "modality" "ImagingModality" NOT NULL,
    "bodyPart" TEXT NOT NULL,
    "clinicalIndication" TEXT,
    "priority" "HospitalLabOrderPriority" NOT NULL DEFAULT 'ROUTINE',
    "status" "ImagingReferralStatus" NOT NULL DEFAULT 'REFERRED',
    "referredById" TEXT NOT NULL,
    "referredByName" TEXT,
    "referredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduledAt" TIMESTAMP(3),
    "performedAt" TIMESTAMP(3),
    "reportedAt" TIMESTAMP(3),
    "reportText" TEXT,
    "impression" TEXT,
    "reportedById" TEXT,
    "reportedByName" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImagingReferral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalPharmacyUnit" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "location" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalPharmacyUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalStockItem" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "pharmacyUnitId" TEXT,
    "supplierId" TEXT,
    "itemKind" "HospitalStockItemKind" NOT NULL DEFAULT 'MEDICINE',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'unit',
    "dosageForm" TEXT,
    "strengthLabel" TEXT,
    "batchNumber" TEXT,
    "expiryDate" TIMESTAMP(3),
    "quantityOnHand" INTEGER NOT NULL DEFAULT 0,
    "reorderLevel" INTEGER NOT NULL DEFAULT 0,
    "unitCostPaise" INTEGER,
    "sellingPricePaise" INTEGER,
    "taxRateBp" INTEGER NOT NULL DEFAULT 0,
    "location" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalStockItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalStockMovement" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "stockItemId" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantityDelta" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "reason" TEXT,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "performedById" TEXT NOT NULL,
    "performedByName" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "HospitalStockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalStockAlert" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "stockItemId" TEXT NOT NULL,
    "type" "HospitalStockAlertType" NOT NULL,
    "status" "HospitalStockAlertStatus" NOT NULL DEFAULT 'OPEN',
    "detail" TEXT,
    "threshold" INTEGER,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedById" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalStockAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalDispense" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "pharmacyUnitId" TEXT,
    "patientId" TEXT NOT NULL,
    "admissionId" TEXT,
    "prescriptionId" TEXT,
    "reference" TEXT NOT NULL,
    "status" "HospitalDispenseStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "dispensedById" TEXT,
    "dispensedByName" TEXT,
    "dispensedAt" TIMESTAMP(3),
    "notes" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalDispense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalDispenseItem" (
    "id" TEXT NOT NULL,
    "dispenseId" TEXT NOT NULL,
    "stockItemId" TEXT NOT NULL,
    "nameSnapshot" TEXT NOT NULL,
    "batchNumber" TEXT,
    "expiryDate" TIMESTAMP(3),
    "quantity" INTEGER NOT NULL,
    "unitPricePaise" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HospitalDispenseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalChargeItem" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ChargeCategory" NOT NULL DEFAULT 'OTHER',
    "description" TEXT,
    "unitPricePaise" INTEGER NOT NULL,
    "taxRateBp" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalChargeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalInvoice" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "admissionId" TEXT,
    "opdVisitId" TEXT,
    "invoiceNumber" TEXT NOT NULL,
    "status" "HospitalInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "subtotalPaise" INTEGER NOT NULL DEFAULT 0,
    "discountPaise" INTEGER NOT NULL DEFAULT 0,
    "taxPaise" INTEGER NOT NULL DEFAULT 0,
    "totalPaise" INTEGER NOT NULL DEFAULT 0,
    "amountPaidPaise" INTEGER NOT NULL DEFAULT 0,
    "balancePaise" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "issuedById" TEXT,
    "issuedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalInvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "chargeItemId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPricePaise" INTEGER NOT NULL,
    "taxRateBp" INTEGER NOT NULL DEFAULT 0,
    "taxPaise" INTEGER NOT NULL DEFAULT 0,
    "lineTotalPaise" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HospitalInvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalPayment" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "method" "HospitalPaymentMethod" NOT NULL,
    "reference" TEXT,
    "receivedById" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HospitalPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalRefund" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "paymentId" TEXT,
    "amountPaise" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "HospitalRefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "notes" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalRefund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmergencyIntake" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "patientId" TEXT,
    "reference" TEXT NOT NULL,
    "arrivalMode" "EmergencyArrivalMode" NOT NULL DEFAULT 'WALK_IN',
    "triageLevel" "TriageLevel",
    "status" "EmergencyEpisodeStatus" NOT NULL DEFAULT 'TRIAGE',
    "chiefComplaint" TEXT,
    "arrivalNotes" TEXT,
    "dispatchRequestId" TEXT,
    "ambulanceUnitLabel" TEXT,
    "arrivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "triagedById" TEXT,
    "triagedAt" TIMESTAMP(3),
    "disposition" TEXT,
    "admittedToId" TEXT,
    "closedAt" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmergencyIntake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalSupplier" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactPerson" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "gstin" TEXT,
    "addressLine1" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalSupplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalAsset" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "assetTag" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "manufacturer" TEXT,
    "modelNumber" TEXT,
    "serialNumber" TEXT,
    "location" TEXT,
    "status" "HospitalAssetStatus" NOT NULL DEFAULT 'OPERATIONAL',
    "purchasedAt" TIMESTAMP(3),
    "warrantyUntil" TIMESTAMP(3),
    "lastServicedAt" TIMESTAMP(3),
    "nextServiceDueAt" TIMESTAMP(3),
    "notes" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalAssetMaintenance" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "type" "AssetMaintenanceType" NOT NULL DEFAULT 'PREVENTIVE',
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "performedById" TEXT,
    "performedByName" TEXT,
    "costPaise" INTEGER,
    "notes" TEXT,
    "nextDueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HospitalAssetMaintenance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalPurchaseOrder" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "totalPaise" INTEGER NOT NULL DEFAULT 0,
    "orderedById" TEXT,
    "orderedAt" TIMESTAMP(3),
    "expectedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "notes" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalPurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalPurchaseOrderItem" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "itemKind" "HospitalStockItemKind" NOT NULL DEFAULT 'MEDICINE',
    "description" TEXT NOT NULL,
    "stockItemId" TEXT,
    "quantity" INTEGER NOT NULL,
    "receivedQuantity" INTEGER NOT NULL DEFAULT 0,
    "unitCostPaise" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HospitalPurchaseOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientFeedback" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "patientId" TEXT,
    "admissionId" TEXT,
    "opdVisitId" TEXT,
    "submittedByUserId" TEXT,
    "category" "FeedbackCategory" NOT NULL DEFAULT 'CARE_QUALITY',
    "rating" INTEGER,
    "comment" TEXT,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'NEW',
    "responseText" TEXT,
    "respondedById" TEXT,
    "respondedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Complaint" (
    "id" TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "patientId" TEXT,
    "category" "FeedbackCategory" NOT NULL DEFAULT 'OTHER',
    "severity" "ComplaintSeverity" NOT NULL DEFAULT 'LOW',
    "subject" TEXT NOT NULL,
    "description" TEXT,
    "status" "ComplaintStatus" NOT NULL DEFAULT 'OPEN',
    "raisedByUserId" TEXT,
    "raisedByName" TEXT,
    "assignedToMemberId" TEXT,
    "resolutionNotes" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Complaint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplaintUpdate" (
    "id" TEXT NOT NULL,
    "complaintId" TEXT NOT NULL,
    "authorMemberId" TEXT,
    "authorLabel" TEXT,
    "status" "ComplaintStatus",
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplaintUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HospitalPatient_hospitalId_fullName_idx" ON "HospitalPatient"("hospitalId", "fullName");

-- CreateIndex
CREATE INDEX "HospitalPatient_hospitalId_phone_idx" ON "HospitalPatient"("hospitalId", "phone");

-- CreateIndex
CREATE INDEX "HospitalPatient_userId_idx" ON "HospitalPatient"("userId");

-- CreateIndex
CREATE INDEX "HospitalPatient_hospitalId_createdAt_idx" ON "HospitalPatient"("hospitalId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalPatient_hospitalId_mrn_key" ON "HospitalPatient"("hospitalId", "mrn");

-- CreateIndex
CREATE INDEX "OpdDepartment_hospitalId_isActive_idx" ON "OpdDepartment"("hospitalId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "OpdDepartment_hospitalId_code_key" ON "OpdDepartment"("hospitalId", "code");

-- CreateIndex
CREATE INDEX "OpdVisit_hospitalId_status_priority_registeredAt_idx" ON "OpdVisit"("hospitalId", "status", "priority", "registeredAt");

-- CreateIndex
CREATE INDEX "OpdVisit_hospitalId_departmentId_status_idx" ON "OpdVisit"("hospitalId", "departmentId", "status");

-- CreateIndex
CREATE INDEX "OpdVisit_patientId_idx" ON "OpdVisit"("patientId");

-- CreateIndex
CREATE INDEX "OpdVisitEvent_visitId_createdAt_idx" ON "OpdVisitEvent"("visitId", "createdAt");

-- CreateIndex
CREATE INDEX "Ward_hospitalId_isActive_idx" ON "Ward"("hospitalId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Ward_hospitalId_code_key" ON "Ward"("hospitalId", "code");

-- CreateIndex
CREATE INDEX "Bed_hospitalId_status_idx" ON "Bed"("hospitalId", "status");

-- CreateIndex
CREATE INDEX "Bed_hospitalId_wardId_status_idx" ON "Bed"("hospitalId", "wardId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Bed_wardId_code_key" ON "Bed"("wardId", "code");

-- CreateIndex
CREATE INDEX "Admission_hospitalId_status_admittedAt_idx" ON "Admission"("hospitalId", "status", "admittedAt");

-- CreateIndex
CREATE INDEX "Admission_patientId_idx" ON "Admission"("patientId");

-- CreateIndex
CREATE INDEX "Admission_bedId_idx" ON "Admission"("bedId");

-- CreateIndex
CREATE UNIQUE INDEX "Admission_hospitalId_admissionNumber_key" ON "Admission"("hospitalId", "admissionNumber");

-- CreateIndex
CREATE INDEX "BedTransfer_hospitalId_status_idx" ON "BedTransfer"("hospitalId", "status");

-- CreateIndex
CREATE INDEX "BedTransfer_admissionId_createdAt_idx" ON "BedTransfer"("admissionId", "createdAt");

-- CreateIndex
CREATE INDEX "HospitalShift_hospitalId_startsAt_idx" ON "HospitalShift"("hospitalId", "startsAt");

-- CreateIndex
CREATE INDEX "HospitalShift_memberId_startsAt_idx" ON "HospitalShift"("memberId", "startsAt");

-- CreateIndex
CREATE INDEX "HospitalShift_hospitalId_wardId_startsAt_idx" ON "HospitalShift"("hospitalId", "wardId", "startsAt");

-- CreateIndex
CREATE INDEX "NursingAssignment_hospitalId_isActive_idx" ON "NursingAssignment"("hospitalId", "isActive");

-- CreateIndex
CREATE INDEX "NursingAssignment_admissionId_isActive_idx" ON "NursingAssignment"("admissionId", "isActive");

-- CreateIndex
CREATE INDEX "NursingAssignment_memberId_startsAt_idx" ON "NursingAssignment"("memberId", "startsAt");

-- CreateIndex
CREATE INDEX "MedicalRecordEntry_hospitalId_patientId_recordedAt_idx" ON "MedicalRecordEntry"("hospitalId", "patientId", "recordedAt");

-- CreateIndex
CREATE INDEX "MedicalRecordEntry_hospitalId_entryType_recordedAt_idx" ON "MedicalRecordEntry"("hospitalId", "entryType", "recordedAt");

-- CreateIndex
CREATE INDEX "MedicalRecordEntry_admissionId_idx" ON "MedicalRecordEntry"("admissionId");

-- CreateIndex
CREATE INDEX "Diagnosis_hospitalId_patientId_idx" ON "Diagnosis"("hospitalId", "patientId");

-- CreateIndex
CREATE INDEX "Diagnosis_hospitalId_code_idx" ON "Diagnosis"("hospitalId", "code");

-- CreateIndex
CREATE INDEX "VitalSignsObservation_hospitalId_patientId_recordedAt_idx" ON "VitalSignsObservation"("hospitalId", "patientId", "recordedAt");

-- CreateIndex
CREATE INDEX "VitalSignsObservation_admissionId_idx" ON "VitalSignsObservation"("admissionId");

-- CreateIndex
CREATE INDEX "HospitalPrescription_hospitalId_patientId_issuedAt_idx" ON "HospitalPrescription"("hospitalId", "patientId", "issuedAt");

-- CreateIndex
CREATE INDEX "HospitalPrescription_hospitalId_status_idx" ON "HospitalPrescription"("hospitalId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalPrescription_hospitalId_reference_key" ON "HospitalPrescription"("hospitalId", "reference");

-- CreateIndex
CREATE INDEX "HospitalPrescriptionItem_prescriptionId_idx" ON "HospitalPrescriptionItem"("prescriptionId");

-- CreateIndex
CREATE INDEX "HospitalLabOrder_hospitalId_status_orderedAt_idx" ON "HospitalLabOrder"("hospitalId", "status", "orderedAt");

-- CreateIndex
CREATE INDEX "HospitalLabOrder_patientId_idx" ON "HospitalLabOrder"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalLabOrder_hospitalId_reference_key" ON "HospitalLabOrder"("hospitalId", "reference");

-- CreateIndex
CREATE INDEX "HospitalLabOrderItem_orderId_idx" ON "HospitalLabOrderItem"("orderId");

-- CreateIndex
CREATE INDEX "HospitalLabResult_hospitalId_orderItemId_idx" ON "HospitalLabResult"("hospitalId", "orderItemId");

-- CreateIndex
CREATE INDEX "ImagingReferral_hospitalId_status_referredAt_idx" ON "ImagingReferral"("hospitalId", "status", "referredAt");

-- CreateIndex
CREATE INDEX "ImagingReferral_patientId_idx" ON "ImagingReferral"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "ImagingReferral_hospitalId_reference_key" ON "ImagingReferral"("hospitalId", "reference");

-- CreateIndex
CREATE INDEX "HospitalPharmacyUnit_hospitalId_isActive_idx" ON "HospitalPharmacyUnit"("hospitalId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalPharmacyUnit_hospitalId_code_key" ON "HospitalPharmacyUnit"("hospitalId", "code");

-- CreateIndex
CREATE INDEX "HospitalStockItem_hospitalId_itemKind_isActive_idx" ON "HospitalStockItem"("hospitalId", "itemKind", "isActive");

-- CreateIndex
CREATE INDEX "HospitalStockItem_hospitalId_expiryDate_idx" ON "HospitalStockItem"("hospitalId", "expiryDate");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalStockItem_hospitalId_code_key" ON "HospitalStockItem"("hospitalId", "code");

-- CreateIndex
CREATE INDEX "HospitalStockMovement_hospitalId_stockItemId_occurredAt_idx" ON "HospitalStockMovement"("hospitalId", "stockItemId", "occurredAt");

-- CreateIndex
CREATE INDEX "HospitalStockMovement_hospitalId_type_occurredAt_idx" ON "HospitalStockMovement"("hospitalId", "type", "occurredAt");

-- CreateIndex
CREATE INDEX "HospitalStockAlert_hospitalId_status_type_idx" ON "HospitalStockAlert"("hospitalId", "status", "type");

-- CreateIndex
CREATE INDEX "HospitalStockAlert_stockItemId_status_idx" ON "HospitalStockAlert"("stockItemId", "status");

-- CreateIndex
CREATE INDEX "HospitalDispense_hospitalId_status_createdAt_idx" ON "HospitalDispense"("hospitalId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "HospitalDispense_patientId_idx" ON "HospitalDispense"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalDispense_hospitalId_reference_key" ON "HospitalDispense"("hospitalId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalDispense_hospitalId_idempotencyKey_key" ON "HospitalDispense"("hospitalId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "HospitalDispenseItem_stockItemId_idx" ON "HospitalDispenseItem"("stockItemId");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalDispenseItem_dispenseId_stockItemId_key" ON "HospitalDispenseItem"("dispenseId", "stockItemId");

-- CreateIndex
CREATE INDEX "HospitalChargeItem_hospitalId_category_isActive_idx" ON "HospitalChargeItem"("hospitalId", "category", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalChargeItem_hospitalId_code_key" ON "HospitalChargeItem"("hospitalId", "code");

-- CreateIndex
CREATE INDEX "HospitalInvoice_hospitalId_status_issuedAt_idx" ON "HospitalInvoice"("hospitalId", "status", "issuedAt");

-- CreateIndex
CREATE INDEX "HospitalInvoice_patientId_idx" ON "HospitalInvoice"("patientId");

-- CreateIndex
CREATE INDEX "HospitalInvoice_admissionId_idx" ON "HospitalInvoice"("admissionId");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalInvoice_hospitalId_invoiceNumber_key" ON "HospitalInvoice"("hospitalId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "HospitalInvoiceLine_invoiceId_idx" ON "HospitalInvoiceLine"("invoiceId");

-- CreateIndex
CREATE INDEX "HospitalPayment_invoiceId_receivedAt_idx" ON "HospitalPayment"("invoiceId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalPayment_hospitalId_receiptNumber_key" ON "HospitalPayment"("hospitalId", "receiptNumber");

-- CreateIndex
CREATE INDEX "HospitalRefund_hospitalId_status_idx" ON "HospitalRefund"("hospitalId", "status");

-- CreateIndex
CREATE INDEX "HospitalRefund_invoiceId_idx" ON "HospitalRefund"("invoiceId");

-- CreateIndex
CREATE INDEX "EmergencyIntake_hospitalId_status_arrivedAt_idx" ON "EmergencyIntake"("hospitalId", "status", "arrivedAt");

-- CreateIndex
CREATE INDEX "EmergencyIntake_hospitalId_triageLevel_idx" ON "EmergencyIntake"("hospitalId", "triageLevel");

-- CreateIndex
CREATE UNIQUE INDEX "EmergencyIntake_hospitalId_reference_key" ON "EmergencyIntake"("hospitalId", "reference");

-- CreateIndex
CREATE INDEX "HospitalSupplier_hospitalId_isActive_idx" ON "HospitalSupplier"("hospitalId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalSupplier_hospitalId_name_key" ON "HospitalSupplier"("hospitalId", "name");

-- CreateIndex
CREATE INDEX "HospitalAsset_hospitalId_status_idx" ON "HospitalAsset"("hospitalId", "status");

-- CreateIndex
CREATE INDEX "HospitalAsset_hospitalId_nextServiceDueAt_idx" ON "HospitalAsset"("hospitalId", "nextServiceDueAt");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalAsset_hospitalId_assetTag_key" ON "HospitalAsset"("hospitalId", "assetTag");

-- CreateIndex
CREATE INDEX "HospitalAssetMaintenance_hospitalId_assetId_performedAt_idx" ON "HospitalAssetMaintenance"("hospitalId", "assetId", "performedAt");

-- CreateIndex
CREATE INDEX "HospitalPurchaseOrder_hospitalId_status_createdAt_idx" ON "HospitalPurchaseOrder"("hospitalId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalPurchaseOrder_hospitalId_poNumber_key" ON "HospitalPurchaseOrder"("hospitalId", "poNumber");

-- CreateIndex
CREATE INDEX "HospitalPurchaseOrderItem_purchaseOrderId_idx" ON "HospitalPurchaseOrderItem"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "PatientFeedback_hospitalId_status_submittedAt_idx" ON "PatientFeedback"("hospitalId", "status", "submittedAt");

-- CreateIndex
CREATE INDEX "PatientFeedback_hospitalId_category_idx" ON "PatientFeedback"("hospitalId", "category");

-- CreateIndex
CREATE INDEX "Complaint_hospitalId_status_severity_idx" ON "Complaint"("hospitalId", "status", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "Complaint_hospitalId_reference_key" ON "Complaint"("hospitalId", "reference");

-- CreateIndex
CREATE INDEX "ComplaintUpdate_complaintId_createdAt_idx" ON "ComplaintUpdate"("complaintId", "createdAt");

-- CreateIndex
CREATE INDEX "HospitalMember_hospitalId_staffRole_status_idx" ON "HospitalMember"("hospitalId", "staffRole", "status");

-- CreateIndex
CREATE INDEX "AuditEvent_hospitalId_createdAt_idx" ON "AuditEvent"("hospitalId", "createdAt");

-- AddForeignKey
ALTER TABLE "HospitalPatient" ADD CONSTRAINT "HospitalPatient_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpdDepartment" ADD CONSTRAINT "OpdDepartment_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpdVisit" ADD CONSTRAINT "OpdVisit_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpdVisit" ADD CONSTRAINT "OpdVisit_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "OpdDepartment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpdVisitEvent" ADD CONSTRAINT "OpdVisitEvent_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "OpdVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ward" ADD CONSTRAINT "Ward_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bed" ADD CONSTRAINT "Bed_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bed" ADD CONSTRAINT "Bed_wardId_fkey" FOREIGN KEY ("wardId") REFERENCES "Ward"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_bedId_fkey" FOREIGN KEY ("bedId") REFERENCES "Bed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BedTransfer" ADD CONSTRAINT "BedTransfer_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BedTransfer" ADD CONSTRAINT "BedTransfer_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalShift" ADD CONSTRAINT "HospitalShift_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalShift" ADD CONSTRAINT "HospitalShift_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "HospitalMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NursingAssignment" ADD CONSTRAINT "NursingAssignment_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalRecordEntry" ADD CONSTRAINT "MedicalRecordEntry_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diagnosis" ADD CONSTRAINT "Diagnosis_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VitalSignsObservation" ADD CONSTRAINT "VitalSignsObservation_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalPrescription" ADD CONSTRAINT "HospitalPrescription_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalPrescriptionItem" ADD CONSTRAINT "HospitalPrescriptionItem_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "HospitalPrescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalLabOrder" ADD CONSTRAINT "HospitalLabOrder_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalLabOrderItem" ADD CONSTRAINT "HospitalLabOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "HospitalLabOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalLabResult" ADD CONSTRAINT "HospitalLabResult_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalLabResult" ADD CONSTRAINT "HospitalLabResult_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "HospitalLabOrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImagingReferral" ADD CONSTRAINT "ImagingReferral_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalPharmacyUnit" ADD CONSTRAINT "HospitalPharmacyUnit_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalStockItem" ADD CONSTRAINT "HospitalStockItem_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalStockItem" ADD CONSTRAINT "HospitalStockItem_pharmacyUnitId_fkey" FOREIGN KEY ("pharmacyUnitId") REFERENCES "HospitalPharmacyUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalStockItem" ADD CONSTRAINT "HospitalStockItem_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "HospitalSupplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalStockMovement" ADD CONSTRAINT "HospitalStockMovement_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalStockMovement" ADD CONSTRAINT "HospitalStockMovement_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "HospitalStockItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalStockAlert" ADD CONSTRAINT "HospitalStockAlert_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalStockAlert" ADD CONSTRAINT "HospitalStockAlert_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "HospitalStockItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalDispense" ADD CONSTRAINT "HospitalDispense_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalDispense" ADD CONSTRAINT "HospitalDispense_pharmacyUnitId_fkey" FOREIGN KEY ("pharmacyUnitId") REFERENCES "HospitalPharmacyUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalDispenseItem" ADD CONSTRAINT "HospitalDispenseItem_dispenseId_fkey" FOREIGN KEY ("dispenseId") REFERENCES "HospitalDispense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalDispenseItem" ADD CONSTRAINT "HospitalDispenseItem_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "HospitalStockItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalChargeItem" ADD CONSTRAINT "HospitalChargeItem_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalInvoice" ADD CONSTRAINT "HospitalInvoice_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalInvoiceLine" ADD CONSTRAINT "HospitalInvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "HospitalInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalPayment" ADD CONSTRAINT "HospitalPayment_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalPayment" ADD CONSTRAINT "HospitalPayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "HospitalInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalRefund" ADD CONSTRAINT "HospitalRefund_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalRefund" ADD CONSTRAINT "HospitalRefund_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "HospitalInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyIntake" ADD CONSTRAINT "EmergencyIntake_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalSupplier" ADD CONSTRAINT "HospitalSupplier_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalAsset" ADD CONSTRAINT "HospitalAsset_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalAssetMaintenance" ADD CONSTRAINT "HospitalAssetMaintenance_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalAssetMaintenance" ADD CONSTRAINT "HospitalAssetMaintenance_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "HospitalAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalPurchaseOrder" ADD CONSTRAINT "HospitalPurchaseOrder_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalPurchaseOrder" ADD CONSTRAINT "HospitalPurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "HospitalSupplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalPurchaseOrderItem" ADD CONSTRAINT "HospitalPurchaseOrderItem_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "HospitalPurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientFeedback" ADD CONSTRAINT "PatientFeedback_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintUpdate" ADD CONSTRAINT "ComplaintUpdate_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "Complaint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Guards Prisma's schema language cannot express.
--
-- These are the last line of defence. Every one of them also has a service-layer
-- check that produces a readable error; the index exists so that two concurrent
-- requests racing each other can never both commit.
-- ---------------------------------------------------------------------------

-- One live admission per bed. ADMITTED and DISCHARGE_REQUESTED both still hold
-- the bed, so a patient who has been marked for discharge cannot have their bed
-- handed to somebody else before the discharge is actually completed.
CREATE UNIQUE INDEX "Admission_bedId_active_key"
  ON "Admission" ("bedId")
  WHERE "bedId" IS NOT NULL AND "status" IN ('ADMITTED', 'DISCHARGE_REQUESTED');

-- Stock can never be driven negative. The service checks first and returns a
-- typed error; this makes a negative balance impossible even under a race.
ALTER TABLE "HospitalStockItem"
  ADD CONSTRAINT "HospitalStockItem_quantityOnHand_nonnegative"
  CHECK ("quantityOnHand" >= 0);

-- A movement whose sign disagrees with its type is a bug, not data.
ALTER TABLE "HospitalStockMovement"
  ADD CONSTRAINT "HospitalStockMovement_balanceAfter_nonnegative"
  CHECK ("balanceAfter" >= 0);

-- Money is integer paise and can never be negative on the invoice, payment and
-- refund records. A refund larger than its payment is rejected in the service.
ALTER TABLE "HospitalInvoice"
  ADD CONSTRAINT "HospitalInvoice_amountPaid_nonnegative" CHECK ("amountPaidPaise" >= 0),
  ADD CONSTRAINT "HospitalInvoice_total_nonnegative" CHECK ("totalPaise" >= 0);

ALTER TABLE "HospitalPayment"
  ADD CONSTRAINT "HospitalPayment_amount_positive" CHECK ("amountPaise" > 0);

ALTER TABLE "HospitalRefund"
  ADD CONSTRAINT "HospitalRefund_amount_positive" CHECK ("amountPaise" > 0);

-- One open alert of a given type per stock line. Re-running the expiry or
-- reorder sweep therefore cannot pile up duplicates; it only refreshes the
-- existing alert's detail.
CREATE UNIQUE INDEX "HospitalStockAlert_open_key"
  ON "HospitalStockAlert" ("stockItemId", "type")
  WHERE "status" = 'OPEN';

-- A discharge timestamp with no admitting timestamp, or a completed discharge
-- with no actor, means the transition was applied out of band.
ALTER TABLE "Admission"
  ADD CONSTRAINT "Admission_discharge_after_admission"
  CHECK ("dischargedAt" IS NULL OR "dischargedAt" >= "admittedAt");

-- Triage level is staff-entered clinical judgement. It may be absent, but a
-- triaged emergency episode must record who triaged it.
ALTER TABLE "EmergencyIntake"
  ADD CONSTRAINT "EmergencyIntake_triage_actor"
  CHECK ("triageLevel" IS NULL OR "triagedById" IS NOT NULL);

