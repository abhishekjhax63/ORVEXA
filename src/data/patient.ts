import type {
  Appointment,
  CareTask,
  FamilyMember,
  HealthRecord,
  NotificationItem,
  PatientProfile,
  Prescription,
  Vital,
} from "@/types";

/**
 * DEMO DATA — a single synthetic patient used to populate the dashboard shell
 * so the layout, empty states and navigation can be reviewed end to end.
 * Nothing here is a real health record.
 */

export const demoPatient: PatientProfile = {
  id: "pat-demo-0001",
  name: "Aarav Sharma",
  abhaId: "91-2345-6789-0123",
  email: "aarav.sharma@example.com",
  phone: "+91 98450 12093",
  bloodGroup: "B+",
  dateOfBirth: "1989-04-17",
  city: "Bengaluru",
  allergies: ["Penicillin", "Dust mite"],
  conditions: ["Pre-hypertension", "Seasonal allergic rhinitis"],
  emergencyContact: { name: "Ishita Sharma", relation: "Spouse", phone: "+91 98450 44120" },
};

export const demoAppointments: Appointment[] = [
  {
    id: "apt-1001",
    doctorName: "Dr. Neha Bhatt",
    specialty: "Endocrinology",
    hospitalName: "Sanjeevani Multi-Speciality Hospital",
    mode: "in-person",
    dateISO: "2026-10-24",
    time: "5:45 PM",
    status: "confirmed",
    location: "Indiranagar, Bengaluru",
    fee: 1100,
  },
  {
    id: "apt-1002",
    doctorName: "Dr. Karthik Reddy",
    specialty: "General medicine",
    hospitalName: "Sanjeevani Multi-Speciality Hospital",
    mode: "video",
    dateISO: "2026-10-26",
    time: "11:00 AM",
    status: "confirmed",
    location: "ORVEXA video consultation",
    fee: 600,
  },
  {
    id: "apt-1003",
    doctorName: "Dr. Sameer Joshi",
    specialty: "ENT surgery",
    hospitalName: "Trinetra Eye & ENT Institute",
    mode: "in-person",
    dateISO: "2026-11-02",
    time: "12:30 PM",
    status: "pending",
    location: "Adyar, Chennai",
    fee: 900,
  },
  {
    id: "apt-0994",
    doctorName: "Dr. Ananya Rao",
    specialty: "Interventional cardiology",
    hospitalName: "Aarogya Heart Institute",
    mode: "in-person",
    dateISO: "2026-09-18",
    time: "6:30 PM",
    status: "completed",
    location: "Bandra West, Mumbai",
    fee: 1200,
  },
  {
    id: "apt-0981",
    doctorName: "Dr. Sneha Gupta",
    specialty: "Dermatology",
    hospitalName: "Anantam Cancer Care Centre",
    mode: "video",
    dateISO: "2026-08-29",
    time: "8:00 PM",
    status: "cancelled",
    location: "ORVEXA video consultation",
    fee: 850,
  },
];

export const demoPrescriptions: Prescription[] = [
  {
    id: "rx-4471",
    issuedBy: "Dr. Neha Bhatt",
    issuedOn: "2026-10-18",
    hospitalName: "Sanjeevani Multi-Speciality Hospital",
    diagnosis: "Sub-clinical hypothyroidism with vitamin D insufficiency",
    items: [
      { name: "Thyronorm 25 mcg", dosage: "1 tablet, empty stomach", duration: "90 days", status: "active" },
      { name: "Vitamin D3 60,000 IU", dosage: "1 capsule weekly", duration: "8 weeks", status: "active" },
      { name: "Iron + Folic Acid", dosage: "1 tablet after dinner", duration: "60 days", status: "refill-due" },
    ],
  },
  {
    id: "rx-4390",
    issuedBy: "Dr. Arjun Deshmukh",
    issuedOn: "2026-09-06",
    hospitalName: "Prana Critical Care Hospital",
    diagnosis: "Seasonal allergic rhinitis",
    items: [
      { name: "Montelukast 10 mg", dosage: "1 tablet at bedtime", duration: "30 days", status: "completed" },
      { name: "Budesonide nasal spray", dosage: "2 puffs each nostril", duration: "30 days", status: "completed" },
    ],
  },
  {
    id: "rx-4262",
    issuedBy: "Dr. Karthik Reddy",
    issuedOn: "2026-07-22",
    hospitalName: "Sanjeevani Multi-Speciality Hospital",
    diagnosis: "Acute viral fever with dehydration",
    items: [
      { name: "Paracetamol 650 mg", dosage: "1 tablet every 8 hours", duration: "5 days", status: "completed" },
      { name: "ORS sachets", dosage: "1 sachet in 1 L water", duration: "3 days", status: "completed" },
    ],
  },
];

export const demoRecords: HealthRecord[] = [
  {
    id: "rec-9001",
    title: "Thyroid & vitamin panel",
    type: "lab-report",
    dateISO: "2026-10-18",
    provider: "ORVEXA partner lab — Indiranagar",
    sizeKb: 842,
    sharedWith: ["Dr. Neha Bhatt"],
  },
  {
    id: "rec-9002",
    title: "2D echocardiogram report",
    type: "imaging",
    dateISO: "2026-09-18",
    provider: "Aarogya Heart Institute",
    sizeKb: 5120,
    sharedWith: ["Dr. Ananya Rao"],
  },
  {
    id: "rec-9003",
    title: "Lipid profile — fasting",
    type: "lab-report",
    dateISO: "2026-09-18",
    provider: "Aarogya Heart Institute",
    sizeKb: 612,
    sharedWith: ["Dr. Ananya Rao", "Dr. Neha Bhatt"],
  },
  {
    id: "rec-9004",
    title: "Day-care procedure discharge summary",
    type: "discharge",
    dateISO: "2026-06-11",
    provider: "Sparsh Orthopaedic & Spine Centre",
    sizeKb: 1480,
    sharedWith: [],
  },
  {
    id: "rec-9005",
    title: "Influenza vaccination",
    type: "vaccination",
    dateISO: "2026-05-04",
    provider: "ORVEXA preventive care",
    sizeKb: 96,
    sharedWith: [],
  },
  {
    id: "rec-9006",
    title: "Consultation invoice — cardiology",
    type: "invoice",
    dateISO: "2026-09-18",
    provider: "Aarogya Heart Institute",
    sizeKb: 210,
    sharedWith: ["Bharat Assure"],
  },
];

export const demoVitals: Vital[] = [
  {
    id: "vital-bp",
    label: "Blood pressure",
    value: "128/84",
    unit: "mmHg",
    trend: "down",
    status: "watch",
    recordedAt: "18 Oct 2026",
  },
  {
    id: "vital-hr",
    label: "Resting heart rate",
    value: "72",
    unit: "bpm",
    trend: "steady",
    status: "normal",
    recordedAt: "18 Oct 2026",
  },
  {
    id: "vital-sugar",
    label: "Fasting glucose",
    value: "104",
    unit: "mg/dL",
    trend: "up",
    status: "watch",
    recordedAt: "18 Oct 2026",
  },
  {
    id: "vital-bmi",
    label: "BMI",
    value: "24.6",
    unit: "kg/m²",
    trend: "steady",
    status: "normal",
    recordedAt: "18 Oct 2026",
  },
  {
    id: "vital-d",
    label: "Vitamin D",
    value: "18",
    unit: "ng/mL",
    trend: "up",
    status: "attention",
    recordedAt: "18 Oct 2026",
  },
];

export const demoCareTasks: CareTask[] = [
  {
    id: "task-1",
    title: "Take Thyronorm 25 mcg",
    detail: "Empty stomach, 30 minutes before breakfast",
    dueLabel: "Today, 7:30 AM",
    type: "medicine",
    done: true,
  },
  {
    id: "task-2",
    title: "Log morning blood pressure",
    detail: "Target under 130/85 mmHg",
    dueLabel: "Today, 8:00 AM",
    type: "medicine",
    done: false,
  },
  {
    id: "task-3",
    title: "Repeat vitamin D test",
    detail: "Fasting not required, home collection booked",
    dueLabel: "28 Oct 2026",
    type: "test",
    done: false,
  },
  {
    id: "task-4",
    title: "Video follow-up with Dr. Karthik Reddy",
    detail: "Review BP log and medicine adherence",
    dueLabel: "26 Oct 2026, 11:00 AM",
    type: "follow-up",
    done: false,
  },
  {
    id: "task-5",
    title: "Influenza booster",
    detail: "Annual shot, recommended before monsoon",
    dueLabel: "Due in 12 days",
    type: "vaccination",
    done: false,
  },
];

export const demoNotifications: NotificationItem[] = [
  {
    id: "note-1",
    title: "Report ready",
    body: "Your thyroid and vitamin panel report is available in records.",
    timeLabel: "2 hours ago",
    unread: true,
  },
  {
    id: "note-2",
    title: "Appointment confirmed",
    body: "Dr. Neha Bhatt, tomorrow at 5:45 PM, Indiranagar.",
    timeLabel: "Yesterday",
    unread: true,
  },
  {
    id: "note-3",
    title: "Refill due",
    body: "Iron + Folic Acid runs out in 4 days. Order from MediCare in one tap.",
    timeLabel: "2 days ago",
    unread: false,
  },
  {
    id: "note-4",
    title: "Claim update",
    body: "Pre-authorisation approved for ₹24,000 by Bharat Assure.",
    timeLabel: "5 days ago",
    unread: false,
  },
];

export const demoFamily: FamilyMember[] = [
  { id: "fam-1", name: "Aarav Sharma", relation: "Self", age: 37, bloodGroup: "B+", abhaId: "91-2345-6789-0123", active: true },
  { id: "fam-2", name: "Ishita Sharma", relation: "Spouse", age: 34, bloodGroup: "O+", abhaId: "91-2345-6789-0456", active: false },
  { id: "fam-3", name: "Reyansh Sharma", relation: "Son", age: 6, bloodGroup: "B+", abhaId: "91-2345-6789-0789", active: false },
  { id: "fam-4", name: "Kamla Sharma", relation: "Mother", age: 66, bloodGroup: "A+", abhaId: "91-2345-6789-0999", active: false },
];
