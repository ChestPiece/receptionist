# Landing redesign: night hero, light body (design spec)

Date: 2026-10-30. Status: **design only, awaiting Anas's approval of the mockup** (`design-options/d-night-hero.html`). No app code changes until approved.

Scope: `/` only (`src/app/page.tsx`, `src/components/landing.tsx`, tokens in `src/app/globals.css`). Chat, login and dashboard are untouched.

Product name: written as `{{PRODUCT}}` below. The speed-pass session renames the product to "Receptionist Agent"; the merge session swaps the token in. The persona stays **Sara**. The `Front Desk.` wordmark stays until the rename decides the logo (see Decisions).

## 1. Direction

The story is the night shift: the clinic is closed, Sara keeps booking. The page opens at night (dark hero), crosses into morning with one scroll-scrubbed frame sequence, and the product proof (NightShift story, features, safety) sits in daylight on the existing stone/sage light body. The page closes at night again (CTA band and footer), so the night is a bookend, not a theme.

What makes it feel cinematic is restraint: one living background (PatternWaves silk dots in sage), one light source (the glow horizon), one lit object (the chat, drawn as a bright phone screen in a dark room), and one camera move (the bridge). Everything with text stays live DOM.

References studied (inspo archive, composition only, nothing copied):
- Cron (cron.com): warm charcoal surface, product UI as the lit object, short headline.
- Supercommon Systems: ink void, single product object, very little chrome.
- Opal (opal.so): one object lit in darkness carries the whole fold.
- Shortwave: deep surface with a low glow band under the fold.

Taken from them: dark surfaces work when one bright object carries the fold and the rest stays quiet. Not taken: neon accents, gradient text, logo walls, glass cards.

## 2. Page structure

| # | Section | Surface | Status |
|---|---|---|---|
| 0 | Nav (floating pill) | night variant over night, normal over light | changed |
| 1 | Hero | night + PatternWaves + glow horizon | changed |
| 2 | Night-to-morning bridge | night to `--background`, frame sequence | new |
| 3 | NightShift pinned story (`#how`) | light | kept, spacing only |
| 4 | Features (`#features`) | light | kept |
| 5 | Safety (`#safety`) | light | small change |
| 6 | Close band | night + PatternWaves (CTA preset) + glow horizon | changed |
| 7 | Footer | night (continues the close band) | changed |

### 0. Nav
- Same floating pill (logo, How it works, Features, Safety, Sign in, Try the demo).
- Over a night surface the pill takes the night scope: `bg-[color-mix(night 62%, transparent)]`, `border-night-border`, text `night-foreground`/`night-muted`, primary button in `--night-accent` with `--night` text. Over light surfaces it is today's pill.
- Switch rule: the section under the nav's bottom edge decides (`data-surface="night"` on night sections; one scroll listener or an IntersectionObserver with `rootMargin: "-56px 0px -100% 0px"`). Colour transition 200 ms `--ease-out`, colours only (no layout).
- The Logo needs no change: inside the night scope `--foreground` and `--alert` already point at night values.

### 1. Hero (night)
Layout keeps today's split (copy left, live replay right) because the replay is the proof and must stay in the first viewport.
- Desktop (≥1024 px): `min-h-[min(100svh,60rem)]`, grid `minmax(0,1.1fr) minmax(0,1fr)`, gap 4rem, content vertically centred, 7rem bottom padding so the horizon sits under the chat.
- Layers, back to front: `--night` fill, PatternWaves canvas, glow horizon (air glow, planet body, rim), content.
- Copy column: audience pill, H1, lead, two buttons.
- Replay column: the existing `HeroConversation` (EN/عربي toggle, Replay, `ChatShell`, caption). The chat shell is a **lit screen**: it uses the light card tokens in both themes (`.screen` scope, see §6), plus a sage halo (`0 0 0 1px night-accent/18%`, `0 30px 80px -30px night-accent/45%`). This is the one shadow above `shadow-sm` the amendment allows, night surfaces only.
- The quiet zone: the waves canvas is masked to 22% strength under the copy (`mask-image` to-right on desktop, to-bottom on phones) so the lead text keeps contrast. No scrim colour, only a mask.

### 2. Night-to-morning bridge (new)
- Full-bleed `<section aria-label="From night to morning">`, no pin (the page keeps one pinned story, NightShift).
- A `<canvas>` (from the frames session, `src/components/frame-sequence.tsx`) at 16:10, `max-w-[90rem]`, `max-h-[88svh]`, centred. Its edges are masked (top 14%, bottom 18%, sides 8%) so the shot melts into the section background.
- The section background walks from `--night` to `--background` with the same scroll progress that scrubs the frames, so the seam disappears in both themes. The walk is **not linear**: night holds until 70% progress, then warms by 95% (`q = clamp(0, (p - 0.7) * 4, 1)`), in step with the frames' morning beat (65–84). A linear mix sits in a muddy grey mid-scroll (seen in the first mockup pass).
- Two live-text captions over the lower left of the shot, crossfading with progress (see copy). They are real text in the DOM; the frames carry no words.
- Scrub window: `start: "top bottom"`, `end: "bottom top+=40%"`, `scrub: 0.6` (≈600 ms catch-up, within the 900 ms scroll budget). Frames 0–89 map linearly to progress.
- Preload: start fetching frames when the section is within one viewport (`rootMargin: "100% 0px"`). Poster = frame 0 (pure night, matches the hero bottom). Phones load the `sm` set.

### 3. NightShift (light, kept)
- No logic changes. Spacing: the section now follows the bridge, so its top border goes (`border-t` removed) and its first padding becomes `pt-[calc(var(--spacing-section)*0.5)]`; the bridge already supplies the gap.
- Caption 1 stays "23:40, the clinic is closed" (the hero replay also shows 23:40; the bridge shows 2:14 am on purpose: a second late hour, a different patient).

### 4. Features (light, kept)
Unchanged. It is the reference light section in the mockup.

### 5. Safety (light)
- Drop the bordered icon tile (`size-9 rounded-lg border bg-card`). Keep the icon inline, `size-4 text-primary`, aligned with the title. The tile is a default icon-tile pattern and adds a box without meaning.
- Grid becomes `sm:grid-cols-[1.25rem_13rem_1fr]`.

### 6. Close band (night)
- Replaces the sage CTA card. Full-bleed night section, `py-section`, centred copy, one primary button, one text link.
- Background: PatternWaves with the CTA settings (§4), glow horizon mirrored as a sunrise is **not** used; the same horizon as the hero sits at the bottom, so the footer reads as the planet surface.
- Lazy: the CTA canvas mounts only when the band is within one viewport, and unmounts its WebGL context when the hero's is alive (only one live context at a time; PatternWaves already pauses offscreen).

### 7. Footer (night)
- Same content as today (Logo, Try the demo, Staff sign in, sample-data note, ThemeToggle), inside the night scope, sitting on the planet body (`--night`), `border-t-0`.
- ThemeToggle still works and only changes the light body; night stays night.

## 3. Copy changes

Hero
- Pill: `For dental clinics in the UAE` (unchanged).
- H1: **`Closed for the night. Still taking bookings.`** (44 chars, fits `text-display`, `max-w-[15ch]`).
- Lead: `Sara, your clinic's AI receptionist, answers on WhatsApp and your website in English and عربي. She books, moves and cancels visits while the front desk is dark.`
  - After the rename, if the product name should appear above the fold: `{{PRODUCT}} gives your clinic Sara, an AI receptionist who answers on WhatsApp and your website in English and عربي. …` (Decision 4.)
- Buttons: `Try the demo chat` (primary), `See how it works` (outline, night border).
- Caption under the chat: unchanged.

Bridge captions (live text, `text-h2` semibold, time as a small line above)
- Night: `2:14 am` / `A patient asks for Thursday. Sara answers.`
- Morning: `9:00 am` / `Your team opens up to a full book.`
- Reduced motion: both shown stacked, morning style.

Close band
- H2: `Let Sara take the night shift.`
- Text: `The demo runs on a sample clinic. Try it in English or Arabic.`
- Primary: `Open the demo chat`. Link: `Staff sign in`.

Footer: unchanged. `aria-label="Front Desk home"` becomes `"{{PRODUCT}} home"` at merge.

## 4. PatternWaves settings

Port: `src/components/pattern-waves.tsx` from React Bits `PatternWaves` (MIT + Commons Clause, OK for product use; keep the licence header). Add `ogl` (1.0.11). Load with `next/dynamic(() => import(...), { ssr: false })`, and only after the hero's first paint (`requestIdleCallback`, fallback 1.2 s timeout), so neither ogl nor the shader is in first-load JS.

Colour comes from tokens at mount: `getComputedStyle(el).getPropertyValue("--night-accent")`. `backgroundColor="transparent"`; the CSS `--night` fill shows through, so a failed or late canvas never changes the background.

| Prop | Hero | Close band | Why |
|---|---|---|---|
| preset | `silk` | `silk` | one surface type on the page |
| color | `--night-accent` | `--night-accent` | sage dots, the only accent |
| backgroundColor | `transparent` | `transparent` | CSS owns the night fill |
| spacing | 10 | 12 | slightly coarser and quieter at the close |
| opacity | 0.65 | 0.4 | the close is a footnote, not a second hero |
| speed | 0.25 | 0.18 | slower than the preset's 0.35: calm, night |
| direction | 20 (preset) | 200 | the close waves flow back the other way |
| fade | `edges` | `center` | close copy is centred, so the centre goes quiet |
| fadeSize | 0.9 | 0.6 | |
| interactive | `(pointer: fine)` only | false | touch taps ripple badly while scrolling |
| cursorSize / cursorStrength | 60 / 0.5 | — | gentle wake under the cursor |
| intro | true (2 s rise) | false | the close appears already alive |
| paused | when `document.hidden` (built in) | same | |

Wrapper rules
- Container `absolute inset-0 -z-10`, `aria-hidden`, `pointer-events-none` (the component listens on `window`, so pointer events still reach it).
- Quiet-zone mask on the hero container (see §2.1).
- Pixel budget: the component caps at 4.5 M device pixels and DPR 2. Keep that.

Fallback (no WebGL2, the dynamic import fails, `prefers-reduced-motion: reduce`, or `navigator.connection.saveData`)
- Do not mount the canvas at all. The surface is `--night` plus the glow horizon. No dot texture, no static image (dot textures stay banned).
- Reduced motion: no canvas (a frozen frame of the shader is still a texture with no purpose).

## 5. Glow horizon (CSS only)

Three absolutely positioned layers inside a `pointer-events-none` wrapper at `-z-[5]` (above the canvas, below content):
1. **Air**: `radial-gradient(42% 46% at 50% <horizon>, night-accent/30%, transparent 70%)`, 140% wide, bottom 70% of the section. The light the rim throws into the sky.
2. **Planet**: a circle `width: 280vw; aspect-ratio: 1; border-radius: 50%; background: var(--night)`, top edge at `--horizon-y` (hero 78% desktop, 88% phone). It hides the waves below the curve, which is what makes it read as a horizon instead of a gradient.
3. **Rim**: the same circle with no fill and the light as stacked shadows: `0 -1px 0 0 night-foreground`, `0 -1px 6px 1px night-accent`, `0 -8px 40px 2px night-accent/70%`, `0 -40px 140px 10px night-accent/35%`, masked horizontally `transparent 36% → #000 47% → #000 53% → transparent 64%` so it is brightest at the centre and dies out toward the sides.

Rules: sage only, night surfaces only, one horizon per night surface, never animated except the one-time intro (rim and air fade from 0 to 1 over 900 ms `expo.out`, 300 ms after first paint). No blur filters (cost), shadows only.

## 6. Tokens and themes

New tokens in `globals.css` (`:root`, and repeated under `.dark` only where they differ):

| Token | Light theme | Dark theme | Contrast on `--night` |
|---|---|---|---|
| `--night` | `#0d1210` | `#0a0d0c` | (surface) |
| `--night-foreground` | `#f2f1ee` | `#f2f1ee` | 16.7:1 / 17.3:1 |
| `--night-muted` | `#a3aca6` | `#a3aca6` | 8.1:1 / 8.4:1 |
| `--night-accent` | `#93b59d` | `#93b59d` | 8.4:1 / 8.7:1 (button fill: `--night` text on it 8.4:1) |
| `--night-border` | `#2c3832` | `#2c3832` | 1.6:1 (hairline, decorative) |
| `--night-alert` | `#e8825f` | `#e8825f` | 7.0:1 (logo dot) |

Theme behaviour
- Night surfaces look the same in both themes. In the dark theme `--night` is one step darker and greener than the dark `--background` (`#0c0a09`), so the hero still reads as its own surface and the bridge still has somewhere to travel to.
- A `.night` utility re-points the shared tokens (`--background`, `--foreground`, `--muted-foreground`, `--border`, `--primary`, `--primary-foreground`, `--alert`) to night values and sets `background` + `color`. Existing components (Button, Logo, ChatShell header text) then work inside night sections with no new variants.
- A `.screen` utility restores the light card tokens for the hero chat (a lit phone screen) in both themes. Values are the light `:root` values; declare them once in `globals.css` as an `@utility`.
- No hard-coded hex in components: everything goes through these tokens.

## 7. Motion spec

Global: GSAP only via `src/lib/gsap.ts`. UI feedback 150–250 ms `--ease-out`. Scroll-linked moves ≤ 900 ms, `power3`/`expo`, no bounce, no overshoot. Reduced motion: no pin, no scrub, no canvas, final states shown.

| Section | Motion | Timing |
|---|---|---|
| Nav | colour swap night/light | 200 ms `--ease-out`, colours only |
| Hero H1 | SplitText line mask reveal (kept) | `yPercent: 105 → 0`, 900 ms `expo.out`, stagger 80 ms |
| Hero pill, lead, buttons, chat | fade up (kept) | `y: 14`, 600 ms `power3.out`, stagger 70 ms, delay 250 ms |
| Hero waves | PatternWaves intro rise | built-in 2 s, starts after idle mount |
| Glow horizon | rim + air fade in, once | 900 ms `expo.out`, delay 300 ms |
| Hero replay | existing beats (kept) | unchanged |
| Bridge | frames scrub + background night→`--background` + caption crossfade | `scrub: 0.6`, frames linear; background on the 0.7–0.95 ramp; night caption fades out 0.42–0.62, morning caption fades in 0.8–0.97 |
| NightShift | existing pin + Flip ticket (kept, the only pin) | Flip 800 ms `power3.inOut` |
| Features, Safety | `Reveals` batch (kept) | 600 ms, stagger 70 ms, `top 88%` |
| Close band | H2 line reveal like the hero; waves without intro | 900 ms `expo.out` |
| Footer | none | |

Removed: nothing new is added beyond the waves, horizon fade and bridge scrub.

## 8. Phone layout (375 px)

- Nav: logo, Sign in, `Demo` button (as today). Night variant over the hero.
- Hero: one column. Pill, H1 at the `text-display` floor (2.5 rem, wraps to 3–4 lines), lead, buttons wrap (both stay single-line), then the chat (`h-[clamp(24rem,58svh,30rem)]`). The horizon sits at 88% so it cuts under the chat, not through it. Waves quiet zone is the top 45% (to-bottom mask). `interactive` off.
- Bridge: same 16:10 frame, full width (≈234 px tall), `sm` frames (800×500). Captions drop to `text-2xl` and sit **below** the frame, not over it (the frame is too short to hold text).
- NightShift: existing phone behaviour (no pin, timed play).
- Close band: centred, buttons stacked full width.
- Root `overflow-x: clip`; every grid track `minmax(0,1fr)`; H1 `overflow-wrap: anywhere`.

## 9. Performance budget

- `/` first-load JS must stay ≤ 303 KB gz. ogl + the PatternWaves module + the frame-sequence module are dynamic imports, fetched after idle. Expected lazy cost: ogl ≈ 25 KB gz (tree-shaken: Renderer, Program, Mesh, Triangle, RenderTarget, Texture), PatternWaves ≈ 7 KB gz.
- Frames: `lg` 90 × ≈25 KB WebP ≈ 2.3 MB, `sm` 45 × ≈10 KB ≈ 0.45 MB, fetched only near the bridge. Not part of LCP.
- LCP element stays the H1 (live text). The canvas never blocks paint.
- One live WebGL context at a time.

## 10. SHOT DESCRIPTION: "night to morning" (for the frames session)

- **Output**: 90 frames, 16:10. `lg` 1600 × 1000, `sm` 800 × 500 (every second frame, 45 frames). PNG sequence from HyperFrames, converted to WebP (quality ≈ 72). Nominal 30 fps = 3.0 s, but playback is scroll-scrubbed, so every frame must read as a still.
- **Camera**: locked three-quarter top-down view of a clinic reception desk, 35 mm feel, very slow push-in of 4% across all 90 frames, no rotation, no shake, no depth-of-field pumping. Subject (the phone) centred at x 50%, y 58%, about 13% of frame width, rotated −8°.
- **Set**: matte dark stone desk top, a closed appointment book, a pen, a small plant pot in silhouette at the left edge, window with horizontal blinds in the back left. No people, no logos, no brand marks, no legible words anywhere (time numerals on the lock screen are the only digits).
- **Safe zones**: top 20% and outer 8% of every frame stay empty (they are masked on the page). Frames 0–29: top 20% is flat `#0d1210` so frame 0 meets the hero bottom with no seam. Leave the lower-left 35% × 30% calm in all frames (captions sit there on desktop).
- **Palette (from tokens)**: night `#0d1210`, desk stone `#1c1917` / `#292524`, sage glow `#93b59d`, sage deep `#4f6f5c`, sage soft `#dfe8df`, morning light sand `#e9c9a8`, morning paper `#fafaf9`, screen white `#ffffff`, ink `#0c0a09`. No blue, no red, no purple.

Beats
| Frames | Beat |
|---|---|
| 0–14 | Night. Room almost black; desk edge and blinds barely visible from a cold faint street light. Phone face-up, screen off. |
| 15–29 | Phone wakes: lock screen lights (`2:14`), soft sage spill on the desk around the phone, a notification card shape slides in (abstract lines, no text). |
| 30–49 | Screen shows a chat: one sage patient bubble rises, then a white reply bubble, then a row of three slot pills with the middle one turning sage. Abstract bars, no words. |
| 50–59 | Booking lands: a card with a sage check mark settles on screen; one gentle sage pulse of light on the desk (peak at frame 54, back down by 59). |
| 60–64 | Screen dims to the lock screen; room still night. Hold. |
| 65–84 | Morning: sand-coloured light stripes from the blinds sweep across the desk; overall exposure ramps from night to morning; the stone desk warms. Phone screen now shows a week grid with one sage block on Thursday evening (shapes only). |
| 85–89 | Hold on the bright, calm morning. The top 20% and the edges are close to `#fafaf9` so the page's light body continues it. |

- **Reduced motion / poster**: page shows frame 89 for reduced motion, frame 0 as the poster before frames load.
- **Light timing**: ease the exposure ramp (frames 65–84) with an `expo.inOut`-like curve; no flicker between frames (render deterministic, same noise seed).

## 11. Style-lock amendment (draft, 2026-10-30)

Not applied yet. Append to `.tastemaker/style-lock.md` after Anas approves the mockup:

> ### Amendment 2026-10-30: night surfaces (marketing only)
> - **Allowed on marketing pages (`/`) only**: night surfaces for the hero, the close band and the footer. Never in chat, login or dashboard.
> - **Tokens**: `--night` (#0d1210 light theme, #0a0d0c dark theme), `--night-foreground` #f2f1ee, `--night-muted` #a3aca6, `--night-accent` #93b59d, `--night-border` #2c3832, `--night-alert` #e8825f. Night surfaces look the same in both themes. Use the `.night` scope utility; never hand-colour a night element.
> - **One PatternWaves surface type**: the React Bits `silk` dot preset in `--night-accent`, transparent background, on night surfaces only. At most two instances per page (hero, close band), one live WebGL context at a time, lazy-loaded, never on light surfaces. Fallback is the plain night surface, never a dot texture.
> - **One glow horizon per night surface**: CSS only (air radial, planet circle, sage rim shadows), sage only. Static after a one-time fade-in.
> - **One frame sequence per page**: the night-to-morning bridge. Scroll-scrubbed, not pinned. Frames carry no text; captions are live DOM.
> - **Lit screen**: the hero chat may use light card tokens and a sage halo shadow on night surfaces. This is the only shadow above `shadow-sm`.
> - **Still banned**: paper/dot textures (as static images or CSS), torn edges, free gradient blobs (the horizon air is the only radial, and only under a rim), glassmorphism beyond the navbar blur, gradient text, neon or any accent other than sage on night, emoji, icon-in-a-square logos and icon tiles, invented stats or client logos, a second pinned story, WebGL on light surfaces, text baked into frames.

## 12. Mockup and checks

- Mockup: `design-options/d-night-hero.html` (self-contained; serve the folder over http, e.g. `python -m http.server`, because the ogl ES module will not load from `file://`). `?theme=dark` previews the dark theme, `?p=0.25` freezes the bridge progress.
- Screenshots next to it: `d-night-hero-desktop.png` (1440 × 900), `d-night-hero-desktop-dark.png`, `d-night-hero-desktop-full.png`, `d-night-hero-desktop-bridge.png` (bridge at 25% and 100%), `d-night-hero-375.png`, `d-night-hero-375-full.png`.
- The bridge in the mockup is a CSS stand-in (a phone shape and blind stripes), not the shot. The frames session renders the real sequence.
- `design-options/` is in `.gitignore`; these files were added with `git add -f`.
- Checks run on the mockup: tastemaker `anti_slop_scan.py` (pass after fixing one dead `href="#"`), `audit_motion.py` (pass), Hallmark slop-test gates reviewed by hand (notes below), no-ai-design-slop removal test.
- Removed or changed after review: the waves competed with the lead paragraph, so a 22% quiet-zone mask went under the copy; the first horizon was too faint to read as a horizon, so the rim got a 1 px light edge and stacked sage shadows; the linear bridge background produced mid-scroll grey, so it now ramps late; the safety icon tiles are dropped in the spec (default icon-tile pattern).
- Hallmark gate notes: display face Geist (not a system default); no purple/cyan gradients, no gradient text; no nested cards or side-stripe cards; no `transition: all`; reduced motion covered (no canvas, final bridge state); canvas and horizon are `aria-hidden`; no invented metrics; the chat shell is the real product UI, not re-drawn chrome; colours only via tokens; no italic headings; no horizontal scroll at 375 px; CTA labels stay on one line at 375 px. The horizon "air" radial is the one gradient on the page and is allowed only under a rim (amendment).

## 13. Decisions for Anas

1. **Approve the mockup direction** (`design-options/d-night-hero.html` and its screenshots). Nothing is built before this.
2. **Hero chat as a lit white screen in the dark theme too?** Recommended yes (it is the light source of the scene). Alternative: dark card in the dark theme, which loses the glow.
3. **Bridge without a pin** (recommended, keeps "one pinned story"). Alternative: pin the bridge for ~120 vh, which makes the shot feel slower and more cinematic but breaks the one-pin rule and needs a style-lock change.
4. **Product name above the fold?** Today the hero names Sara, not the product. After the rename, either keep it that way or prefix the lead with `{{PRODUCT}}` (copy in §3).
5. **Footer on night** (recommended, bookends the page) or back on the light body.
