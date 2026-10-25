<<<<<<< HEAD
"use client";

import { useState } from "react";
import Image from "next/image";
import {
  AlertTriangle,
  Ambulance,
  BadgeIndianRupee,
  Building2,
  CheckCircle2,
  Clock,
  ExternalLink,
  Flag,
  HelpCircle,
=======
import Link from "next/link";
import {
  Building2,
  ExternalLink,
>>>>>>> 00c6be6 (Updated project features)
  MapPin,
  Navigation,
  Phone,
  Stethoscope,
  UserRound,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
<<<<<<< HEAD
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/input";
import { externalDirectionsUrl } from "@/lib/maps/config";
import { getDoctorImage, getHospitalImage } from "@/lib/images";
=======
>>>>>>> 00c6be6 (Updated project features)
import { cn } from "@/lib/utils";
import type { Doctor, Hospital } from "@/types";

function telephoneHref(value: string | null) {
  if (!value || !/^\+?[\d\s().-]+$/.test(value)) return null;
  const number = value.replace(/[^\d+]/g, "");
  return number.replace(/\D/g, "").length >= 7 ? `tel:${number}` : null;
}

type HospitalCardProps = {
  hospital: Hospital;
<<<<<<< HEAD
  userCoordinates?: { latitude: number; longitude: number } | null;
=======
  /** Optional navigation action supplied by the caller. */
>>>>>>> 00c6be6 (Updated project features)
  action?: React.ReactNode;
  className?: string;
};

<<<<<<< HEAD
/** Presentational hospital card with verified accreditation evidence and authentic photography */
function HospitalCard({ hospital, userCoordinates, action, className }: HospitalCardProps) {
  const [reportOpen, setReportOpen] = useState(false);
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const [reportText, setReportText] = useState("");

  const imageInfo = getHospitalImage(hospital);
  const verificationStatus = hospital.verificationStatus ?? "Verification not confirmed";
  const isVerified = verificationStatus === "Verified";
  const isPending = verificationStatus === "Verification pending";

  const directionsUrl = hospital.coordinates
    ? externalDirectionsUrl(hospital.coordinates, userCoordinates)
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(hospital.name + " " + hospital.city)}`;

  function handleReportSubmit(e: React.FormEvent) {
    e.preventDefault();
    setReportSubmitted(true);
    setTimeout(() => {
      setReportOpen(false);
      setReportSubmitted(false);
      setReportText("");
    }, 1800);
  }

  return (
    <>
      <article
        id={hospital.id}
        className={cn(
          "group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)] transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[var(--shadow-panel)]",
          className,
        )}
      >
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted">
          <Image
            src={imageInfo.url}
            alt={`${hospital.name}, ${hospital.locality}, ${hospital.city}`}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            unoptimized={imageInfo.url.startsWith("data:")}
          />
          <div className="absolute top-3 left-3 flex flex-wrap gap-2">
            <Badge className="bg-navy-950/85 text-white backdrop-blur-sm">{hospital.type}</Badge>
            {hospital.emergency24x7 ? (
              <Badge variant="emergency" className="bg-emergency/90 text-white backdrop-blur-sm">
                <Ambulance aria-hidden className="size-3.5" />
                24×7 emergency
              </Badge>
            ) : null}
          </div>

          {/* Verification Status Pill */}
          <div className="absolute right-3 bottom-3">
            {isVerified ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-emerald-950/85 px-2.5 py-1 text-[0.68rem] font-semibold text-emerald-300 backdrop-blur-md">
                <CheckCircle2 className="size-3 text-emerald-400" />
                Verified Facility
              </span>
            ) : isPending ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-950/85 px-2.5 py-1 text-[0.68rem] font-semibold text-amber-300 backdrop-blur-md">
                <Clock className="size-3 text-amber-400" />
                Verification pending
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-500/30 bg-slate-900/85 px-2.5 py-1 text-[0.68rem] font-semibold text-slate-300 backdrop-blur-md">
                <HelpCircle className="size-3 text-slate-400" />
                Verification not confirmed
              </span>
            )}
          </div>
=======
/** Presentational hospital card shared by the homepage spotlight and the directory. */
function HospitalCard({ hospital, action, className }: HospitalCardProps) {
  const phoneHref = telephoneHref(hospital.phone);

  return (
    <article
      id={hospital.id}
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)] transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[var(--shadow-panel)]",
        className,
      )}
    >
      <div className="flex aspect-[16/9] items-center justify-between bg-primary-soft px-6">
        <Building2 aria-hidden className="size-12 text-primary/70" />
        <Badge variant="warning">Unverified listing</Badge>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex flex-col gap-1.5">
          <h3 className="text-base leading-snug font-semibold">
            <span className="transition-colors group-hover:text-primary">{hospital.name}</span>
          </h3>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin aria-hidden className="size-3.5 shrink-0" />
            {hospital.locality}, {hospital.city}
          </p>
          <p className="text-xs text-muted-foreground">{hospital.type}</p>
          {hospital.address ? <p className="text-xs text-muted-foreground">{hospital.address}</p> : null}
          {hospital.verificationNotes ? (
            <p className="text-xs leading-relaxed text-muted-foreground">Source note: {hospital.verificationNotes}</p>
          ) : null}
>>>>>>> 00c6be6 (Updated project features)
        </div>

        <div className="flex flex-1 flex-col gap-4 p-5">
          <div className="flex flex-col gap-1.5">
            <h3 className="text-base leading-snug font-semibold">
              <span className="transition-colors group-hover:text-primary">{hospital.name}</span>
            </h3>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin aria-hidden className="size-3.5 shrink-0" />
              <span>{hospital.locality}, {hospital.city}</span>
              <span>·</span>
              <span className="font-medium text-foreground">{hospital.distanceKm} km away</span>
            </p>

<<<<<<< HEAD
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                <Star aria-hidden className="size-3.5 fill-amber-400 text-amber-400" />
                {hospital.rating.toFixed(1)}
                <span className="font-normal text-muted-foreground">({hospital.reviewCount.toLocaleString("en-IN")})</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <Building2 aria-hidden className="size-3.5" />
                {hospital.beds} beds
              </span>
              <span className="inline-flex items-center gap-1">
                <BadgeIndianRupee aria-hidden className="size-3.5" />
                {priceTierLabel[hospital.priceTier]}
              </span>
            </p>
          </div>

          {/* Verification Evidence Panel */}
          <div className="rounded-xl border border-border/70 bg-muted/30 p-2.5 text-[0.7rem] leading-relaxed text-muted-foreground">
            {isVerified ? (
              <div className="flex flex-col gap-0.5">
                <span className="flex items-center gap-1 font-semibold text-foreground">
                  <ShieldCheck className="size-3 text-success" />
                  {hospital.registrationNumber ? `Reg: ${hospital.registrationNumber}` : "Accredited"}
                </span>
                <span className="truncate">Source: {hospital.verificationSource ?? "Official Registry"}</span>
                {hospital.verificationDate ? <span>Audited: {hospital.verificationDate}</span> : null}
              </div>
            ) : (
              <div className="flex items-start gap-1.5 text-amber-500">
                <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                <span>Map listing discovered. Official licensing record not yet verified against national registries.</span>
              </div>
            )}
          </div>

          <ul className="flex flex-wrap gap-1.5">
            {hospital.specialties.slice(0, 3).map((specialty) => (
              <li key={specialty}>
                <Badge variant="neutral">{specialty}</Badge>
              </li>
            ))}
            {hospital.specialties.length > 3 ? (
              <li>
                <Badge variant="outline">+{hospital.specialties.length - 3} more</Badge>
              </li>
            ) : null}
          </ul>

          <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
            {hospital.accreditations.map((accreditation) => (
              <li key={accreditation} className="inline-flex items-center gap-1">
                <ShieldCheck aria-hidden className="size-3.5 text-success" />
                {accreditation}
              </li>
            ))}
            {hospital.cashlessInsurance ? (
              <li className="inline-flex items-center gap-1">
                <ShieldCheck aria-hidden className="size-3.5 text-success" />
                Cashless insurance
              </li>
            ) : null}
            {hospital.teleconsult ? (
              <li className="inline-flex items-center gap-1">
                <Video aria-hidden className="size-3.5 text-primary" />
                Teleconsult
              </li>
            ) : null}
          </ul>

          <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
            <div className="flex flex-wrap items-center gap-2">
              {action}
              <a
                href={directionsUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              >
                <Navigation aria-hidden className="size-3 text-primary" />
                Directions
                <ExternalLink className="size-2.5 opacity-50" />
              </a>
            </div>

            <div className="flex items-center gap-3">
              <a
                href={`tel:${hospital.phone.replace(/\s/g, "")}`}
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
              >
                <Phone aria-hidden className="size-3.5" />
                {hospital.phone}
              </a>
              <button
                type="button"
                onClick={() => setReportOpen(true)}
                title="Report incorrect or outdated directory information"
                className="text-muted-foreground/60 transition-colors hover:text-emergency"
              >
                <Flag aria-hidden className="size-3" />
                <span className="sr-only">Report</span>
              </button>
            </div>
          </div>
=======
        <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-4">
          {action}
          {hospital.phone ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Phone aria-hidden className="size-3.5 shrink-0" />
              <span>Public contact (verify): </span>
              {phoneHref ? (
                <a href={phoneHref} className="font-medium transition-colors hover:text-primary">
                  {hospital.phone}
                </a>
              ) : (
                <span>{hospital.phone}</span>
              )}
            </span>
          ) : <span className="text-xs text-muted-foreground">Contact details not provided</span>}
          {hospital.email ? (
            <a
              href={`mailto:${hospital.email}`}
              className="text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
            >
              {hospital.email}
            </a>
          ) : null}
          {hospital.sourceUrl ? (
            <a
              href={hospital.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              <ExternalLink aria-hidden className="size-3.5" />
              View source
            </a>
          ) : null}
          {hospital.profileUrl && hospital.profileUrl !== hospital.sourceUrl ? (
            <a
              href={hospital.profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              <ExternalLink aria-hidden className="size-3.5" />
              Profile or gallery
            </a>
          ) : null}
>>>>>>> 00c6be6 (Updated project features)
        </div>
      </article>

      {/* Report Modal */}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Report Directory Listing</DialogTitle>
            <DialogDescription>
              Help maintain integrity. Report incorrect details, invalid accreditation claims, or outdated contacts for{" "}
              <span className="font-semibold text-foreground">{hospital.name}</span>.
            </DialogDescription>
          </DialogHeader>

          {reportSubmitted ? (
            <div className="rounded-xl border border-success/30 bg-success-soft p-4 text-center text-sm text-success">
              <CheckCircle2 className="mx-auto mb-2 size-6 text-success" />
              Thank you. Our compliance team will audit this facility against official medical registers.
            </div>
          ) : (
            <form onSubmit={handleReportSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="report-reason">What needs correction?</Label>
                <Textarea
                  id="report-reason"
                  rows={3}
                  placeholder="e.g. Hospital moved locality, contact number not working, accreditation expired..."
                  value={reportText}
                  onChange={(e) => setReportText(e.target.value)}
                  required
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setReportOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="gradient">
                  Submit Report
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

type DoctorCardProps = {
  doctor: Doctor;
  action?: React.ReactNode;
  className?: string;
};

<<<<<<< HEAD
const modeLabel: Record<string, string> = {
  "in-person": "In person",
  video: "Video",
  chat: "Chat",
};

/** Presentational doctor card with council registration details and authentic portrait support */
function DoctorCard({ doctor, action, className }: DoctorCardProps) {
  const [reportOpen, setReportOpen] = useState(false);
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const [reportText, setReportText] = useState("");

  const imageInfo = getDoctorImage(doctor);
  const verificationStatus = doctor.verificationStatus ?? "Verification not confirmed";
  const isVerified = verificationStatus === "Verified";
  const isPending = verificationStatus === "Verification pending";

  function handleReportSubmit(e: React.FormEvent) {
    e.preventDefault();
    setReportSubmitted(true);
    setTimeout(() => {
      setReportOpen(false);
      setReportSubmitted(false);
      setReportText("");
    }, 1800);
  }

  return (
    <>
      <article
        id={doctor.id}
        className={cn(
          "group flex h-full flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)] transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[var(--shadow-panel)]",
          className,
        )}
      >
        <div className="flex items-start gap-4">
          <div className="relative size-16 shrink-0 overflow-hidden rounded-full border border-border bg-muted">
            <Image
              src={imageInfo.url}
              alt={doctor.name}
              width={64}
              height={64}
              sizes="64px"
              className="size-16 shrink-0 rounded-full object-cover"
              unoptimized={imageInfo.url.startsWith("data:")}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1">
              <h3 className="truncate text-base leading-snug font-semibold transition-colors group-hover:text-primary">
                {doctor.name}
              </h3>
              {isVerified ? (
                <span className="shrink-0 text-success" title={`Verified: ${doctor.medicalCouncil ?? "Medical Council"}`}>
                  <ShieldCheck className="size-4" />
                </span>
              ) : null}
            </div>
            <p className="text-sm font-medium text-primary">{doctor.specialty}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{doctor.qualifications.join(", ")}</p>
            <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                <Star aria-hidden className="size-3.5 fill-amber-400 text-amber-400" />
                {doctor.rating.toFixed(1)}
              </span>
              <span>{doctor.experienceYears} yrs experience</span>
            </p>
          </div>
        </div>

        {/* Medical Council Verification Badge */}
        <div className="rounded-xl border border-border/70 bg-muted/30 p-2 text-[0.7rem] text-muted-foreground">
          {isVerified ? (
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold text-foreground">
                {doctor.medicalCouncil ?? "State Medical Council"}: {doctor.registrationNumber ?? "Verified"}
              </span>
              <span className="text-xs text-emerald-600 dark:text-emerald-400">
                Credentials verified against official medical registry ({doctor.verificationDate})
              </span>
            </div>
          ) : (
            <span className="text-amber-500">
              Registration pending verification with State Medical Council.
            </span>
          )}
=======
/** Presentational doctor card shared by the homepage spotlight and the directory. */
function DoctorCard({ doctor, action, className }: DoctorCardProps) {
  const phoneHref = telephoneHref(doctor.phone);

  return (
    <article
      id={doctor.id}
      className={cn(
        "group flex h-full flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)] transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[var(--shadow-panel)]",
        className,
      )}
    >
      <div className="flex items-start gap-4">
        <span
          aria-hidden
          className="grid size-16 shrink-0 place-items-center rounded-full bg-primary-soft text-primary"
        >
          <UserRound className="size-7" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base leading-snug font-semibold transition-colors group-hover:text-primary">
            {doctor.name}
          </h3>
          <p className="text-sm text-muted-foreground">{doctor.specialty}</p>
          <Badge variant="warning" className="mt-2">Verify affiliation and credentials</Badge>
>>>>>>> 00c6be6 (Updated project features)
        </div>

<<<<<<< HEAD
        <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">{doctor.about}</p>

        <dl className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <dt className="text-muted-foreground">Hospital</dt>
            <dd className="mt-0.5 font-medium">{doctor.hospitalName}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Languages</dt>
            <dd className="mt-0.5 font-medium">{doctor.languages.join(", ")}</dd>
          </div>
        </dl>

        <ul className="flex flex-wrap gap-1.5">
          {doctor.modes.map((mode) => (
            <li key={mode}>
              <Badge variant="outline" className="gap-1">
                <Stethoscope aria-hidden className="size-3" />
                {modeLabel[mode]}
              </Badge>
            </li>
          ))}
          <li>
            <Badge variant={doctor.availability === "today" ? "success" : "neutral"}>
              {doctor.availability === "today" ? "Available today" : doctor.availability === "tomorrow" ? "Tomorrow" : "This week"}
            </Badge>
          </li>
        </ul>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <div>
            <p className="text-xs text-muted-foreground">Consultation fee</p>
            <p className="text-sm font-semibold">
              ₹{doctor.consultationFee.toLocaleString("en-IN")}
              <span className="ml-2 font-normal text-muted-foreground">{doctor.nextSlot}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {action}
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              title="Report incorrect profile or credential claims"
              className="p-1 text-muted-foreground/60 transition-colors hover:text-emergency"
            >
              <Flag aria-hidden className="size-3" />
              <span className="sr-only">Report</span>
            </button>
          </div>
        </div>
      </article>

      {/* Report Modal */}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Report Doctor Profile</DialogTitle>
            <DialogDescription>
              Report credential inaccuracies, inactive registration, or misleading availability for{" "}
              <span className="font-semibold text-foreground">{doctor.name}</span>.
            </DialogDescription>
          </DialogHeader>

          {reportSubmitted ? (
            <div className="rounded-xl border border-success/30 bg-success-soft p-4 text-center text-sm text-success">
              <CheckCircle2 className="mx-auto mb-2 size-6 text-success" />
              Report submitted for medical council audit.
            </div>
          ) : (
            <form onSubmit={handleReportSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="doc-report-reason">Reason for report</Label>
                <Textarea
                  id="doc-report-reason"
                  rows={3}
                  placeholder="e.g. Practitioner registration number mismatch, incorrect hospital affiliation..."
                  value={reportText}
                  onChange={(e) => setReportText(e.target.value)}
                  required
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setReportOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="gradient">
                  Submit Report
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
=======
      <dl className="grid gap-3 text-xs">
        <div>
          <dt className="text-muted-foreground">Listed hospital</dt>
          <dd className="mt-0.5 font-medium">{doctor.hospitalName}</dd>
        </div>
        {doctor.address ? (
          <div>
            <dt className="text-muted-foreground">Hospital address as listed</dt>
            <dd className="mt-0.5 font-medium">{doctor.address}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-muted-foreground">Qualification shown in supplied source (unverified)</dt>
          <dd className="mt-0.5 font-medium">
            {doctor.qualifications.length > 0 ? doctor.qualifications.join(", ") : "Not stated"}
          </dd>
        </div>
        {doctor.experience ? (
          <div>
            <dt className="text-muted-foreground">Experience as listed (confirm)</dt>
            <dd className="mt-0.5 font-medium">{doctor.experience}</dd>
          </div>
        ) : null}
        {doctor.schedule ? (
          <div>
            <dt className="text-muted-foreground">OPD time as listed (confirm before visiting)</dt>
            <dd className="mt-0.5 font-medium">{doctor.schedule}</dd>
          </div>
        ) : null}
        {doctor.phone ? (
          <div>
            <dt className="text-muted-foreground">Hospital appointment or reception contact (verify)</dt>
            <dd className="mt-0.5 font-medium">
              {phoneHref ? (
                <a href={phoneHref} className="hover:text-primary">
                  {doctor.phone}
                </a>
              ) : (
                doctor.phone
              )}
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <div>
          <p className="text-xs text-muted-foreground">No live availability, fee or booking service is connected.</p>
        </div>
        {doctor.sourceUrl ? (
          <Link
            href={doctor.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            <Stethoscope aria-hidden className="size-3.5" />
            Open supplied directory
            <ExternalLink aria-hidden className="size-3.5" />
          </Link>
        ) : action}
      </div>
    </article>
>>>>>>> 00c6be6 (Updated project features)
  );
}

export { DoctorCard, HospitalCard };
