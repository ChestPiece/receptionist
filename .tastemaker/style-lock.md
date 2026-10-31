# Style lock: Receptionist Agent, clean SaaS

Locked 2026-10-25 (supersedes "The Ledger"). Applies to every surface: landing, patient chat, dashboard, login. Change only when Anas asks.

## Direction contract
- Calm, credible product for clinic owners. Neutral stone surfaces, one sage accent, plain sans type. The AI stays quiet: no sparkle icons, no gradients, no "AI" cues.
- Light and dark. System default plus a toggle (next-themes, `.dark` class).

## Logo
- The logo is the wordmark `Receptionist Agent.`: Newsreader 400, tracking -0.02em, ink colour, with the full stop in `--alert` red.
- Use `<Logo />` from `src/components/logo.tsx` (it applies the `.wordmark` utility). Never retype it by hand.
- No icon mark, no box behind it, no other colour. Size it with a text class only (`text-2xl` header, `text-xl` footer, sidebar, dashboard).
- Newsreader is for the wordmark only. Never use it for headings or UI text.

## Color contract (tokens in `src/app/globals.css`)
| Role | Token | Light | Dark |
|---|---|---|---|
| Page | `--background` | #fafaf9 | #0c0a09 |
| Card | `--card` | #ffffff | #171412 |
| Ink | `--foreground` | #0c0a09 | #f5f5f4 |
| Muted text | `--muted-foreground` | #6b6560 | #a8a29e |
| Border | `--border` | #e7e5e4 | #292524 |
| Sage: primary, WhatsApp, user bubbles | `--primary` | #4f6f5c | #93b59d |
| Blue: website channel | `--web` | #33506e | #93aecb |
| Red: needs staff, logo dot | `--alert` | #ad4320 | #e8825f |

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
