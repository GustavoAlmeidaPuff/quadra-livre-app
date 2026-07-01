---
name: quadra-livre
description: Use this whenever working in the quadra-livre-app repo (the Expo/React Native mobile app for booking tennis court time slots and posting to the social feed) on anything beyond a purely cosmetic native-only tweak — new features, bug fixes, changed business logic, changed Firestore reads/writes, changed validation rules, or changed UI copy/behavior that a user would notice. This app is one of two twin clients (native app + Next.js web app) sharing the same ~150 users and the same Firebase backend, and they are supposed to be indistinguishable to end users. Trigger this skill proactively even if the user doesn't mention the web app, "sync", "the other app", or "quadra-tenis-igrejinha" by name — any feature/logic change made here needs the equivalent change checked against or made in the sibling repo before the task is considered done. Also trigger when asked to explain how this app relates to the web version, or where the sibling project lives.
---

# quadra-livre-app ↔ quadra-tenis-igrejinha: twin-platform sync

## The situation

`quadra-livre-app` (this repo) and `quadra-tenis-igrejinha` (the original web app, at
`C:\Users\gualm\Documents\code\quadra-tenis-igrejinha`) are **two clients for one product**.
About 150 tennis players at a real tennis facility (currently 2 courts, built to scale to
more) use them to book court time slots and post/comment in a social feed. Both clients read
and write the **same Firebase project** — same Firestore collections, same security rules,
same users. A player might book on the web today and check notifications on the app
tomorrow; if the two clients drift apart in behavior, that player experiences it as the
product being broken, not as "using a different app."

Because of this, **the default assumption for any non-cosmetic change is that it belongs in
both repos.** Don't wait to be asked. This is the one thing this skill exists to make sure
doesn't get missed.

## Deciding whether a change needs mirroring

Ask: would a player notice this if they switched from one platform to the other?

**Mirror it** — feature additions, new screens/pages, business logic (booking rules,
conflict checks, permission checks), anything touching Firestore reads/writes or schema,
validation logic, notification triggers, copy/microcopy a user reads, bug fixes to
shared behavior.

**Don't mirror it** — native-only chrome with no web equivalent (splash screen, app icon,
push notification permission prompts, native tab bar styling, Expo config, app store
metadata), or anything the user explicitly scopes to one platform ("just fix this for the
app", "web-only change").

If genuinely unsure, treat it as needing mirroring and say so — it's cheaper to check the
other repo and find nothing to do than to silently let the platforms drift.

## Workflow

1. Do the requested work in this repo as normal.
2. Before considering the task done, check whether it falls into "mirror it" above.
3. If it does, open `C:\Users\gualm\Documents\code\quadra-tenis-igrejinha` and find the
   equivalent surface (see the map below to jump straight to the right files instead of
   re-exploring from scratch).
4. Implement the equivalent change there, translated to that stack — same behavior and
   business logic, platform-appropriate implementation (e.g. a React Native `Alert` becomes
   a web modal/toast; an Expo Router screen becomes a Next.js page).
5. If you can't actually make the change there in this session (repo not reachable, out of
   scope for the current task, needs the user's sign-off first), say so explicitly in your
   summary — don't let it pass silently as if parity was maintained. Name the specific file(s)
   in the other repo that still need the change.
6. If the change touches Firestore schema, fields, or security rules, treat
   `quadra-tenis-igrejinha/FIRESTORE_RULES.md` as the single source of truth for rules —
   update it and get the corresponding rule deployed to the Firebase console, since both
   clients are bound by the same rules whether or not both clients' *code* changed.

The reverse applies too: if you're asked to work in `quadra-tenis-igrejinha` and this skill
or context makes it relevant, the same logic applies in reverse — check `quadra-livre-app`
for the equivalent surface.

## Platform map

| Concern | quadra-livre-app (this repo, Expo/React Native) | quadra-tenis-igrejinha (web, Next.js) |
|---|---|---|
| Routing | Expo Router, file-based, under `app/` | Next.js App Router, file-based, under `src/app/` |
| Auth/onboarding routes | `app/(auth)/login.tsx`, `login.web.tsx`, `onboarding.tsx` | `src/app/(auth)/login/`, `onboarding/`, `select-court/` |
| Main tabs/pages | `app/(tabs)/index.tsx` (home), `reservar.tsx` (booking), `social.tsx` (feed) | `src/app/(app)/home/`, `reserve/`, `social/`, plus web-only extras: `cafe/`, `lessons/`, `partners/`, `court/[courtId]/manage/` |
| Profile / notifications | `app/perfil.tsx`, `app/notificacoes.tsx` | `src/app/(app)/profile/[userId]/` (+ `courts/`, `level/`, `statistics/`), `src/app/(app)/notifications/` |
| Auth state | `context/AuthContext.tsx` — Firebase `onAuthStateChanged` + `users/{uid}` doc | equivalent client-side auth wiring in `src/app/(auth)` + `src/lib/firebase/client.ts` |
| Firebase client | `lib/firebase.ts` (`firebase/app`, `auth`, `firestore`, `storage`) | `src/lib/firebase/client.ts` (client SDK) **and** `src/lib/firebase/admin.ts` (`firebase-admin`, used in `src/app/api` routes) |
| Booking/court logic | `lib/courts.ts` | `src/lib/courts.ts` |
| Stats | `lib/stats.ts` | `src/lib/queries/stats.ts` |
| Validation | inline / `lib/errors.ts` | `src/lib/validators/reservationValidator.ts`, `src/lib/permissions.ts` |
| Styling | React Native `StyleSheet` / components in `components/` | Tailwind CSS |
| Server-side logic | none (pure client) | `src/app/api/*` route handlers using `firebase-admin` — this is the one place the web app can do things the native app structurally cannot; if you add server-authoritative logic here, the native app still needs an equivalent enforcement path (e.g. security rules, or calling the same API route) |

## Shared Firestore schema (both apps read/write these)

Per `quadra-tenis-igrejinha/FIRESTORE_RULES.md`:
- `users/{userId}`
- `reservations/{reservationId}`
- `reservationParticipants/{participantId}`
- `posts/{postId}` (+ `comments/{commentId}` subcollection)
- `notifications/{notificationId}`

If a task adds a field, a collection, or changes who can read/write what, both codebases'
TypeScript types (`types/` in this repo, `src/types` in the web repo) and the shared
security rules need to move together — a type or rule change made for one client silently
governs the other too.
