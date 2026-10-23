import Image from "next/image";
import {
  Ambulance,
  BadgeIndianRupee,
  Building2,
  MapPin,
  Phone,
  ShieldCheck,
  Star,
  Stethoscope,
  Video,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { healthImage } from "@/lib/images";
import { cn } from "@/lib/utils";
import type { Hospital } from "@/types";

const priceTierLabel: Record<Hospital["priceTier"], string> = {
  1: "Value pricing",
  2: "Mid-range pricing",
  3: "Premium pricing",
};

type HospitalCardProps = {
  hospital: Hospital;
  /** Optional slot for a booking/search action supplied by the caller. */
  action?: React.ReactNode;
  className?: string;
};

/** Presentational hospital card shared by the homepage spotlight and the directory. */
function HospitalCard({ hospital, action, className }: HospitalCardProps) {
  return (
    <article
      id={hospital.id}
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)] transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[var(--shadow-panel)]",
        className,
      )}
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted">
        <Image
          src={healthImage(hospital.imagePrompt, "landscape_4_3")}
          alt={`${hospital.name}, ${hospital.locality}, ${hospital.city}`}
          fill
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
        />
        <div className="absolute top-3 left-3 flex flex-wrap gap-2">
          <Badge className="bg-navy-950/75 text-white backdrop-blur-sm">{hospital.type}</Badge>
          {hospital.emergency24x7 ? (
            <Badge variant="emergency" className="bg-emergency/90 text-white backdrop-blur-sm">
              <Ambulance aria-hidden />
              24×7 emergency
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex flex-col gap-1.5">
          <h3 className="text-base leading-snug font-semibold">
            <span className="transition-colors group-hover:text-primary">{hospital.name}</span>
          </h3>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin aria-hidden className="size-3.5 shrink-0" />
            {hospital.locality}, {hospital.city} · {hospital.distanceKm} km
          </p>
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

        <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-4">
          {action}
          <a
            href={`tel:${hospital.phone.replace(/\s/g, "")}`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            <Phone aria-hidden className="size-3.5" />
            {hospital.phone}
          </a>
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

const modeLabel: Record<string, string> = {
  "in-person": "In person",
  video: "Video",
  chat: "Chat",
};

/** Presentational doctor card shared by the homepage spotlight and the directory. */
function DoctorCard({ doctor, action, className }: DoctorCardProps) {
  return (
    <article
      id={doctor.id}
      className={cn(
        "group flex h-full flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)] transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[var(--shadow-panel)]",
        className,
      )}
    >
      <div className="flex items-start gap-4">
        <Image
          src={healthImage(doctor.imagePrompt, "square")}
          alt={doctor.name}
          width={64}
          height={64}
          sizes="64px"
          className="size-16 shrink-0 rounded-full object-cover"
        />
        <div className="min-w-0 flex-1">
          <h3 className="text-base leading-snug font-semibold transition-colors group-hover:text-primary">
            {doctor.name}
          </h3>
          <p className="text-sm text-muted-foreground">{doctor.specialty}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 font-semibold text-foreground">
              <Star aria-hidden className="size-3.5 fill-amber-400 text-amber-400" />
              {doctor.rating.toFixed(1)}
            </span>
            <span>{doctor.experienceYears} yrs experience</span>
          </p>
        </div>
      </div>

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
              <Stethoscope aria-hidden />
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
        {action}
      </div>
    </article>
  );
}

export { DoctorCard, HospitalCard };
