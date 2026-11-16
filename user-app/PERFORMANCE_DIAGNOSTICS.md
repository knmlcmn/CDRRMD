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

The EAS `production` environment must contain the flag at build/export time;
setting it only after an APK has been built cannot enable the embedded bundle.
Verify the remote environment with:

```powershell
npx eas-cli env:list --environment production
```

For a compatible local production-mode diagnostic export:

```powershell
$env:EXPO_PUBLIC_API_URL='https://cdrrmd-backend.vercel.app'
$env:EXPO_PUBLIC_PERFORMANCE_DIAGNOSTICS='true'
npx expo export --platform android --output-dir dist-android-diagnostics --clear
```

Start capture before launching the app so the Android log buffer cannot lose
the earliest measurements:

```powershell
adb logcat -c
adb logcat ReactNativeJS:I '*:S' | Tee-Object -FilePath next-performance-log.txt
```

The expected prefix is `[performance]`.

## Physical Android comparison captures

The package name is `ph.gov.calambacity.cdrrmd`. These commands only clear the
logcat buffer and force-stop/relaunch the app; they do not clear app data or
change the installed APK/OTA update.

For first SOS open, start logged in as a resident, run the commands below,
open Request Rescue once, wait for success/failure, and then dump the buffer:

```powershell
adb logcat -c
adb shell am force-stop ph.gov.calambacity.cdrrmd
adb shell monkey -p ph.gov.calambacity.cdrrmd -c android.intent.category.LAUNCHER 1
# On the device: open SOS once and wait for the route result.
adb logcat -d -v threadtime ReactNativeJS:I '*:S' > sos-first-open.txt
Select-String -Path sos-first-open.txt -Pattern '\[performance\].*(request-rescue|location-|evacuation-|osrm-|PlatformMap)'
```

For repeated open/cancel/reopen, keep the same resident session and perform at
least five Send Rescue Request -> Cancel Rescue Request cycles before allowing
the sixth route to finish:

```powershell
adb logcat -c
# On the device: perform five immediate open/cancel cycles, then finish cycle 6.
adb logcat -d -v threadtime ReactNativeJS:I '*:S' > sos-repeated-open.txt
Select-String -Path sos-repeated-open.txt -Pattern '\[performance\].*(request-rescue|evacuation-|osrm-|PlatformMap)'
```

`attemptNumber` identifies each SOS attempt. Cancelled work must end with
`outcome: cancelled`; there should be no late completed OSRM/capacity stage
from an earlier attempt after the final attempt begins.

For a direct rescuer login, begin at the logged-out screen without first
opening a resident portal in that app process:

```powershell
adb logcat -c
adb shell am force-stop ph.gov.calambacity.cdrrmd
adb shell monkey -p ph.gov.calambacity.cdrrmd -c android.intent.category.LAUNCHER 1
# On the device: sign in directly with the rescuer account.
adb logcat -d -v threadtime ReactNativeJS:I '*:S' > rescuer-direct.txt
Select-String -Path rescuer-direct.txt -Pattern '\[performance\].*(authentication-|rescuer-|api-request|js-thread-stall)'
```

For the account-switch comparison, log in as a resident, then clear logcat
immediately before Resident Portal -> Logout -> rescuer sign-in:

```powershell
adb logcat -c
# On the device: resident Logout, then sign in with the rescuer account.
adb logcat -d -v threadtime ReactNativeJS:I '*:S' > rescuer-after-resident.txt
Select-String -Path rescuer-after-resident.txt -Pattern '\[performance\].*(logout-|authentication-|rescuer-|api-request|js-thread-stall)'
```

Compare `authentication-request`, `rescuer-session-ready-direct` versus
`rescuer-session-ready-after-logout`, `rescuer-portal-ready`, and the two
logout cleanup stages. The cleanup stages may finish after portal readiness;
they must not delay it. API diagnostics contain only method, sanitized route,
status, duration, and concurrency--never credentials, coordinates, payloads,
or user identifiers.

## OTA-enabled v10 performance candidate

The Android v10 candidate uses channel and branch
`production-v10-performance`, runtime `1.0.4`, and the EAS `production`
environment. Build it only after review with:

```powershell
npx eas-cli build --platform android --profile production-v10-performance
```

After that APK has passed physical-device testing, publish compatible
JavaScript/TypeScript-only fixes with:

```powershell
npx eas-cli update --channel production-v10-performance --platform android --environment production --message "Describe the tested fix"
```

Keep `expo.version` at `1.0.4` for compatible v10 OTA updates. Changes to Expo
SDK/native dependencies, plugins, Android permissions, Firebase configuration,
package identity, or other native configuration require a new runtime and APK,
not an OTA update.

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
