# Style lock: Receptionist Agent, clean SaaS

Locked 2026-10-25 (supersedes "The Ledger"). Applies to every surface: landing, patient chat, dashboard, login. Change only when Anas asks.

**Palette changed 2026-11-01 (asked by Anas): the app tokens are warm cream + sage (Capacities / Alma references), replacing the stone greys. Landing `--night*` / `--dawn*` are untouched.**

## Direction contract
- Calm, credible product for clinic owners. Warm cream surfaces, one sage accent, plain sans type. The AI stays quiet: no sparkle icons, no gradients, no "AI" cues.
- Light by default (next-themes, no system following) plus a dark toggle (`.dark` class).

## Logo
- The logo is the wordmark `Receptionist Agent.`: Newsreader 400, tracking -0.02em, ink colour, with the full stop in `--alert` red.
- Use `<Logo />` from `src/components/logo.tsx` (it applies the `.wordmark` utility). Never retype it by hand.
- No icon mark, no box behind it, no other colour. Size it with a text class only (`text-2xl` header, `text-xl` footer, sidebar, dashboard).
- Newsreader is for the wordmark only. Never use it for headings or UI text.

## Color contract (tokens in `src/app/globals.css`)
| Role | Token | Light | Dark |
|---|---|---|---|
| Page | `--background` | #f7f3ea | #14130f |
| Card, popover | `--card` | #fffdf8 | #1c1a15 |
| Sidebar | `--sidebar` | #f1ebde | #100f0b |
| Quiet fill | `--muted`, `--secondary`, `--panel` | #efe9dc | #26231c |
| Ink | `--foreground` | #1c1a15 | #f1ede3 |
| Muted text | `--muted-foreground` | #6a6254 | #aaa293 |
| Border | `--border`, `--input` | #e3dbc9 | #302c23 |
| Hairline | `--rule` | #ece6d8 | #26231c |
| Sage: primary, WhatsApp, user bubbles | `--primary` | #4f6f5c | #93b59d |
| Blue: website channel | `--web` | #33506e | #93aecb |
| Red: needs staff, logo dot | `--alert` | #ad4320 | #e8825f |

Contrast (light): ink on page 15.7, muted on page 5.4, muted on quiet fill 5.0, white on sage 5.6, sage on page 5.0, alert on page 5.3, web on page 7.5. Dark: muted on page 7.4, sage on card 7.7, alert on page 6.9. Borders are decoration (1.2), never carry meaning alone.

- Sage is the only accent on marketing surfaces. Blue and red carry meaning (channel, needs staff) and appear in the dashboard and the logo dot only.
- No hard-coded hex in components. Add a token first.

## Type contract
- Geist for all UI and headings. Headings semibold, tracking -0.02em to -0.03em at display sizes.
- Geist Mono only for times, prices and IDs, sparingly.
- Readex Pro is the Arabic fallback in the sans stack. Use `dir="auto"` on user text.
- No italics for emphasis, no uppercase micro-labels, no serif headings.

## Shape and space
- Radius 0.75rem (`--radius`); cards `rounded-xl`, composer and hero mock `rounded-2xl`, pills `rounded-full`.
- Borders over shadows. At most `shadow-sm` (floating navbar, composer).
- Content width `max-w-6xl` (landing), `max-w-3xl` (chat column). Section rhythm `py-20`, side gutter `px-4 sm:px-6`.

## Patterns
- Landing: floating rounded navbar (logo, links, Sign in, Try the demo), night hero with chat replay, night-to-morning bridge, how it works, features, safety, night close band, night footer with logo + theme toggle (see the amendment below).
- Chat: left collapsible sidebar (logo, Back to site, New chat, clinic card, `<details>` info blocks, theme toggle); a left sheet on phones. Assistant replies are plain text, patient replies are sage bubbles.
- Motion (relaxed 2026-10-26): UI feedback stays 150-250 ms ease-out. GSAP (`src/lib/gsap.ts`, ScrollTrigger + Flip + SplitText) is allowed on marketing pages: one pinned scroll story per page, scroll reveals, a hero line reveal; scroll-linked moves up to 900 ms, eases `power3`/`expo`, no bounce. Reduced motion: no pin, final state shown. Dashboard: no GSAP.
- Fluid scale: `text-display`, `text-h2`, `text-lead`, `py-section` (clamp tokens in `globals.css`). Hero fits the first viewport.

## Dashboard layout rules (2026-11-01)
- **Fixed-height app shell.** `SidebarProvider` is `h-dvh overflow-hidden`; `SidebarInset` is `flex min-h-0 flex-col`. The document never scrolls: `scrollHeight <= innerHeight` on every route at 1366x768, 1440x900, 768x1024 and 375x812.
- **Page frame** (`src/app/dashboard/page-frame.tsx`): `PageHeader` (56px, sidebar trigger + title + actions) over `PageBody` (`flex min-h-0 flex-1`). Only inner panes scroll (`ScrollArea`, `overflow-y-auto`, the calendar grid with sticky day headers).
- **No height guesses.** Never `calc(100dvh - …)`, `h-screen` or fixed pixel heights for a pane. Panes get height from flex (`min-h-0 flex-1`) or a grid row `minmax(0,1fr)`; on phones a pane may take a rem height inside a scrolling body.
- Sidebar: `collapsible="icon"` on desktop, a sheet on phones. Nav Today / Inbox (needs-staff badge) / Calendar / Patients / Settings (owner only). Clinic switcher in the header, user + theme toggle in the footer.
- **Density.** Compact: page title `text-base font-semibold` in the header (no big H1 banner), 12-16px pane padding (`p-3 sm:p-4`), rows 36-44px, controls `h-9`, body text `text-sm`. Cards are cream `--card` with a hairline border and at most `shadow-sm`; no dashed rules, no serif headings in the app.
- Active nav item is a card chip (cream + hairline ring); primary buttons are sage, never ink-black.

## Banned
Paper/dot textures, torn edges, gradient blobs, glassmorphism beyond the navbar blur, emoji in UI, icon-in-a-square logos, invented stats or client logos.

## Amendment 2026-10-30 (approved 2026-10-31): night surfaces (marketing only)
- **Allowed on marketing pages (`/`) only**: night surfaces for the hero, the close band and the footer. Never in chat, login or dashboard.
- **Tokens**: `--night` (#0d1210 light theme, #0a0d0c dark theme), `--night-foreground` #f2f1ee, `--night-muted` #a3aca6, `--night-accent` #93b59d, `--night-border` #2c3832, `--night-alert` #e8825f. Night surfaces look the same in both themes. Use the `.night` scope utility; never hand-colour a night element.
- **One PatternWaves surface type**: the React Bits `silk` dot preset in `--night-accent`, transparent background, on night surfaces only. At most two instances per page (hero, close band), lazy-loaded (`next/dynamic`, after idle or near the viewport), paused offscreen, never on light surfaces. Fallback is the plain night surface, never a dot texture.
- **One glow horizon per night surface**: CSS only (air radial, planet circle, sage rim shadows), sage only. Static after a one-time fade-in.
- **One frame sequence per page**: the night-to-morning bridge. Scroll-scrubbed, not pinned. Frames carry no text; captions are live DOM.
- **Lit screen**: the hero chat may use light card tokens and a sage halo shadow on night surfaces. This is the only shadow above `shadow-sm`.
- **Still banned**: paper/dot textures (as static images or CSS), torn edges, free gradient blobs (the horizon air is the only radial, and only under a rim), glassmorphism beyond the navbar blur, gradient text, neon or any accent other than sage on night, emoji, icon-in-a-square logos and icon tiles, invented stats or client logos, a second pinned story, WebGL on light surfaces, text baked into frames.

## Amendment 2026-11-01 (approved by Anas): the story owns the colours (landing only)
- **Forced story colours on `/`**: the landing root is a `.day` scope (light tokens in both themes). Night stays `.night` (hero, film, close band, footer). No ThemeToggle on the landing; chat, login and dashboard keep it.
- **Display serif**: Newsreader roman 400 (`font-display`, `text-display`), tracking -0.02em to -0.025em, for landing H1/H2, the film captions and step numbers only. Geist stays for UI, body, buttons and chat. No italics. Replaces "no serif headings" on the landing only.
- **Dawn accent**: `--dawn` #e9c9a8 (light, on night or as fills) and `--dawn-deep` #8a5a2e (text on light, 5.6:1 on the day background). Used for morning light: the horizon line, step numbers, safety hairlines, the booked glow. Sage stays the action colour. Supersedes "sage only" for night horizons.
- **Horizon**: a thin dawn line with a soft glow (no planet circle), mirrored on top of the close band.
- **One pin = the night film** (`NightFilm`): a pinned, scroll-scrubbed frame sequence (about 350vh) with live DOM serif captions driven by `--p`. It replaces the bridge and the How it works pin. How it works, features (bento) and safety (editorial list) are scroll reveals only.
- **Hero entrance is CSS** (`.rise` line masks, `.fade-up`), visible from first paint, no hydration wait.

## Amendment 2026-11-03 (approved by Anas): the desk log (landing only)
- **Shape**: cream hero (no night hero) with the live chat replay, then the desk log, setup steps, safety list, tagline word reveal, FAQ, night close band and night footer.
- **The desk log is the page's one scroll story** (`DeskLog` in `src/components/landing.tsx`): a sticky mono clock (18:00 to 09:00) beside five hour entries, each with one real product piece (Arabic chat, slot picker + booked card + week calendar, the 998 reply, a reminder, the staff inbox). The clock reads an entry's time when that entry is centred and runs to the next time in between; the rail (dawn) fills with it. Sticky CSS, not a GSAP pin.
- **Sky**: the desk log's background follows the active entry: day, dusk (#ece2cf), night (the `.night` token scope via `.desk[data-sky=night]`), dawn (#f4e6d2). Colours only, 600 ms. Product cards inside stay lit (`.screen`). Night entries carry `data-night`, so the nav turns night over them.
- **Motion**: Lenis is the one smooth-scroll engine (landing only, driven by the GSAP ticker, off under reduced motion). Entry pieces arrive one at a time, 180 ms `power2.out`, 350 ms apart, no overshoot (measured 165 ms visible). The tagline fills word by word, scrubbed. Reduced motion: native scroll, clock jumps per entry, every piece shown.
- **CTA**: "Book a 15 min demo call" goes to `NEXT_PUBLIC_DEMO_CALL_URL` (public; a booking page or a business wa.me link, never a private number). Unset: the demo chat. "Try Sara now" is the secondary link.
- **Retired**: the night film, `FrameSequence`, PatternWaves (WebGL, and `ogl`), `public/frames/film`, `motion/night-film*`. The `.day` scope now uses the cream app tokens.

## Amendment 2026-11-03 v2 (pending Anas review): the clock is the hero
- **Hero**: the giant Geist Mono `18:00` (`HeroClock`) with the hour rail is the focal object above the H1; it lifts away on scroll (scrubbed fade) as the desk clock takes over. The chat replay stays on the right.
- **Rail**: one mark per entry hour, the 02:14 mark in alert colour; shared by the hero and the desk clock (`Rail`).
- **Tally**: under the desk clock, chats answered / visits booked / sent to your team, interpolated with the clock from each entry's `tally` (sample night, labelled).
- **Entry layouts**: phone (narrow thread right), wide (booking pair + calendar), alarm (centred, no card), flip (art left), inbox (full width with the night summary). No two entries share a shape.
- **Nav** turns night from the desk sky (not per entry). Setup is one ruled sheet, not three cards. The close label is "18:00 tonight".
