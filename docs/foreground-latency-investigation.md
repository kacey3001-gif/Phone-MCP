# Foreground control latency investigation — 2026-11-01

Device: Samsung SM-A415F, Android 12, Phone MCP 0.19.0, foreground control.
Upstream source inspected: 7a74e71103b96128e7e257ae0432dc59c587bef8.
No Android APK, permission, credential or production deployment was changed.

## Live baseline

Screen reads (20-node response, no image), measured around the connector call:

| Sample | Call elapsed | Reported relay total |
| --- | ---: | ---: |
| 1 | 1431 ms | 800 ms |
| 2 | 1024 ms | 363 ms |
| 3 | 1075 ms | 429 ms |

Opening the already foreground ChatGPT app, no image:

| Explicit settle | Call elapsed | Relay total | Native command round trips |
| --- | ---: | ---: | ---: |
| 0 ms | 4236 ms | 458 ms | 2 |
| 120 ms | 4423 ms | 430 ms | 2 |
| 400 ms | 4675 ms | 626 ms | 2 |

These are three individual samples, not a controlled benchmark or a guaranteed
speedup. Approximately 3.8–4.0 seconds in those action calls lies outside the
reported relay execution. This difference is not attributed to a specific host
component: connector scheduling, transport and execution handling are not
separately instrumented here. Model deliberation between calls is additional.
`deviceMs` includes relay-to-device network round trips; it is not device CPU time.

The diagnostics operation failed with an Android receiver-registration error.
Its fast failure timings were excluded from successful-operation measurements.
Initial reads with an invalid limit of 1 were rejected and also excluded.

## Source finding and change

The existing `ui_flow` schema requires an independent session. Its click step
calls native `wait_and_click`, which exists in VirtualEngine but is absent from
PhoneAccessibilityService's foreground dispatch. Android 12 cannot use the
separate-session route. Thus the existing batching feature is unavailable to this
device even though ordinary guarded snapshot/click operations work.

The patch makes `ui_flow.sessionId` optional and routes omitted-session clicks
through a fresh, complete bounded observation plus the original guarded click.
It never catches a failed native click and switches paths. Separate sessions
retain their native implementation. One flow can contain 1–8 preselected exact
click/wait steps within the existing maximum eight-second budget.

## Validation and limits

- 150 server tests passed, including six new foreground unit tests and one MCP
  integration test for the omitted-session path.
- Covered paginated duplicate targets, changed snapshots, truncated trees,
  hidden/disabled/protected nodes, missing ancestors, stop errors, deadlines,
  transport uncertainty and preservation of the native session route.
- A two-click integration case uses one MCP request, four native read/click
  requests plus one final observation. This is a request-count verification,
  not an on-phone after-change latency measurement.
- Production deployment and live before/after validation remain outstanding.
  No speed improvement is claimed on the user's current server yet.

## Deployment and rollback

Deploy the modified relay using the existing Cloudflare Worker configuration,
bindings, secrets and migration history. Do not replace the app or re-pair the
phone. Use the live catalog through `phone_action` if the host's named tool schema
is cached. Validate a harmless previously observed two-step navigation sequence,
check its final screen and compare full call elapsed with relay timings.

Rollback by redeploying the previous Worker version. The change adds no storage
migration, Android package change or credential change.
