-- ORVEXA Phase 6 and 7 — pharmacy ordering and health insurance claims.
--
-- Applied after 0001 (schema), 0002 (appointment guards) and 0003 (AI health
-- intelligence). This migration is additive: no existing column, index or row is
-- altered or dropped, so it is safe to run against a database already serving
-- traffic.
--
-- Two consent types are appended to "ConsentType" so releasing an uploaded
-- prescription to a dispensing pharmacy, and submitting policy details to an
-- insurer, are separate revocable decisions rather than a side effect of
-- uploading a file.
--
-- Money is stored in paise ("...Paise" columns) so no clinic, pharmacy or
-- insurer amount is ever held as a floating point number.
--
-- Nothing here fabricates state: there is no seeded insurer, no seeded product,
-- no seeded pharmacy and no sample claim. Every row in the tables below is
-- created by a real actor, and verification columns default to UNVERIFIED.

-- CreateEnum
CREATE TYPE "MedicineDosageForm" AS ENUM ('TABLET', 'CAPSULE', 'SYRUP', 'SUSPENSION', 'SOLUTION', 'INJECTION', 'INFUSION', 'CREAM', 'OINTMENT', 'GEL', 'LOTION', 'DROPS', 'INHALER', 'SPRAY', 'POWDER', 'GRANULES', 'PATCH', 'SUPPOSITORY', 'DEVICE', 'OTHER');

-- CreateEnum
CREATE TYPE "MedicineScheduleClass" AS ENUM ('OTC', 'GENERAL_SCHEDULE_H', 'SCHEDULE_H', 'SCHEDULE_H1', 'SCHEDULE_X', 'NARCOTIC', 'AYURVEDIC_PROPRIETARY', 'RESTRICTED_OTHER');

-- CreateEnum
CREATE TYPE "MedicineStockStatus" AS ENUM ('IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK', 'DISCONTINUED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "MedicineEquivalentRelationship" AS ENUM ('GENERIC_EQUIVALENT', 'SAME_MOLECULE', 'THERAPEUTIC_ALTERNATIVE');

-- CreateEnum
CREATE TYPE "PharmacyInventoryReason" AS ENUM ('RESTOCK', 'SALE', 'ORDER_CANCELLED', 'CORRECTION', 'EXPIRY', 'DAMAGE', 'RETURN', 'RECONCILIATION');

-- CreateEnum
CREATE TYPE "PharmacyCartStatus" AS ENUM ('ACTIVE', 'CONVERTED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "PharmacyOrderStatus" AS ENUM ('PENDING_PAYMENT', 'PAYMENT_CONFIRMED', 'PRESCRIPTION_REVIEW', 'ACCEPTED', 'PACKED', 'DISPATCHED', 'DELIVERED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PharmacyOrderEventType" AS ENUM ('CREATED', 'PAYMENT_INITIATED', 'PAYMENT_FAILED', 'PAYMENT_CONFIRMED', 'PRESCRIPTION_REQUIRED', 'PRESCRIPTION_APPROVED', 'PRESCRIPTION_REJECTED', 'ORDER_ACCEPTED', 'ORDER_REJECTED', 'PACKED', 'DISPATCHED', 'DELIVERED', 'CANCELLED', 'REFUND_INITIATED', 'REFUND_COMPLETED', 'NOTE');

-- CreateEnum
CREATE TYPE "PaymentProviderKind" AS ENUM ('SANDBOX', 'RAZORPAY');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('CREATED', 'PENDING', 'REQUIRES_ACTION', 'AUTHORISED', 'CAPTURED', 'FAILED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('REQUESTED', 'PROCESSING', 'PROCESSED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentWebhookStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED');

-- CreateEnum
CREATE TYPE "PrescriptionSource" AS ENUM ('UPLOADED', 'PLATFORM_CLINICIAN');

-- CreateEnum
CREATE TYPE "PrescriptionStatus" AS ENUM ('UPLOADED', 'UNDER_REVIEW', 'CLARIFICATION_REQUESTED', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'EXPIRED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "PrescriptionDocumentKind" AS ENUM ('SCAN', 'PHOTO', 'PDF');

-- CreateEnum
CREATE TYPE "PrescriptionDocumentStatus" AS ENUM ('PENDING', 'READY', 'REJECTED', 'DELETED');

-- CreateEnum
CREATE TYPE "InsurerIntegrationMode" AS ENUM ('API', 'PARTNER_PORTAL', 'MANUAL_OFFLINE', 'NONE');

-- CreateEnum
CREATE TYPE "InsuranceCoverType" AS ENUM ('INDIVIDUAL', 'FAMILY_FLOATER', 'GROUP_EMPLOYER', 'SENIOR_CITIZEN', 'MATERNITY', 'CRITICAL_ILLNESS', 'TOP_UP', 'SUPER_TOP_UP', 'PERSONAL_ACCIDENT', 'OTHER');

-- CreateEnum
CREATE TYPE "InsuranceProductSource" AS ENUM ('INSURER_PUBLISHED', 'INSURER_API', 'PARTNER_CONFIRMED', 'PLATFORM_UNVERIFIED');

-- CreateEnum
CREATE TYPE "NetworkEntrySource" AS ENUM ('INSURER_LIST', 'INSURER_API', 'PARTNER_CONFIRMED', 'HOSPITAL_DECLARED', 'PLATFORM_UNVERIFIED');

-- CreateEnum
CREATE TYPE "PolicyStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED', 'SUSPENDED', 'LAPSED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "PolicyVerificationSource" AS ENUM ('SELF_DECLARED', 'DOCUMENT_REVIEWED', 'INSURER_CONFIRMED', 'PARTNER_CONFIRMED');

-- CreateEnum
CREATE TYPE "InsuranceDocumentStatus" AS ENUM ('PENDING', 'READY', 'REJECTED', 'DELETED');

-- CreateEnum
CREATE TYPE "InsurancePolicyDocumentKind" AS ENUM ('POLICY_SCHEDULE', 'CERTIFICATE', 'PREMIUM_RECEIPT', 'ENDORSEMENT', 'ID_PROOF', 'OTHER');

-- CreateEnum
CREATE TYPE "ClaimType" AS ENUM ('CASHLESS_PRE_AUTHORIZATION', 'CASHLESS', 'REIMBURSEMENT');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'ACKNOWLEDGED', 'AWAITING_INFORMATION', 'UNDER_REVIEW', 'PRE_AUTH_PENDING', 'PRE_AUTH_APPROVED', 'PRE_AUTH_PARTIALLY_APPROVED', 'PRE_AUTH_REJECTED', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'SETTLED', 'CLOSED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ClaimDecision" AS ENUM ('PENDING', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'QUERY_RAISED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ClaimDocumentKind" AS ENUM ('POLICY_COPY', 'INSURED_ID_PROOF', 'HOSPITAL_ESTIMATE', 'PRE_AUTH_FORM', 'DISCHARGE_SUMMARY', 'INVESTIGATION_REPORT', 'PRESCRIPTION', 'HOSPITAL_INVOICE', 'PAYMENT_PROOF', 'INSURER_CORRESPONDENCE', 'OTHER');

-- CreateEnum
CREATE TYPE "ClaimQueryStatus" AS ENUM ('OPEN', 'RESPONDED', 'CLOSED', 'OVERDUE');

-- CreateEnum
CREATE TYPE "PreAuthStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'ACKNOWLEDGED', 'QUERY_RAISED', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'EXPIRED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "EligibilityCheckStatus" AS ENUM ('REQUESTED', 'ACKNOWLEDGED', 'RESPONDED', 'NOT_SUPPORTED', 'FAILED');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'SETTLED', 'PARTIALLY_SETTLED', 'FAILED');

-- CreateEnum
CREATE TYPE "ClaimEventType" AS ENUM ('CREATED', 'SUBMITTED', 'ACKNOWLEDGED', 'ASSIGNED', 'INFORMATION_REQUESTED', 'QUERY_RAISED', 'QUERY_RESPONDED', 'DECISION_RECORDED', 'STATUS_CHANGED', 'SETTLEMENT_RECORDED', 'WITHDRAWN', 'DOCUMENT_ADDED', 'DOCUMENT_REMOVED', 'NOTE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ConsentType" ADD VALUE IF NOT EXISTS 'PHARMACY_PRESCRIPTION_SHARING';
ALTER TYPE "ConsentType" ADD VALUE IF NOT EXISTS 'INSURANCE_DATA_SHARING';

-- CreateTable
CREATE TABLE "PharmacyPartnerProfile" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "facilityId" TEXT,
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT,
    "drugLicenceNumber" TEXT,
    "drugLicenceType" TEXT,
    "drugLicenceAuthority" TEXT,
    "drugLicenceExpiresAt" TIMESTAMP(3),
    "gstin" TEXT,
    "pharmacistName" TEXT,
    "pharmacistRegistrationNumber" TEXT,
    "pharmacistRegistrationCouncil" TEXT,
    "canDispensePrescriptionMedicines" BOOLEAN NOT NULL DEFAULT false,
    "canDispenseControlledMedicines" BOOLEAN NOT NULL DEFAULT false,
    "homeDeliveryAvailable" BOOLEAN NOT NULL DEFAULT false,
    "deliveryRadiusKm" INTEGER,
    "complianceAcknowledgedAt" TIMESTAMP(3),
    "compliancePolicyVersion" TEXT,
    "status" "PartnerApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "verificationStatus" "VerificationState" NOT NULL DEFAULT 'UNVERIFIED',
    "verificationNotes" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "dataProvenance" "DataProvenance" NOT NULL DEFAULT 'PROVIDER_SUBMITTED',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PharmacyPartnerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicineProduct" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "brandName" TEXT NOT NULL,
    "genericName" TEXT NOT NULL,
    "strengthLabel" TEXT NOT NULL,
    "dosageForm" "MedicineDosageForm" NOT NULL,
    "packSizeLabel" TEXT NOT NULL,
    "unitsPerPack" INTEGER,
    "manufacturer" TEXT,
    "manufacturerCountry" TEXT,
    "drugCode" TEXT,
    "scheduleClass" "MedicineScheduleClass" NOT NULL DEFAULT 'GENERAL_SCHEDULE_H',
    "prescriptionRequired" BOOLEAN NOT NULL DEFAULT true,
    "isControlled" BOOLEAN NOT NULL DEFAULT false,
    "listable" BOOLEAN NOT NULL DEFAULT true,
    "nonListableReason" TEXT,
    "categorySlug" TEXT NOT NULL,
    "description" TEXT,
    "usesSummary" TEXT,
    "commonSideEffects" TEXT,
    "storageNotes" TEXT,
    "warnings" TEXT,
    "imageUrl" TEXT,
    "verificationStatus" "VerificationState" NOT NULL DEFAULT 'UNVERIFIED',
    "verifiedAt" TIMESTAMP(3),
    "dataProvenance" "DataProvenance" NOT NULL DEFAULT 'PROVIDER_SUBMITTED',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MedicineProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicineEquivalent" (
    "id" TEXT NOT NULL,
    "sourceProductId" TEXT NOT NULL,
    "relatedProductId" TEXT NOT NULL,
    "relationship" "MedicineEquivalentRelationship" NOT NULL,
    "note" TEXT,
    "verificationStatus" "VerificationState" NOT NULL DEFAULT 'UNVERIFIED',
    "reviewedAt" TIMESTAMP(3),
    "dataProvenance" "DataProvenance" NOT NULL DEFAULT 'PROVIDER_SUBMITTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicineEquivalent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacyOffer" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "pharmacyProfileId" TEXT NOT NULL,
    "priceInPaise" INTEGER NOT NULL,
    "mrpInPaise" INTEGER,
    "pricePublished" BOOLEAN NOT NULL DEFAULT false,
    "taxRateBps" INTEGER,
    "stockStatus" "MedicineStockStatus" NOT NULL DEFAULT 'UNKNOWN',
    "stockQuantity" INTEGER,
    "lowStockThreshold" INTEGER NOT NULL DEFAULT 10,
    "restockEtaDays" INTEGER,
    "deliveryEtaMinutes" INTEGER,
    "maxPerOrder" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "verificationStatus" "VerificationState" NOT NULL DEFAULT 'UNVERIFIED',
    "verifiedAt" TIMESTAMP(3),
    "dataProvenance" "DataProvenance" NOT NULL DEFAULT 'PROVIDER_SUBMITTED',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PharmacyOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacyInventoryEntry" (
    "id" TEXT NOT NULL,
    "pharmacyProfileId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "reason" "PharmacyInventoryReason" NOT NULL,
    "note" TEXT,
    "orderId" TEXT,
    "actorUserId" TEXT,
    "actorLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PharmacyInventoryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacyCart" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "status" "PharmacyCartStatus" NOT NULL DEFAULT 'ACTIVE',
    "convertedOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PharmacyCart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacyCartItem" (
    "id" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PharmacyCartItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientAddress" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "landmark" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PatientAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacyOrder" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "customerUserId" TEXT NOT NULL,
    "pharmacyProfileId" TEXT NOT NULL,
    "status" "PharmacyOrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "deliveryRecipientName" TEXT NOT NULL,
    "deliveryPhone" TEXT NOT NULL,
    "deliveryLine1" TEXT NOT NULL,
    "deliveryLine2" TEXT,
    "deliveryLandmark" TEXT,
    "deliveryCity" TEXT NOT NULL,
    "deliveryState" TEXT NOT NULL,
    "deliveryPostalCode" TEXT NOT NULL,
    "deliveryLatitude" DOUBLE PRECISION,
    "deliveryLongitude" DOUBLE PRECISION,
    "itemsSubtotalPaise" INTEGER NOT NULL,
    "discountPaise" INTEGER NOT NULL DEFAULT 0,
    "deliveryFeePaise" INTEGER NOT NULL DEFAULT 0,
    "taxPaise" INTEGER NOT NULL DEFAULT 0,
    "totalPaise" INTEGER NOT NULL,
    "discountCode" TEXT,
    "deliveryEstimateMinutes" INTEGER,
    "requiresPrescription" BOOLEAN NOT NULL DEFAULT false,
    "prescriptionId" TEXT,
    "cancellationReason" TEXT,
    "cancelledByLabel" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "paymentDueAt" TIMESTAMP(3),
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "packedAt" TIMESTAMP(3),
    "dispatchedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "deliveryAckReference" TEXT,
    "deliveryPartnerName" TEXT,
    "deliveryTrackingUrl" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "retentionUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PharmacyOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacyOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "offerId" TEXT,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "genericName" TEXT NOT NULL,
    "strengthLabel" TEXT NOT NULL,
    "dosageForm" "MedicineDosageForm" NOT NULL,
    "packSizeLabel" TEXT NOT NULL,
    "manufacturer" TEXT,
    "scheduleClass" "MedicineScheduleClass" NOT NULL,
    "prescriptionRequired" BOOLEAN NOT NULL,
    "isControlled" BOOLEAN NOT NULL,
    "pharmacyName" TEXT NOT NULL,
    "unitPricePaise" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "taxRateBps" INTEGER,
    "lineSubtotalPaise" INTEGER NOT NULL,
    "lineTaxPaise" INTEGER NOT NULL,
    "lineTotalPaise" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PharmacyOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacyOrderEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" "PharmacyOrderEventType" NOT NULL,
    "actorUserId" TEXT,
    "actorRole" "Role",
    "actorLabel" TEXT,
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PharmacyOrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacyPayment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" "PaymentProviderKind" NOT NULL,
    "providerOrderId" TEXT,
    "providerPaymentId" TEXT,
    "providerSignature" TEXT,
    "amountPaise" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "PaymentStatus" NOT NULL DEFAULT 'CREATED',
    "method" TEXT,
    "failureCode" TEXT,
    "failureReason" TEXT,
    "idempotencyKey" TEXT,
    "isSandbox" BOOLEAN NOT NULL DEFAULT true,
    "rawSummary" JSONB,
    "capturedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PharmacyPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacyRefund" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "paymentId" TEXT,
    "provider" "PaymentProviderKind" NOT NULL,
    "providerRefundId" TEXT,
    "amountPaise" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedById" TEXT,
    "requestedByLabel" TEXT,
    "approvedById" TEXT,
    "approvedByLabel" TEXT,
    "failureReason" TEXT,
    "idempotencyKey" TEXT,
    "isSandbox" BOOLEAN NOT NULL DEFAULT true,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PharmacyRefund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentWebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" "PaymentProviderKind" NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "signatureVerified" BOOLEAN NOT NULL DEFAULT false,
    "status" "PaymentWebhookStatus" NOT NULL DEFAULT 'RECEIVED',
    "payload" JSONB,
    "error" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prescription" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "familyMemberId" TEXT,
    "source" "PrescriptionSource" NOT NULL DEFAULT 'UPLOADED',
    "status" "PrescriptionStatus" NOT NULL DEFAULT 'UPLOADED',
    "prescriberName" TEXT,
    "prescriberRegistrationNumber" TEXT,
    "prescriberClinic" TEXT,
    "issuedOn" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "patientNameOnDocument" TEXT,
    "patientNotes" TEXT,
    "reviewNotes" TEXT,
    "reviewedById" TEXT,
    "reviewedByLabel" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "consentAcknowledgedAt" TIMESTAMP(3),
    "consentPolicyVersion" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "retentionUntil" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionDocument" (
    "id" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "kind" "PrescriptionDocumentKind" NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageBucket" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "checksumSha256" TEXT,
    "status" "PrescriptionDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "malwareScan" "AiMalwareScanStatus" NOT NULL DEFAULT 'PENDING',
    "malwareScanDetail" TEXT,
    "rejectionReason" TEXT,
    "retentionUntil" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrescriptionDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionItem" (
    "id" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "productId" TEXT,
    "prescribedName" TEXT NOT NULL,
    "strengthLabel" TEXT,
    "dosageForm" TEXT,
    "frequency" TEXT,
    "durationDays" INTEGER,
    "quantity" INTEGER,
    "instructions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrescriptionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionReviewEvent" (
    "id" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "status" "PrescriptionStatus" NOT NULL,
    "actorUserId" TEXT,
    "actorRole" "Role",
    "actorLabel" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrescriptionReviewEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Insurer" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "irdaiRegistrationNumber" TEXT,
    "regulatorRegisterUrl" TEXT,
    "supportPhone" TEXT,
    "supportEmail" TEXT,
    "website" TEXT,
    "networkListUrl" TEXT,
    "integrationMode" "InsurerIntegrationMode" NOT NULL DEFAULT 'MANUAL_OFFLINE',
    "integrationBaseUrl" TEXT,
    "integrationNotes" TEXT,
    "integrationConfigured" BOOLEAN NOT NULL DEFAULT false,
    "verificationStatus" "VerificationState" NOT NULL DEFAULT 'UNVERIFIED',
    "verificationNotes" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "dataProvenance" "DataProvenance" NOT NULL DEFAULT 'PROVIDER_SUBMITTED',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Insurer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsuranceProduct" (
    "id" TEXT NOT NULL,
    "insurerId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "coverType" "InsuranceCoverType" NOT NULL DEFAULT 'INDIVIDUAL',
    "sumInsuredMinInr" INTEGER,
    "sumInsuredMaxInr" INTEGER,
    "premiumFromInr" INTEGER,
    "roomRentLimitNote" TEXT,
    "coPaymentNote" TEXT,
    "deductibleInr" INTEGER,
    "waitingPeriodNote" TEXT,
    "preExistingWaitingMonths" INTEGER,
    "maternityWaitingMonths" INTEGER,
    "exclusions" TEXT[],
    "inclusions" TEXT[],
    "networkHospitalCount" INTEGER,
    "sourceOfTruth" "InsuranceProductSource" NOT NULL DEFAULT 'PLATFORM_UNVERIFIED',
    "sourceDocumentKey" TEXT,
    "sourceReference" TEXT,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "verificationStatus" "VerificationState" NOT NULL DEFAULT 'UNVERIFIED',
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "dataProvenance" "DataProvenance" NOT NULL DEFAULT 'PROVIDER_SUBMITTED',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsuranceProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsuranceNetworkHospital" (
    "id" TEXT NOT NULL,
    "insurerId" TEXT NOT NULL,
    "hospitalId" TEXT,
    "hospitalName" TEXT NOT NULL,
    "addressLine1" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postalCode" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "productSlugs" TEXT[],
    "cashlessAvailable" BOOLEAN,
    "source" "NetworkEntrySource" NOT NULL DEFAULT 'PLATFORM_UNVERIFIED',
    "sourceReference" TEXT,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "verificationStatus" "VerificationState" NOT NULL DEFAULT 'UNVERIFIED',
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "dataProvenance" "DataProvenance" NOT NULL DEFAULT 'PROVIDER_SUBMITTED',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsuranceNetworkHospital_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsurancePolicy" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "familyMemberId" TEXT,
    "insurerId" TEXT,
    "insurerName" TEXT NOT NULL,
    "productId" TEXT,
    "productName" TEXT,
    "policyNumber" TEXT NOT NULL,
    "memberId" TEXT,
    "policyHolderName" TEXT NOT NULL,
    "coveredMemberNames" TEXT[],
    "coverType" "InsuranceCoverType" NOT NULL DEFAULT 'INDIVIDUAL',
    "sumInsuredInr" INTEGER,
    "premiumInr" INTEGER,
    "premiumFrequency" TEXT,
    "startDate" TIMESTAMP(3),
    "renewalDate" TIMESTAMP(3),
    "roomRentLimitNote" TEXT,
    "coPaymentNote" TEXT,
    "deductibleInr" INTEGER,
    "waitingPeriodNote" TEXT,
    "exclusions" TEXT[],
    "status" "PolicyStatus" NOT NULL DEFAULT 'UNKNOWN',
    "verificationSource" "PolicyVerificationSource" NOT NULL DEFAULT 'SELF_DECLARED',
    "verificationNotes" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "consentAcknowledgedAt" TIMESTAMP(3),
    "consentPolicyVersion" TEXT,
    "dataProvenance" "DataProvenance" NOT NULL DEFAULT 'PROVIDER_SUBMITTED',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "retentionUntil" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsurancePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsurancePolicyDocument" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "kind" "InsurancePolicyDocumentKind" NOT NULL DEFAULT 'POLICY_SCHEDULE',
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageBucket" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "checksumSha256" TEXT,
    "status" "InsuranceDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "malwareScan" "AiMalwareScanStatus" NOT NULL DEFAULT 'PENDING',
    "malwareScanDetail" TEXT,
    "rejectionReason" TEXT,
    "retentionUntil" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsurancePolicyDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsuranceClaim" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "insurerClaimNumber" TEXT,
    "claimType" "ClaimType" NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'DRAFT',
    "patientUserId" TEXT NOT NULL,
    "familyMemberId" TEXT,
    "initiatedById" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "insurerId" TEXT,
    "hospitalId" TEXT,
    "hospitalName" TEXT,
    "treatmentSummary" TEXT,
    "admissionDate" TIMESTAMP(3),
    "dischargeDate" TIMESTAMP(3),
    "diagnosisSummary" TEXT,
    "treatingDoctorName" TEXT,
    "estimatedCostInr" INTEGER,
    "claimedAmountInr" INTEGER,
    "approvedAmountInr" INTEGER,
    "decision" "ClaimDecision" NOT NULL DEFAULT 'PENDING',
    "decisionNotes" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decidedByLabel" TEXT,
    "decisionReasonLabel" TEXT,
    "assignedReviewerUserId" TEXT,
    "dedupeKey" TEXT,
    "duplicateOfClaimId" TEXT,
    "consentAcknowledgedAt" TIMESTAMP(3) NOT NULL,
    "consentPolicyVersion" TEXT,
    "submittedAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "dataProvenance" "DataProvenance" NOT NULL DEFAULT 'PROVIDER_SUBMITTED',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "retentionUntil" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsuranceClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsuranceClaimDocument" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "kind" "ClaimDocumentKind" NOT NULL DEFAULT 'OTHER',
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageBucket" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "checksumSha256" TEXT,
    "status" "InsuranceDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "malwareScan" "AiMalwareScanStatus" NOT NULL DEFAULT 'PENDING',
    "malwareScanDetail" TEXT,
    "rejectionReason" TEXT,
    "queryId" TEXT,
    "retentionUntil" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsuranceClaimDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsuranceClaimQuery" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "raisedByLabel" TEXT NOT NULL,
    "raisedByUserId" TEXT,
    "question" TEXT NOT NULL,
    "dueBy" TIMESTAMP(3),
    "status" "ClaimQueryStatus" NOT NULL DEFAULT 'OPEN',
    "responseText" TEXT,
    "respondedByLabel" TEXT,
    "respondedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsuranceClaimQuery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsurancePreAuthorization" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "claimId" TEXT,
    "policyId" TEXT NOT NULL,
    "patientUserId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "insurerId" TEXT,
    "hospitalId" TEXT,
    "hospitalName" TEXT NOT NULL,
    "status" "PreAuthStatus" NOT NULL DEFAULT 'DRAFT',
    "plannedAdmissionDate" TIMESTAMP(3),
    "plannedProcedure" TEXT,
    "treatingDoctorName" TEXT,
    "treatingDoctorRegistration" TEXT,
    "requestedAmountInr" INTEGER,
    "approvedAmountInr" INTEGER,
    "insurerReferenceNumber" TEXT,
    "decisionNotes" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decidedByLabel" TEXT,
    "validUntil" TIMESTAMP(3),
    "consentAcknowledgedAt" TIMESTAMP(3),
    "consentPolicyVersion" TEXT,
    "submittedAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "retentionUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsurancePreAuthorization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsuranceEligibilityCheck" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "patientUserId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "insurerId" TEXT,
    "hospitalId" TEXT,
    "status" "EligibilityCheckStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestPayload" JSONB,
    "responseSummary" JSONB,
    "insurerReferenceNumber" TEXT,
    "failureReason" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsuranceEligibilityCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsuranceSettlement" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "reference" TEXT,
    "approvedAmountInr" INTEGER,
    "paidAmountInr" INTEGER,
    "utrNumber" TEXT,
    "status" "SettlementStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "recordedById" TEXT,
    "recordedByLabel" TEXT,
    "settledAt" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsuranceSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsuranceClaimEvent" (
    "id" TEXT NOT NULL,
    "claimId" TEXT,
    "preAuthId" TEXT,
    "eligibilityId" TEXT,
    "type" "ClaimEventType" NOT NULL,
    "actorUserId" TEXT,
    "actorRole" "Role",
    "actorLabel" TEXT,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InsuranceClaimEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsurerPartnerProfile" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "insurerId" TEXT NOT NULL,
    "organisationName" TEXT NOT NULL,
    "irdaiRegistrationNumber" TEXT,
    "tpaCode" TEXT,
    "reviewerName" TEXT,
    "reviewerEmail" TEXT,
    "reviewerPhone" TEXT,
    "canRecordDecisions" BOOLEAN NOT NULL DEFAULT false,
    "canManageNetwork" BOOLEAN NOT NULL DEFAULT false,
    "canManageProducts" BOOLEAN NOT NULL DEFAULT false,
    "status" "PartnerApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "verificationStatus" "VerificationState" NOT NULL DEFAULT 'UNVERIFIED',
    "verificationNotes" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "dataProvenance" "DataProvenance" NOT NULL DEFAULT 'PROVIDER_SUBMITTED',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsurerPartnerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PharmacyPartnerProfile_ownerUserId_key" ON "PharmacyPartnerProfile"("ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacyPartnerProfile_facilityId_key" ON "PharmacyPartnerProfile"("facilityId");

-- CreateIndex
CREATE INDEX "PharmacyPartnerProfile_verificationStatus_status_idx" ON "PharmacyPartnerProfile"("verificationStatus", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MedicineProduct_slug_key" ON "MedicineProduct"("slug");

-- CreateIndex
CREATE INDEX "MedicineProduct_categorySlug_listable_idx" ON "MedicineProduct"("categorySlug", "listable");

-- CreateIndex
CREATE INDEX "MedicineProduct_genericName_idx" ON "MedicineProduct"("genericName");

-- CreateIndex
CREATE INDEX "MedicineProduct_scheduleClass_idx" ON "MedicineProduct"("scheduleClass");

-- CreateIndex
CREATE INDEX "MedicineEquivalent_sourceProductId_verificationStatus_idx" ON "MedicineEquivalent"("sourceProductId", "verificationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "MedicineEquivalent_sourceProductId_relatedProductId_relatio_key" ON "MedicineEquivalent"("sourceProductId", "relatedProductId", "relationship");

-- CreateIndex
CREATE INDEX "PharmacyOffer_pharmacyProfileId_isActive_idx" ON "PharmacyOffer"("pharmacyProfileId", "isActive");

-- CreateIndex
CREATE INDEX "PharmacyOffer_stockStatus_idx" ON "PharmacyOffer"("stockStatus");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacyOffer_productId_pharmacyProfileId_key" ON "PharmacyOffer"("productId", "pharmacyProfileId");

-- CreateIndex
CREATE INDEX "PharmacyInventoryEntry_offerId_createdAt_idx" ON "PharmacyInventoryEntry"("offerId", "createdAt");

-- CreateIndex
CREATE INDEX "PharmacyInventoryEntry_pharmacyProfileId_createdAt_idx" ON "PharmacyInventoryEntry"("pharmacyProfileId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacyCart_ownerUserId_key" ON "PharmacyCart"("ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacyCartItem_cartId_offerId_key" ON "PharmacyCartItem"("cartId", "offerId");

-- CreateIndex
CREATE INDEX "PatientAddress_ownerUserId_deletedAt_idx" ON "PatientAddress"("ownerUserId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacyOrder_reference_key" ON "PharmacyOrder"("reference");

-- CreateIndex
CREATE INDEX "PharmacyOrder_customerUserId_createdAt_idx" ON "PharmacyOrder"("customerUserId", "createdAt");

-- CreateIndex
CREATE INDEX "PharmacyOrder_pharmacyProfileId_status_idx" ON "PharmacyOrder"("pharmacyProfileId", "status");

-- CreateIndex
CREATE INDEX "PharmacyOrder_status_paymentDueAt_idx" ON "PharmacyOrder"("status", "paymentDueAt");

-- CreateIndex
CREATE INDEX "PharmacyOrderItem_orderId_idx" ON "PharmacyOrderItem"("orderId");

-- CreateIndex
CREATE INDEX "PharmacyOrderEvent_orderId_createdAt_idx" ON "PharmacyOrderEvent"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacyPayment_idempotencyKey_key" ON "PharmacyPayment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PharmacyPayment_orderId_createdAt_idx" ON "PharmacyPayment"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "PharmacyPayment_providerOrderId_idx" ON "PharmacyPayment"("providerOrderId");

-- CreateIndex
CREATE INDEX "PharmacyPayment_providerPaymentId_idx" ON "PharmacyPayment"("providerPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacyRefund_idempotencyKey_key" ON "PharmacyRefund"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PharmacyRefund_orderId_createdAt_idx" ON "PharmacyRefund"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentWebhookEvent_status_receivedAt_idx" ON "PaymentWebhookEvent"("status", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentWebhookEvent_provider_eventId_key" ON "PaymentWebhookEvent"("provider", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "Prescription_reference_key" ON "Prescription"("reference");

-- CreateIndex
CREATE INDEX "Prescription_ownerUserId_status_idx" ON "Prescription"("ownerUserId", "status");

-- CreateIndex
CREATE INDEX "Prescription_status_createdAt_idx" ON "Prescription"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PrescriptionDocument_storageKey_key" ON "PrescriptionDocument"("storageKey");

-- CreateIndex
CREATE INDEX "PrescriptionDocument_prescriptionId_createdAt_idx" ON "PrescriptionDocument"("prescriptionId", "createdAt");

-- CreateIndex
CREATE INDEX "PrescriptionDocument_status_retentionUntil_idx" ON "PrescriptionDocument"("status", "retentionUntil");

-- CreateIndex
CREATE INDEX "PrescriptionItem_prescriptionId_idx" ON "PrescriptionItem"("prescriptionId");

-- CreateIndex
CREATE INDEX "PrescriptionReviewEvent_prescriptionId_createdAt_idx" ON "PrescriptionReviewEvent"("prescriptionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Insurer_slug_key" ON "Insurer"("slug");

-- CreateIndex
CREATE INDEX "Insurer_isActive_verificationStatus_idx" ON "Insurer"("isActive", "verificationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "InsuranceProduct_slug_key" ON "InsuranceProduct"("slug");

-- CreateIndex
CREATE INDEX "InsuranceProduct_insurerId_isActive_idx" ON "InsuranceProduct"("insurerId", "isActive");

-- CreateIndex
CREATE INDEX "InsuranceProduct_coverType_idx" ON "InsuranceProduct"("coverType");

-- CreateIndex
CREATE INDEX "InsuranceNetworkHospital_city_verificationStatus_idx" ON "InsuranceNetworkHospital"("city", "verificationStatus");

-- CreateIndex
CREATE INDEX "InsuranceNetworkHospital_hospitalId_idx" ON "InsuranceNetworkHospital"("hospitalId");

-- CreateIndex
CREATE UNIQUE INDEX "InsuranceNetworkHospital_insurerId_hospitalName_city_key" ON "InsuranceNetworkHospital"("insurerId", "hospitalName", "city");

-- CreateIndex
CREATE INDEX "InsurancePolicy_ownerUserId_status_idx" ON "InsurancePolicy"("ownerUserId", "status");

-- CreateIndex
CREATE INDEX "InsurancePolicy_renewalDate_idx" ON "InsurancePolicy"("renewalDate");

-- CreateIndex
CREATE UNIQUE INDEX "InsurancePolicyDocument_storageKey_key" ON "InsurancePolicyDocument"("storageKey");

-- CreateIndex
CREATE INDEX "InsurancePolicyDocument_policyId_createdAt_idx" ON "InsurancePolicyDocument"("policyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InsuranceClaim_reference_key" ON "InsuranceClaim"("reference");

-- CreateIndex
CREATE INDEX "InsuranceClaim_patientUserId_status_idx" ON "InsuranceClaim"("patientUserId", "status");

-- CreateIndex
CREATE INDEX "InsuranceClaim_status_createdAt_idx" ON "InsuranceClaim"("status", "createdAt");

-- CreateIndex
CREATE INDEX "InsuranceClaim_assignedReviewerUserId_status_idx" ON "InsuranceClaim"("assignedReviewerUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InsuranceClaim_policyId_dedupeKey_key" ON "InsuranceClaim"("policyId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "InsuranceClaimDocument_storageKey_key" ON "InsuranceClaimDocument"("storageKey");

-- CreateIndex
CREATE INDEX "InsuranceClaimDocument_claimId_createdAt_idx" ON "InsuranceClaimDocument"("claimId", "createdAt");

-- CreateIndex
CREATE INDEX "InsuranceClaimDocument_status_retentionUntil_idx" ON "InsuranceClaimDocument"("status", "retentionUntil");

-- CreateIndex
CREATE INDEX "InsuranceClaimQuery_claimId_status_idx" ON "InsuranceClaimQuery"("claimId", "status");

-- CreateIndex
CREATE INDEX "InsuranceClaimQuery_status_dueBy_idx" ON "InsuranceClaimQuery"("status", "dueBy");

-- CreateIndex
CREATE UNIQUE INDEX "InsurancePreAuthorization_reference_key" ON "InsurancePreAuthorization"("reference");

-- CreateIndex
CREATE INDEX "InsurancePreAuthorization_policyId_status_idx" ON "InsurancePreAuthorization"("policyId", "status");

-- CreateIndex
CREATE INDEX "InsurancePreAuthorization_status_createdAt_idx" ON "InsurancePreAuthorization"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InsuranceEligibilityCheck_reference_key" ON "InsuranceEligibilityCheck"("reference");

-- CreateIndex
CREATE INDEX "InsuranceEligibilityCheck_policyId_status_idx" ON "InsuranceEligibilityCheck"("policyId", "status");

-- CreateIndex
CREATE INDEX "InsuranceEligibilityCheck_status_createdAt_idx" ON "InsuranceEligibilityCheck"("status", "createdAt");

-- CreateIndex
CREATE INDEX "InsuranceSettlement_claimId_status_idx" ON "InsuranceSettlement"("claimId", "status");

-- CreateIndex
CREATE INDEX "InsuranceClaimEvent_claimId_createdAt_idx" ON "InsuranceClaimEvent"("claimId", "createdAt");

-- CreateIndex
CREATE INDEX "InsuranceClaimEvent_preAuthId_createdAt_idx" ON "InsuranceClaimEvent"("preAuthId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InsurerPartnerProfile_ownerUserId_key" ON "InsurerPartnerProfile"("ownerUserId");

-- CreateIndex
CREATE INDEX "InsurerPartnerProfile_insurerId_status_idx" ON "InsurerPartnerProfile"("insurerId", "status");

-- AddForeignKey
ALTER TABLE "PharmacyPartnerProfile" ADD CONSTRAINT "PharmacyPartnerProfile_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyPartnerProfile" ADD CONSTRAINT "PharmacyPartnerProfile_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "PartnerFacility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicineEquivalent" ADD CONSTRAINT "MedicineEquivalent_sourceProductId_fkey" FOREIGN KEY ("sourceProductId") REFERENCES "MedicineProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicineEquivalent" ADD CONSTRAINT "MedicineEquivalent_relatedProductId_fkey" FOREIGN KEY ("relatedProductId") REFERENCES "MedicineProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyOffer" ADD CONSTRAINT "PharmacyOffer_productId_fkey" FOREIGN KEY ("productId") REFERENCES "MedicineProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyOffer" ADD CONSTRAINT "PharmacyOffer_pharmacyProfileId_fkey" FOREIGN KEY ("pharmacyProfileId") REFERENCES "PharmacyPartnerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyInventoryEntry" ADD CONSTRAINT "PharmacyInventoryEntry_pharmacyProfileId_fkey" FOREIGN KEY ("pharmacyProfileId") REFERENCES "PharmacyPartnerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyInventoryEntry" ADD CONSTRAINT "PharmacyInventoryEntry_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "PharmacyOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyCart" ADD CONSTRAINT "PharmacyCart_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyCartItem" ADD CONSTRAINT "PharmacyCartItem_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "PharmacyCart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyCartItem" ADD CONSTRAINT "PharmacyCartItem_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "PharmacyOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientAddress" ADD CONSTRAINT "PatientAddress_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyOrder" ADD CONSTRAINT "PharmacyOrder_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyOrder" ADD CONSTRAINT "PharmacyOrder_pharmacyProfileId_fkey" FOREIGN KEY ("pharmacyProfileId") REFERENCES "PharmacyPartnerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyOrder" ADD CONSTRAINT "PharmacyOrder_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyOrderItem" ADD CONSTRAINT "PharmacyOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PharmacyOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyOrderItem" ADD CONSTRAINT "PharmacyOrderItem_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "PharmacyOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyOrderItem" ADD CONSTRAINT "PharmacyOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "MedicineProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyOrderEvent" ADD CONSTRAINT "PharmacyOrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PharmacyOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyPayment" ADD CONSTRAINT "PharmacyPayment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PharmacyOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyRefund" ADD CONSTRAINT "PharmacyRefund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PharmacyOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyRefund" ADD CONSTRAINT "PharmacyRefund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "PharmacyPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_familyMemberId_fkey" FOREIGN KEY ("familyMemberId") REFERENCES "FamilyMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionDocument" ADD CONSTRAINT "PrescriptionDocument_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionItem" ADD CONSTRAINT "PrescriptionItem_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionItem" ADD CONSTRAINT "PrescriptionItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "MedicineProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionReviewEvent" ADD CONSTRAINT "PrescriptionReviewEvent_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceProduct" ADD CONSTRAINT "InsuranceProduct_insurerId_fkey" FOREIGN KEY ("insurerId") REFERENCES "Insurer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceNetworkHospital" ADD CONSTRAINT "InsuranceNetworkHospital_insurerId_fkey" FOREIGN KEY ("insurerId") REFERENCES "Insurer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceNetworkHospital" ADD CONSTRAINT "InsuranceNetworkHospital_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurancePolicy" ADD CONSTRAINT "InsurancePolicy_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurancePolicy" ADD CONSTRAINT "InsurancePolicy_familyMemberId_fkey" FOREIGN KEY ("familyMemberId") REFERENCES "FamilyMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurancePolicy" ADD CONSTRAINT "InsurancePolicy_insurerId_fkey" FOREIGN KEY ("insurerId") REFERENCES "Insurer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurancePolicy" ADD CONSTRAINT "InsurancePolicy_productId_fkey" FOREIGN KEY ("productId") REFERENCES "InsuranceProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurancePolicyDocument" ADD CONSTRAINT "InsurancePolicyDocument_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "InsurancePolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_patientUserId_fkey" FOREIGN KEY ("patientUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_familyMemberId_fkey" FOREIGN KEY ("familyMemberId") REFERENCES "FamilyMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "InsurancePolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_insurerId_fkey" FOREIGN KEY ("insurerId") REFERENCES "Insurer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceClaim" ADD CONSTRAINT "InsuranceClaim_duplicateOfClaimId_fkey" FOREIGN KEY ("duplicateOfClaimId") REFERENCES "InsuranceClaim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceClaimDocument" ADD CONSTRAINT "InsuranceClaimDocument_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "InsuranceClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceClaimDocument" ADD CONSTRAINT "InsuranceClaimDocument_queryId_fkey" FOREIGN KEY ("queryId") REFERENCES "InsuranceClaimQuery"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceClaimQuery" ADD CONSTRAINT "InsuranceClaimQuery_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "InsuranceClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurancePreAuthorization" ADD CONSTRAINT "InsurancePreAuthorization_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "InsuranceClaim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurancePreAuthorization" ADD CONSTRAINT "InsurancePreAuthorization_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "InsurancePolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurancePreAuthorization" ADD CONSTRAINT "InsurancePreAuthorization_insurerId_fkey" FOREIGN KEY ("insurerId") REFERENCES "Insurer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurancePreAuthorization" ADD CONSTRAINT "InsurancePreAuthorization_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "Hospital"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceEligibilityCheck" ADD CONSTRAINT "InsuranceEligibilityCheck_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "InsurancePolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceEligibilityCheck" ADD CONSTRAINT "InsuranceEligibilityCheck_insurerId_fkey" FOREIGN KEY ("insurerId") REFERENCES "Insurer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceSettlement" ADD CONSTRAINT "InsuranceSettlement_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "InsuranceClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceClaimEvent" ADD CONSTRAINT "InsuranceClaimEvent_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "InsuranceClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceClaimEvent" ADD CONSTRAINT "InsuranceClaimEvent_preAuthId_fkey" FOREIGN KEY ("preAuthId") REFERENCES "InsurancePreAuthorization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurerPartnerProfile" ADD CONSTRAINT "InsurerPartnerProfile_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurerPartnerProfile" ADD CONSTRAINT "InsurerPartnerProfile_insurerId_fkey" FOREIGN KEY ("insurerId") REFERENCES "Insurer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

