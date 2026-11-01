# Review: front-desk CRM (30a4727~1..HEAD)

Read-only correctness review. Tenant isolation, column grants vs 0007 and the seed script vs the check constraints all held up; findings below are what did not.

## Important

### 1. Web-chat poll can append the same staff reply twice
`src/app/chat/[slug]/chat.tsx:290-310`. `check()` has no in-flight guard and reads `last.current` before the await. The 4 s interval and the "turn finished" effect (or two interval ticks on a slow network) can both run with the same `after`, both get the same staff rows, and both `setMessages(ms => [...ms, ...staff])`. Result: the reply shows twice, and React warns about duplicate keys (`s<id>`).
Fix: keep an `inFlight` ref and return early while one is running, or dedupe by id when appending (`ms.some(m => m.id === ui.id)`).

### 2. Lint error: set-state-in-effect in new hook
`src/hooks/use-mobile.ts:14`. `setIsMobile(...)` runs synchronously in the effect body, so `npx eslint src scripts` fails (1 error). Fix: initialise with `useSyncExternalStore` over `matchMedia`, or compute the initial value in `useState(() => ...)` and only set it from the `change` listener.

### 3. Settings relink is not atomic, so a failed insert drops every link
`src/app/dashboard/settings/actions.ts:41-47`. `relink` deletes all `dentist_services` rows for the service/dentist and then inserts the new ones. If the insert fails (RLS rejects one id, network error), the service is left with no dentist, and Sara and the desk both get `no_dentist` for it. The user only sees "Saved, but could not update..."
Fix: do it in one RPC/transaction, or insert the new pairs first (with upsert, ignoring duplicates) and then delete only the pairs not in the new list.

## Minor

### 4. Poll after a burst skips older new rows
`src/app/api/chat/route.ts:120-127`. With `after` set, the query is still `order id desc limit 30`. If more than 30 rows come in between polls, the oldest are never returned, and the client moves `last.current` past them. That is unlikely in practice, but a staff reply can get lost this way. Fix: when `after` is set, use `order id asc limit 30`, and skip the `reverse()`.

### 5. Shrinking clinic hours leaves dentists outside them
`src/app/dashboard/settings/actions.ts:26-38`. `saveDentist` enforces `hoursInside(dentist, clinic)`, but `saveClinic` does not re-check existing dentists. Cutting clinic hours keeps dentist slots bookable outside the new opening times. Fix: in `saveClinic`, reject (or report) dentists whose hours fall outside the new hours, the same way clashes are returned.

### 6. Status change back to "booked" bypasses the booking engine
`src/app/dashboard/actions.ts:61-68`. `setVisitStatus(id, "booked")` on a cancelled visit only hits the exclusion constraint. It does not check dentist hours, time off, or a dentist who is now inactive. Fix: route un-cancel through `moveVisit` with the visit's own date and time, or drop "booked" from the allowed statuses.

## Checked, no issue
- Cross-clinic ids in desk and settings actions: every write goes through the user client, and the 0007 policies verify that the dentist, service and patient belong to the same clinic (inserts, updates, link tables, time off).
- Column grants: every column in the `clinics`, `appointments` and `patients` updates and inserts is in the 0007 grant lists.
- Timezone: day boundaries use `toUtc(date, "00:00", offset)` and `localDate`, and time off spans whole clinic-local days.
- Seed: sources are only `staff`/`chat`, statuses are within the 0003 set, and phone-only patients pass the 0007 `patients_identity` check. Booked visits per dentist are generated back to back without overlap.
