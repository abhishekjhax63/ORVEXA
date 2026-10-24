import {
  Ambulance,
  BellRing,
  HeartPulse,
  Hospital,
  MapPin,
  Radio,
  Route,
  ShieldCheck,
  Siren,
  Stethoscope,
  Timer,
  UserRound,
} from "lucide-react";

/** DEMO DATA — sample emergency network and guidance content. */

export const emergencySteps = [
  {
    id: "step-assess",
    title: "Stay with the patient",
    detail: "Check responsiveness and breathing. Do not move someone with a suspected spinal injury unless they are in danger.",
    icon: HeartPulse,
  },
  {
    id: "step-call",
    title: "Trigger SOS or dial 108",
    detail: "One tap on the SOS button shares your live location with the dispatch desk and your emergency contacts.",
    icon: Siren,
  },
  {
    id: "step-prepare",
    title: "Prepare these details",
    detail: "Age, known conditions, current medicines, allergies, blood group and the nearest landmark.",
    icon: UserRound,
  },
  {
    id: "step-handover",
    title: "Hand over to the crew",
    detail: "Paramedics will confirm the receiving hospital while en route so the emergency team is ready on arrival.",
    icon: Ambulance,
  },
];

export const ambulanceTypes = [
  {
    id: "als",
    title: "Advanced life support",
    description: "Ventilator, defibrillator, infusion pumps and a doctor-paramedic crew for critical cases.",
    eta: "8–14 minutes",
    icon: HeartPulse,
    recommended: true,
  },
  {
    id: "bls",
    title: "Basic life support",
    description: "Oxygen, immobilisation and two trained paramedics for stable transport.",
    eta: "6–11 minutes",
    icon: Ambulance,
    recommended: false,
  },
  {
    id: "nicu",
    title: "Neonatal transport",
    description: "Transport incubator with a neonatal nurse and paediatric intensivist support.",
    eta: "15–25 minutes",
    icon: ShieldCheck,
    recommended: false,
  },
  {
    id: "air",
    title: "Air ambulance",
    description: "Fixed-wing and helicopter evacuation for inter-city critical transfers and trauma.",
    eta: "90–180 minutes",
    icon: Route,
    recommended: false,
  },
];

export const emergencyCapabilities = [
  {
    id: "cap-dispatch",
    title: "Command centre dispatch",
    detail: "A 24×7 desk assigns the nearest suitable unit and stays on the line until hospital handover.",
    icon: Radio,
  },
  {
    id: "cap-tracking",
    title: "Live ambulance tracking",
    detail: "GPS ETA shared with family through a link that needs no app install.",
    icon: MapPin,
  },
  {
    id: "cap-prealert",
    title: "Hospital pre-alert",
    detail: "Vitals and case notes reach the receiving emergency department before the ambulance arrives.",
    icon: Hospital,
  },
  {
    id: "cap-triage",
    title: "Doctor-led triage",
    detail: "An emergency physician guides first response on the call while the crew is en route.",
    icon: Stethoscope,
  },
  {
    id: "cap-contacts",
    title: "Automatic contact alerts",
    detail: "Emergency contacts are notified with location, hospital name and expected arrival time.",
    icon: BellRing,
  },
  {
    id: "cap-response",
    title: "Response time transparency",
    detail: "Median dispatch-to-scene time published by city and reviewed every month against an SLA.",
    icon: Timer,
  },
];

export const emergencyChecklist = [
  {
    id: "checklist-cardiac",
    title: "Chest pain or suspected heart attack",
    points: [
      "Call 108 immediately — do not drive the patient yourself",
      "Sit the patient upright, loosen tight clothing",
      "Give aspirin 325 mg to chew only if not allergic and conscious",
      "Keep the patient still and calm; note the time symptoms began",
    ],
  },
  {
    id: "checklist-stroke",
    title: "Sudden weakness, slurred speech or facial droop",
    points: [
      "Note the exact time of the first symptom — it decides treatment",
      "Do not give food, water or medicines",
      "Lay the patient on their side if vomiting",
      "Ask for the nearest stroke-ready hospital when you call",
    ],
  },
  {
    id: "checklist-bleeding",
    title: "Severe bleeding or injury",
    points: [
      "Apply firm direct pressure with a clean cloth, do not remove it",
      "Elevate the limb above heart level if no fracture is suspected",
      "Do not remove an embedded object — pad around it",
      "Request an advanced life support unit for heavy bleeding",
    ],
  },
  {
    id: "checklist-airway",
    title: "Choking or difficulty breathing",
    points: [
      "Encourage forceful coughing if they can cough",
      "Give five back blows between the shoulder blades",
      "Follow with abdominal thrusts for adults",
      "Start CPR if the person becomes unresponsive",
    ],
  },
];

export const emergencyContacts = [
  {
    id: "ec-1",
    name: "Sanjeevani Multi-Speciality Hospital",
    department: "Emergency & trauma",
    city: "Bengaluru",
    distanceKm: 2.4,
    phone: "+91 80 4712 8811",
    bedsAvailable: 9,
    traumaLevel: "Level 1 trauma centre",
  },
  {
    id: "ec-2",
    name: "Prana Critical Care Hospital",
    department: "Critical care & ICU",
    city: "Hyderabad",
    distanceKm: 7.6,
    phone: "+91 40 6730 9911",
    bedsAvailable: 4,
    traumaLevel: "Level 2 trauma centre",
  },
  {
    id: "ec-3",
    name: "Aarogya Heart Institute",
    department: "Cardiac emergency",
    city: "Mumbai",
    distanceKm: 5.1,
    phone: "+91 22 6180 4411",
    bedsAvailable: 6,
    traumaLevel: "Cardiac cath lab on standby",
  },
  {
    id: "ec-4",
    name: "Nightingale Women & Child Hospital",
    department: "Obstetric emergency",
    city: "Delhi NCR",
    distanceKm: 11.8,
    phone: "+91 124 460 7711",
    bedsAvailable: 5,
    traumaLevel: "High-risk maternity unit",
  },
];

export const bystanderNumbers = [
  { id: "ambulance", label: "Ambulance", number: "108", detail: "National emergency response" },
  { id: "police", label: "Police", number: "100", detail: "Accident and traffic emergencies" },
  { id: "fire", label: "Fire & rescue", number: "101", detail: "Fire, collapse and extrication" },
  { id: "womens", label: "Women's helpline", number: "181", detail: "Distress and safety support" },
  { id: "disaster", label: "Disaster helpline", number: "1078", detail: "Natural disaster response" },
];
