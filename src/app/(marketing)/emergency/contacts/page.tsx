import { Suspense } from "react";
import type { Metadata } from "next";
import { Siren } from "lucide-react";

import { EmergencyContactsPanel, type EmergencyContactView } from "@/components/emergency/emergency-contacts";
import { PageHero } from "@/components/layout/page-hero";
import { Section } from "@/components/layout/section";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth/guards";
import { listEmergencyContacts, MAX_EMERGENCY_CONTACTS } from "@/lib/emergency/contacts";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Emergency contacts",
  description:
    "Save the people ORVEXA may notify during an emergency incident, and choose which of them may receive a time-limited location link.",
  robots: { index: false, follow: false },
};

const CONTACTS_PATH = "/emergency/contacts";

function ContactsFallback() {
  return <div aria-hidden className="h-64 animate-pulse rounded-2xl bg-muted/60 motion-reduce:animate-none" />;
}

export default function EmergencyContactsPage() {
  return (
    <>
      <PageHero
        eyebrow="Emergency"
        title="Emergency contacts"
        description="The people you would want informed during an incident. Adding a contact does not call anyone automatically — it lets you send them a time-limited location link when you choose to."
        breadcrumbs={[
          { title: "Home", href: "/" },
          { title: "Emergency", href: "/emergency" },
          { title: "Contacts", href: CONTACTS_PATH },
        ]}
        actions={
          <Button asChild variant="emergency" size="lg">
            <Link href="/emergency">
              <Siren aria-hidden />
              Back to the SOS panel
            </Link>
          </Button>
        }
      />

      <Section spacing="sm" aria-labelledby="contacts-heading">
        <h2 id="contacts-heading" className="sr-only">
          Saved emergency contacts
        </h2>
        <Suspense fallback={<ContactsFallback />}>
          <ContactsPanel />
        </Suspense>
      </Section>
    </>
  );
}

/**
 * The session read lives here, inside the boundary: reading the session cookie is
 * a request-time operation, so it cannot be part of the prerendered shell.
 */
async function ContactsPanel() {
  const user = await requirePermission("emergency.contacts_manage", { nextPath: CONTACTS_PATH });
  const contacts = await listEmergencyContacts(user.id);

  const view: EmergencyContactView[] = contacts.map((contact) => ({
    id: contact.id,
    fullName: contact.fullName,
    relationship: contact.relationship,
    phone: contact.phone,
    email: contact.email,
    canReceiveLocation: contact.canReceiveLocation,
    isPrimary: contact.isPrimary,
  }));

  return <EmergencyContactsPanel contacts={view} maxContacts={MAX_EMERGENCY_CONTACTS} />;
}
