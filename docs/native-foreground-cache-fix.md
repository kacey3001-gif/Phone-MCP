# Foreground accessibility cache refresh

The Samsung SM-A415F on Android 12 returned `34` through accessibility after
Calculator visibly displayed `56`. A regular snapshot, same-app open and
`node_details` read did not repair the snapshot text. Switching away and back
produced the current value. This is a cache freshness issue, not OCR failure.

`AccessibilityReadCache.clear` clears the framework cache before each new
foreground snapshot. Android 13+ uses public `AccessibilityService.clearCache`.
On Android 11/12 it reapplies the exact object from `getServiceInfo` through the
public `setServiceInfo` API. Android 12's `sendServiceInfo` implementation clears
`AccessibilityInteractionClient` after applying that configuration:

https://android.googlesource.com/platform/frameworks/base/+/refs/heads/android12-release/core/java/android/accessibilityservice/AccessibilityService.java

No service flags, event subscriptions, timeout, packages or capabilities change.
Permission is checked first. Cache refresh failures fail the observation instead
of returning old text. Cursor pages bypass the refresh and retain their original
snapshot. New observations report `textFreshness.state=cache_cleared` and the
method used, allowing the relay to stop its legacy visual fallback.

Validation: the actual helper compiled and ran against API doubles covering
Android API 30, 31, 32, 33 and 36, unchanged service configuration, repeated
refresh, unavailable service info, failed clear and revoked service. All 24
assertions passed. Existing Android doubles also passed. This is not an APK
build or on-device verification of the changed companion.

## Installation limitation

The installed 0.19.0 companion's developer signing key is not in this repository.
Its documented certificate is
`a819c6ef90efe5809d48d41e02c741168b744d1705fa7ab53313e02e5295babe`.
A locally signed build cannot update that installation in place. Do not uninstall
the companion, erase its data or replace pairing merely to bypass that mismatch.
This native patch remains uninstalled pending an update signed by that developer
or a separately planned migration. The server safeguard handles legacy editable
values using fresh authorized screenshots in the meantime.
