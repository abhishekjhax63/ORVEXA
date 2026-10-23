import type { RequestField } from "@/components/forms/request-dialog";
import type { Doctor, Hospital } from "@/types";

/**
 * Shared booking field definitions so the directory tab and the dedicated
 * doctor section collect exactly the same information.
 */
export function buildHospitalFields(hospital: Hospital): RequestField[] {
  return [
    {
      name: "patientName",
      label: "Patient name",
      placeholder: "Full name as per records",
      required: true,
      autoComplete: "name",
    },
    {
      name: "phone",
      label: "Mobile number",
      type: "tel",
      placeholder: "+91 98450 12093",
      required: true,
      autoComplete: "tel",
      description: "We share this with the hospital only to confirm the slot.",
    },
    {
      name: "department",
      label: "Department",
      type: "select",
      options: hospital.specialties,
      defaultValue: hospital.specialties[0],
      required: true,
    },
    { name: "date", label: "Preferred date", type: "date", required: true },
    {
      name: "notes",
      label: "Reason for visit",
      type: "textarea",
      placeholder: "Symptoms, duration, current medicines or a referral note",
    },
  ];
}

export function buildDoctorFields(doctor: Doctor): RequestField[] {
  const modes = doctor.modes.map((mode) =>
    mode === "in-person" ? "In person" : mode === "video" ? "Video consultation" : "Chat consultation",
  );

  return [
    {
      name: "patientName",
      label: "Patient name",
      placeholder: "Full name as per records",
      required: true,
      autoComplete: "name",
    },
    {
      name: "phone",
      label: "Mobile number",
      type: "tel",
      placeholder: "+91 98450 12093",
      required: true,
      autoComplete: "tel",
    },
    { name: "mode", label: "Consultation mode", type: "select", options: modes, defaultValue: modes[0], required: true },
    { name: "date", label: "Preferred date", type: "date", required: true },
    {
      name: "notes",
      label: "Describe your symptoms",
      type: "textarea",
      placeholder: "Helps the doctor prepare before the consultation",
    },
  ];
}
