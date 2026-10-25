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
    detail: "Call 108 directly. An ORVEXA SOS request does not guarantee dispatch, location sharing or contact notification.",
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
    title: "Follow dispatcher instructions",
    detail: "Tell the emergency dispatcher your location and symptoms. ORVEXA is not connected to ambulance crews.",
    icon: Ambulance,
  },
];

export const ambulanceTypes = [
  {
    id: "als",
    title: "Advanced life support",
    description: "Illustrative unit category only; no ambulance service is connected to ORVEXA.",
    eta: "Not available",
    icon: HeartPulse,
  },
  {
    id: "bls",
    title: "Basic life support",
    description: "Illustrative unit category only; no ambulance service is connected to ORVEXA.",
    eta: "Not available",
    icon: Ambulance,
  },
  {
    id: "nicu",
    title: "Neonatal transport",
    description: "Illustrative unit category only; availability must be confirmed with emergency services.",
    eta: "Not available",
    icon: ShieldCheck,
  },
  {
    id: "air",
    title: "Air ambulance",
    description: "Illustrative unit category only; no air-ambulance provider is connected to ORVEXA.",
    eta: "Not available",
    icon: Route,
  },
];

export const emergencyCapabilities = [
  {
    id: "cap-dispatch",
    title: "No command-centre dispatch",
    detail: "ORVEXA is not connected to a live emergency command centre or ambulance dispatch service.",
    icon: Radio,
  },
  {
    id: "cap-tracking",
    title: "No live ambulance tracking",
    detail: "The application does not receive ambulance GPS positions or provide a live ETA.",
    icon: MapPin,
  },
  {
    id: "cap-prealert",
    title: "No hospital pre-alert",
    detail: "This application does not send patient details or arrival notices to hospitals.",
    icon: Hospital,
  },
  {
    id: "cap-triage",
    title: "No emergency clinician line",
    detail: "No emergency physician is connected through this application.",
    icon: Stethoscope,
  },
  {
    id: "cap-contacts",
    title: "Contact alerts not guaranteed",
    detail: "Do not assume that ORVEXA has notified your contacts or shared your location.",
    icon: BellRing,
  },
  {
    id: "cap-response",
    title: "No response-time estimate",
    detail: "ORVEXA cannot provide or guarantee ambulance availability or arrival times.",
    icon: Timer,
  },
];

export const emergencyChecklist = [
  {
    id: "checklist-cardiac",
    title: "Chest pain or suspected heart attack",
    points: [
      "Call 108 immediately and follow the dispatcher's instructions",
      "Sit the patient upright, loosen tight clothing",
      "Do not give medicines unless an emergency dispatcher or clinician advises you",
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
      "Tell the 108 dispatcher the location and nature of the injury",
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
