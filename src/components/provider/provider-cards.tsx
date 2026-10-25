import Link from "next/link";
import { ExternalLink, MapPin, Phone, Stethoscope } from "lucide-react";

import { ProviderImage } from "@/components/provider/provider-image";
import { Badge } from "@/components/ui/badge";
import { getDoctorImage, getHospitalImage, getNeutralMedicalPlaceholder } from "@/lib/images";
import { cn } from "@/lib/utils";
import type { Hospital } from "@/types";

function telephoneHref(value: string | null) {
  if (!value || !/^\+?[\d\s().-]+$/.test(value)) return null;
  const number = value.replace(/[^\d+]/g, "");
  return number.replace(/\D/g, "").length >= 7 ? `tel:${number}` : null;
}

type HospitalCardProps = {
  hospital: Hospital;
  /** Optional navigation action supplied by the caller. */
  action?: React.ReactNode;
  className?: string;
};

/** Presentational hospital card shared by the homepage spotlight and the directory. */
function HospitalCard({ hospital, action, className }: HospitalCardProps) {
  const phoneHref = telephoneHref(hospital.phone);
  const image = getHospitalImage(hospital);

  return (
    <article
      id={hospital.id}
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)] transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[var(--shadow-panel)]",
        className,
      )}
    >
      <div className="flex aspect-[16/9] items-center justify-between gap-4 bg-primary-soft px-6">
        <ProviderImage
          src={image.url}
          alt={`${hospital.name}, ${hospital.locality}, ${hospital.city}`}
          placeholder={getNeutralMedicalPlaceholder("hospital", hospital.name)}
          attribution={image.attribution}
          width={240}
          height={240}
          className="size-24 shrink-0 rounded-xl border border-border/60"
        />
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
        </div>
      </div>
    </article>
  );
}

type DoctorCardProps = {
  doctor: import("@/types").Doctor;
  action?: React.ReactNode;
  className?: string;
};

/** Presentational doctor card shared by the homepage spotlight and the directory. */
function DoctorCard({ doctor, action, className }: DoctorCardProps) {
  const phoneHref = telephoneHref(doctor.phone);
  const image = getDoctorImage(doctor);

  return (
    <article
      id={doctor.id}
      className={cn(
        "group flex h-full flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)] transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[var(--shadow-panel)]",
        className,
      )}
    >
      <div className="flex items-start gap-4">
        <ProviderImage
          src={image.url}
          alt={`${doctor.name}, ${doctor.specialty}`}
          placeholder={getNeutralMedicalPlaceholder("doctor", doctor.name)}
          attribution={image.attribution}
          width={128}
          height={128}
          className="size-16 shrink-0 rounded-full border border-border/60"
        />
        <div className="min-w-0 flex-1">
          <h3 className="text-base leading-snug font-semibold transition-colors group-hover:text-primary">
            {doctor.name}
          </h3>
          <p className="text-sm text-muted-foreground">{doctor.specialty}</p>
          <Badge variant="warning" className="mt-2">Verify affiliation and credentials</Badge>
        </div>
      </div>

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
  );
}

export { DoctorCard, HospitalCard };
