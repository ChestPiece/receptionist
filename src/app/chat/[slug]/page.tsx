import { notFound } from "next/navigation";
import { connection } from "next/server";
import { cache, Suspense, type CSSProperties } from "react";
import { clinicBySlug, personaName } from "@/lib/clinics";
import { Chat } from "./chat";

const getClinic = cache(clinicBySlug); // one lookup per request, shared by metadata and page

export async function generateMetadata({ params }: PageProps<"/chat/[slug]">) {
  await connection(); // clinic lookup reads the clock (5-min cache), so render at request time
  const clinic = await getClinic((await params).slug);
  return { title: clinic ? `Chat with ${clinic.name}` : "Chat" };
}

const HEX = /^#[0-9a-f]{6}$/i; // clinic accent goes into inline CSS, so only plain hex gets through

async function ClinicChat({ params, searchParams }: Pick<PageProps<"/chat/[slug]">, "params" | "searchParams">) {
  await connection();
  const { slug } = await params;
  const clinic = await getClinic(slug);
  if (!clinic?.active) notFound();
  const { accent, logo } = clinic.branding;
  const style = accent && HEX.test(accent) ? ({ "--primary": accent, "--ring": `${accent}8c` } as CSSProperties) : undefined;
  return (
    <div style={style} className="contents">
      <Chat
        slug={slug}
        test={(await searchParams).test === "1"}
        clinicName={clinic.name}
        persona={personaName(clinic)}
        phone={clinic.phone}
        logo={logo?.startsWith("https://") ? logo : undefined}
        info={{
          hours: clinic.hours,
          services: clinic.services,
          address: clinic.address,
          maps_url: clinic.maps_url,
        }}
      />
    </div>
  );
}

export default function ChatPage({ params, searchParams }: PageProps<"/chat/[slug]">) {
  return (
    <div className="relative h-dvh overflow-hidden">
      <Suspense fallback={<div className="relative h-full animate-pulse" />}>
        <ClinicChat params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
