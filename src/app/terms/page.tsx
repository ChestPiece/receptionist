import type { Metadata } from "next";
import { PlainPage } from "@/components/plain-page";

export const metadata: Metadata = { title: "Terms | Receptionist Agent" };

// Plain-language terms for the demo. Needs a legal review before a clinic goes live with real patients.
export default function Terms() {
  return (
    <PlainPage title="Terms">
      <p>The demo chat is for trying Receptionist Agent. Visits booked in it are on a sample clinic and are not real.</p>
      <h2>Not medical advice</h2>
      <p>Sara does not give medical advice. In an emergency, call 998 or go to the nearest emergency department.</p>
      <h2>Fair use</h2>
      <p>Please don&apos;t send personal health details, or use the demo to send spam.</p>
      <h2>Clinics</h2>
      <p>Clinics that use Receptionist Agent agree their own terms with us before going live.</p>
    </PlainPage>
  );
}
