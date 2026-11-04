import type { Metadata } from "next";
import { PlainPage } from "@/components/plain-page";

export const metadata: Metadata = { title: "Privacy | Receptionist Agent" };

// Plain-language notice for the demo. Needs a legal review before a clinic goes live with real patients.
export default function Privacy() {
  return (
    <PlainPage title="Privacy">
      <p>Receptionist Agent is in a demo phase. The public demo chat runs on a sample clinic with sample data.</p>
      <h2>What the demo chat keeps</h2>
      <p>
        The messages you type, and a random visitor id stored in your browser so the chat can come back after a reload. If
        you give a phone number to book a sample visit, it is saved with that visit.
      </p>
      <h2>How replies are made</h2>
      <p>Your messages are sent to an AI model to write Sara&apos;s replies. They are not used to train AI models.</p>
      <h2>Clinics</h2>
      <p>
        Each clinic&apos;s chats are visible only to that clinic&apos;s team. Where a clinic&apos;s data is hosted is agreed with
        the clinic before it goes live.
      </p>
      <h2>Questions</h2>
      <p>Ask us on the demo call, or ask Sara in the demo chat to pass a message to the team.</p>
    </PlainPage>
  );
}
