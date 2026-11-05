# Mobile performance diagnostics

Performance diagnostics are enabled automatically in development. For a
production-mode local export or approved diagnostic build, set:

```text
EXPO_PUBLIC_PERFORMANCE_DIAGNOSTICS=true
```

The diagnostic stream reports:

- the running Expo update ID, runtime version, channel, and embedded/OTA state;
- sanitized API route templates, latency, status, and request concurrency;
- resident and rescuer navigation-settle duration;
- JavaScript event-loop stalls of at least 350 ms; and
- PlatformMap/WebView initialization duration.

It does not log tokens, request or response bodies, coordinates, query values,
user identifiers, or full URLs. Production logging is disabled unless the
flag is explicitly set.

## Resident flood-alert location fallback

An explicit backend `matches_current_location: false` result is always
excluded, even if an older profile barangay matches. An explicit `true` result
is accepted because it can represent verified GPS coverage. Without an
explicit backend result, the notification barangay must match the resident's
stored barangay.

If neither current-location coverage nor a stored barangay is available, the
client does not guess and display an arbitrary area's blocking emergency
modal. Two-second sensor monitoring and notification polling continue, so an
alert becomes eligible as soon as either location signal is verified.
