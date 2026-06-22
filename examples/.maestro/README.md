# Maestro E2E tests — Expo AI Runtime examples

Black-box UI flows for the four example apps. Maestro drives an app that is
**already installed** on a booted simulator/emulator — it does not build.

These flows only cover functionality that needs **no API key**: pure UI / local
state, and generation routed through the bundled **mock** reference server
(`npm run server`, mock mode, no keys).

## Apps under test (appId is identical on iOS and Android)

| App               | appId                                  | Folder               |
| ----------------- | -------------------------------------- | -------------------- |
| basic-generate    | `com.stewmore.expoai.basicgenerate`    | `basic-generate/`    |
| streaming-chat    | `com.stewmore.expoai.streamingchat`    | `streaming-chat/`    |
| cloud-fallback    | `com.stewmore.expoai.cloudfallback`    | `cloud-fallback/`    |
| structured-output | `com.stewmore.expoai.structuredoutput` | `structured-output/` |

## Tiers (Maestro tags)

- `offline` — no server, no network. Deterministic on any sim/emulator. Safe to
  run anywhere.
- `cloud-mock` — generation routes through the bundled mock reference server.
  **Preconditions:**
  1. `npm run server` is running at the repo root (mock mode, no API keys).
     It serves http://localhost:8787 (iOS) / http://10.0.2.2:8787 (Android).
  2. The device has **no on-device model** available, so `ExpoAI.generate/
stream/generateObject` falls back to the cloud (mock). A clean CI
     simulator/emulator satisfies this. On a device with an on-device model
     these flows would route on-device and the cloud-specific assertions
     (`badge-cloud`, `badge-third-party-cloud`) would not hold.

The `cloud-fallback/privacy-block.yaml` flow is tagged `offline` (it makes no
network call) but ALSO relies on precondition (2): with `sensitive=ON` +
`fallback=none` and no on-device model, generation must be blocked
(`UNAVAILABLE`) rather than silently sent. Do not run it on a device that has an
on-device model.

## Build the apps (native dev build required)

From each example dir, once per app:

    cd examples/basic-generate
    npx expo prebuild
    npx expo run:ios       # or: npx expo run:android (with a booted AVD)

Repeat for streaming-chat, cloud-fallback, structured-output. This installs the
dev build on the booted device. Keep the Metro bundler running.

## Start the mock server (only needed for cloud-mock flows)

From the repo root:

    npm run server

## Run

Run ONE app's folder at a time (recommended — see "Pitfall" below):

    # everything for one app
    maestro test examples/.maestro/basic-generate

    # only the offline tier for one app
    maestro test examples/.maestro/basic-generate --include-tags offline

    # only the cloud-mock tier (server must be up)
    maestro test examples/.maestro/streaming-chat --include-tags cloud-mock

    # a single flow
    maestro test examples/.maestro/structured-output/extract.yaml

    # debug a failure (writes hierarchy + screenshots)
    maestro test examples/.maestro/cloud-fallback/ui.yaml --debug-output ./maestro-debug

### Pitfall: do not run the whole `.maestro/` dir unless all four apps are installed

Each flow's `launchApp` targets that app's `appId`. If you run
`maestro test examples/.maestro/` and only one app is installed, the flows for
the other three fail at `launchApp` ("app not installed"). Either install all
four dev builds, or scope runs to the installed app's folder as shown above.
`config.yaml` sets `continueOnFailure: true` so a partial install still reports
per-flow results.

## Authoring/debugging selectors

    maestro studio                         # live inspector
    maestro hierarchy                       # dump ids/text of current screen

All stable selectors are React Native `testID`s surfaced as Maestro `id:`
(auto-derived in `examples/_shared/src/ui.tsx` via a `slug()` helper; plus inline
ids for the cloud-fallback chips/switch).

### Text matching is a FULL-string regex (verified on Maestro 2.6.1 / iOS 26.5)

On this Maestro + iOS driver build, `text:` (and `scrollUntilVisible`'s
`element.text`) is matched against the element's **`accessibilityText` as an
anchored, full-string regex** — NOT as a plain substring. RN `<Text>` exposes its
content via `accessibilityText` (the `text` attribute is empty), so:

- A pattern that equals the whole node works: `assertVisible: "On-device"`.
- A **substring** of a longer node does NOT match on its own. Wrap it in `.*`:
  `assertVisible: ".*mock response from the Expo AI Runtime reference server.*"`.
  This is why the long mock reply, the schema `projectName` key, the privacy note,
  and the `Blocked (no leak)` title are all asserted with `.*…*` here.
- `.*` also sidesteps regex metacharacters in the surrounding text (e.g. the
  parens in `Blocked (no leak)`), so no manual escaping is needed.

### Results render below the fold — scroll them in

Each screen is a `ScrollView`. Generation results (the Result/Output/Extracted
cards) render at the bottom, below the visible viewport. Assert the result text
with `scrollUntilVisible` (DOWN), not a bare `assertVisible`, and set
`visibilityPercentage: 30` — the reply is a multi-line paragraph whose last line
clips behind the React Native dev-warning toast, so it never reaches 100% visible.
Assert any element that sits **above** the result (e.g. `button-stream` reverting
from `Stop`) BEFORE the scroll, or it gets pushed off the top.

## Verification status

- **basic-generate** — built and installed via `npx expo run:ios` on a booted
  iPhone 17 Pro (iOS 26.5); both flows pass (`offline` 12s, `cloud-mock` 4s) with
  Maestro 2.6.1 and `npm run server` running.
- **streaming-chat / cloud-fallback / structured-output** — flows are written and
  YAML-validated, and carry the same matching/scroll fixes by analogy, but have
  not yet been executed (their dev builds were not installed). Build each with
  `npx expo run:ios` and run as above to confirm.
