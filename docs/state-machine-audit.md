# FaithStream Studio application state-machine audit

Reviewed 2026-11-11 across `admin`, `desktop`, `mobile`, and `website`.

## Decision

Use explicit, typed state machines for lifecycles that span async work, external processes, navigation, or user-visible progress. Keep independent presentation state (open menus, selected colors, zoom, search text) as ordinary React state. Replacing every boolean with a reducer would add ceremony without making those controls safer.

The changes in this audit establish three guardrails:

- Admin identity and token move together as one authenticated or anonymous session.
- FaithStream Studio Desktop's stream and recording IPC status messages use shared TypeScript contracts instead of arbitrary strings and renderer casts.
- FaithStream Cam has named connection phases, phase-driven UI labels, a disabled connect action while an attempt is in progress, and stale permission/socket callbacks are ignored after disconnect.

## Lifecycle inventory

### Admin

| Workflow | Existing states and transitions | State owner |
| --- | --- | --- |
| Admin session | Anonymous → authenticated after login; authenticated → anonymous on logout or 401/403. A token and user were previously stored independently. | `src/context/AdminAuthProvider.tsx`, `src/components/RequireAdmin.tsx` |
| Login form | Editing credentials → submitting → authenticated navigation or error. Password visibility is independent display state. | `src/routes/login.tsx` |
| Overview query | Initial load / refresh → data or error; stale responses are cancelled on unmount. | `src/routes/overview.tsx` |
| User directory | Debounced search and pagination → users plus deletion requests or error; one destructive request may be pending. | `src/routes/user.tsx` |
| Deletion review | Pending request → confirm → approve/reject → reload and notification. Confirmation is still browser-native. | `src/routes/user.tsx` |
| Header refresh and request badge | Refresh key triggers page queries; deletion-request count polls every 30 seconds and keeps its last known value on failure. | `src/components/AdminLayout.tsx` |
| Subscriptions | Static not-configured state; it has no billing transitions until backend billing exists. | `src/routes/subscriptions.tsx` |

### Desktop

| Workflow | Implicit states / transitions | State owner and risk |
| --- | --- | --- |
| Account access | Session lookup → sign-in / signed-in app / verification / startup sync; account deletion and sign-out clear the session. | `src/components/AuthGate.tsx`; several booleans and notice strings describe overlapping form states. |
| Presentation editing | Load/create/edit/save/sync, pending navigation confirmation, media import, and multiple selection types. Object selection is represented by several nullable IDs and booleans that can theoretically select incompatible object kinds. | `src/Routes/Presentation.tsx`; future candidate for a discriminated `Selection` union and a typed save/import request state. |
| Studio output | Selected slide → Preview → On Air in preview mode; selection goes directly On Air in direct mode. Scene/source setup also has separate draft visibility and layout state. | `src/Routes/Studio.tsx`; the distinct refs are deliberate and should not be collapsed. |
| Live stream | Main process emits connecting → live → stopping → stopped, or error. Renderer also tracks setup, startup, live UI, and connection error. | `src/main.ts`, `src/preload.ts`, `src/Routes/Studio.tsx`; IPC values are now typed, while process and renderer state remain separate owners. |
| Recording | Save-dialog choice → capture → finalized file or error/cancel. | `src/main.ts`, `src/preload.ts`, `src/Routes/Studio.tsx`; IPC values are now typed. |
| Camera pairing | Pairing code active/expired, phone joined/disconnected, offer/answer/ICE negotiation, source reconnect. | `src/main.ts`, `src/Routes/Studio.tsx`; pairing room and WebRTC connection have independent lifecycles. |
| Studio content actions | Add/delete scene, Scripture selection/design/add, song selection/add/edit, source add/edit/remove, and modal confirmation. | `src/Routes/Studio.tsx`, `src/components/modal/*`, `src/components/StudioSongsPanel.tsx`. Modal visibility and payload are often already modeled together with nullable objects. |
| Profile/settings | Profile save, photo upload/crop/save, deletion-status lookup/request/cancel, and streaming preferences. | `src/Routes/Settings.tsx`; async booleans are independent because these operations can proceed separately. |

### Mobile

| Workflow | Existing states and transitions | State owner |
| --- | --- | --- |
| Welcome | Welcome → camera screen; one-way for the current app session. | `src/routes/AppRoutes.tsx` |
| Studio camera connection | Permission → websocket pairing → WebRTC offer/ICE → camera ready → publishing; disconnect, reconnect, and failures are terminal/retry paths. | `src/hooks/useStudioCamera.ts`; now an explicit phase machine with stale-attempt guards. |
| Camera presentation | Setup screen ↔ fullscreen camera while a local camera stream exists. | `src/screens/CameraScreen.tsx` |
| Camera direction | Front ↔ back by replacing the local video track. | `src/hooks/useStudioCamera.ts`; should ignore stale replacement streams after disconnect. |
| Orientation | Screen orientation changes → notify Studio, which adapts the source layout. | `src/hooks/useStudioCamera.ts`, desktop camera pairing. |

### Website

| Workflow | Existing states and transitions | State owner |
| --- | --- | --- |
| Route selection | Current normalized path selects Home, Downloads, Plans, or Not Found; `popstate` updates the view and document title. | `src/main.tsx` |
| Responsive navigation | Menu closed ↔ open; selecting a link closes it. | `src/components/Navbar.tsx` |
| Download/plans content | Static availability and “coming soon” copy; no purchase/download progress workflow is implemented in the site itself. | `src/Routes/Downloads.tsx`, `src/Routes/Plans.tsx` |

## Follow-up opportunities

1. Model Desktop stream process state as a single `phase` field in `StreamSession`, replacing the overlapping `active`, `failed`, and `stopping` flags. Keep the renderer's UI state separate because it owns setup and audio resources.
2. Replace Presentation editor's selected-object booleans/IDs with a discriminated selection type. Preserve the existing rendered behavior while making invalid combinations unrepresentable.
3. Introduce a small shared async query-state convention for Admin pages (`initial`, `refreshing`, `ready`, `error`) if the dashboard grows beyond its current three data pages.
4. Add cancellation/version tokens to any future import, profile, and sync workflows that can outlive their screen or account session.

These are intentionally staged rather than bundled into a broad reducer rewrite: they touch high-traffic editing and streaming flows and should be made one workflow at a time with focused behavior checks.
