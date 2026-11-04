import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/safety";
import { supabaseServer } from "@/lib/supabase/server";

// Magic link lands here: swap the one-time code for a session cookie.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const safe = safeNext(request.nextUrl.searchParams.get("next"));
  if (code) {
    const { error } = await (await supabaseServer()).auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(safe, request.url));
  }
  return NextResponse.redirect(new URL("/login?error=link", request.url));
}
