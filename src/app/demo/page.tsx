import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense, type CSSProperties } from "react";
import { clinicBySlug, personaName } from "@/lib/clinics";
import { DEMO_SLUG } from "@/lib/demo";
import { DemoShell } from "./shell";

export const metadata = {
  title: "Live demo",
  description: "Chat or call Sara, the AI receptionist, on a sample dental clinic and watch the front desk view update live.",
};

const HEX = /^#[0-9a-f]{6}$/i;

async function Demo() {
  await connection(); // clinic lookup reads the clock (cache), so render at request time
  const clinic = await clinicBySlug(DEMO_SLUG);
  if (!clinic?.active) notFound();
  const { accent, logo } = clinic.branding;
  const style = accent && HEX.test(accent) ? ({ "--primary": accent, "--ring": `${accent}8c` } as CSSProperties) : undefined;
  return (
    <DemoShell
      style={style}
      chat={{
        slug: DEMO_SLUG,
        clinicName: clinic.name,
        persona: personaName(clinic),
        phone: clinic.phone,
        logo: logo?.startsWith("https://") ? logo : undefined,
        info: { hours: clinic.hours, services: clinic.services, address: clinic.address, maps_url: clinic.maps_url },
      }}
    />
  );
}

export default function DemoPage() {
  return (
    <Suspense fallback={<div className="h-dvh animate-pulse" />}>
      <Demo />
    </Suspense>
  );
}
