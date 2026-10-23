import Image from "next/image";
import Link from "next/link";
import { ArrowRight, FileHeart, Video } from "lucide-react";

import { Section } from "@/components/layout/section";
import { Reveal } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";
import { recordsFeatures, telemedicineFeatures } from "@/data/content";
import { healthImage } from "@/lib/images";

const consultImage = healthImage(
  "Indian doctor conducting a telemedicine video consultation on a laptop, modern clinic desk, warm daylight, professional healthcare photography",
  "landscape_16_9",
);

const recordsImage = healthImage(
  "tablet screen showing organised digital medical reports and health charts, clean desk with stethoscope, soft teal lighting, minimal healthcare technology photography",
  "landscape_16_9",
);

/** Homepage telemedicine and health-record block, rendered on the navy brand surface. */
function TelemedicineRecordsSection() {
  return (
    <Section id="telemedicine" tone="navy" spacing="default">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-30 [background-image:radial-gradient(38rem_24rem_at_12%_0%,rgba(34,211,238,0.22),transparent_62%),radial-gradient(34rem_22rem_at_88%_100%,rgba(45,212,191,0.2),transparent_60%)]"
      />
      <div className="relative">
        <Reveal className="max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold tracking-[0.14em] text-teal-200 uppercase">
            Telemedicine &amp; records
          </span>
          <h2 className="mt-4 text-3xl font-semibold text-white sm:text-4xl lg:text-[2.6rem] lg:leading-[1.12]">
            Consult from anywhere. Keep every record forever.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-white/70 sm:text-lg">
            Video consultations, e-signed prescriptions and a clinical timeline that belongs to the patient — not to
            whichever hospital happened to issue it.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <Reveal>
            <article className="flex h-full flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.04]">
              <div className="relative aspect-[16/9] w-full">
                <Image
                  src={consultImage}
                  alt="A doctor conducting a telemedicine consultation"
                  fill
                  sizes="(min-width: 1024px) 45vw, 90vw"
                  className="object-cover"
                />
                <div aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,transparent_40%,rgba(6,18,37,0.8))]" />
                <div className="absolute bottom-4 left-4 flex items-center gap-2 text-white">
                  <span aria-hidden className="grid size-9 place-items-center rounded-xl bg-white/15 backdrop-blur">
                    <Video className="size-4.5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">Telemedicine</p>
                    <p className="text-xs text-white/70">Encrypted WebRTC · average wait 12 minutes</p>
                  </div>
                </div>
              </div>

              <ul className="flex flex-1 flex-col gap-4 p-6">
                {telemedicineFeatures.map((feature) => (
                  <li key={feature.id} className="flex gap-3.5">
                    <span
                      aria-hidden
                      className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/10 text-teal-200"
                    >
                      <feature.icon className="size-4.5" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-white">{feature.title}</p>
                      <p className="mt-1 text-xs leading-relaxed text-white/65">{feature.description}</p>
                    </div>
                  </li>
                ))}
                <li className="mt-auto pt-2">
                  <Button asChild variant="outline" className="border-white/25 bg-white/5 text-white hover:bg-white/10 hover:text-white">
                    <Link href="/services#telemedicine">
                      Start a consultation
                      <ArrowRight aria-hidden />
                    </Link>
                  </Button>
                </li>
              </ul>
            </article>
          </Reveal>

          <Reveal delay={0.07}>
            <article className="flex h-full flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.04]">
              <div className="relative aspect-[16/9] w-full">
                <Image
                  src={recordsImage}
                  alt="A tablet displaying organised digital health records"
                  fill
                  sizes="(min-width: 1024px) 45vw, 90vw"
                  className="object-cover"
                />
                <div aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,transparent_40%,rgba(6,18,37,0.8))]" />
                <div className="absolute bottom-4 left-4 flex items-center gap-2 text-white">
                  <span aria-hidden className="grid size-9 place-items-center rounded-xl bg-white/15 backdrop-blur">
                    <FileHeart className="size-4.5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">Health records vault</p>
                    <p className="text-xs text-white/70">ABHA linked · AES-256 at rest</p>
                  </div>
                </div>
              </div>

              <ul className="flex flex-1 flex-col gap-4 p-6">
                {recordsFeatures.map((feature) => (
                  <li key={feature.id} className="flex gap-3.5">
                    <span
                      aria-hidden
                      className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/10 text-teal-200"
                    >
                      <feature.icon className="size-4.5" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-white">{feature.title}</p>
                      <p className="mt-1 text-xs leading-relaxed text-white/65">{feature.description}</p>
                    </div>
                  </li>
                ))}
                <li className="mt-auto pt-2">
                  <Button asChild variant="outline" className="border-white/25 bg-white/5 text-white hover:bg-white/10 hover:text-white">
                    <Link href="/dashboard/records">
                      Open my records
                      <ArrowRight aria-hidden />
                    </Link>
                  </Button>
                </li>
              </ul>
            </article>
          </Reveal>
        </div>
      </div>
    </Section>
  );
}

export { TelemedicineRecordsSection };
