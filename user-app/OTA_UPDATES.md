# Android OTA release workflow

The Residents and Rescuers portals are bundled in the same Android application.
Production APKs use the EAS Update `production` channel, which currently maps to
the EAS branch of the same name. The app checks over HTTPS when it starts,
downloads a compatible update, and normally runs it on the next restart. Expo's
anti-bricking and rollback behavior remains enabled.

## One-time setup

Create a least-privilege Expo access token for an account that can publish to
`@polmokmoktomi/user-app`. Save it as the GitHub Actions repository secret
`EXPO_TOKEN`. Never commit the token.

Install the version `1.0.3` / versionCode `7` production APK once. It retains
the package name `ph.gov.calambacity.cdrrmd`, so EAS's existing Android signing
credentials allow it to replace the earlier APK without clearing app data.

## Normal compatible update

1. Test the mobile change locally.
2. Commit it and push it to GitHub `main`.
3. Existing Vercel projects continue deploying Admin Web and Backend from
   `main`; their Neon PostgreSQL configuration is unchanged.
4. The GitHub workflow type-checks `user-app` and publishes the Android bundle
   to the EAS `production` channel.
5. Installed production apps download the compatible update at launch and use
   it after a subsequent restart.

Manual equivalent:

```powershell
cd user-app
npm run ota:production -- --message "Describe the update"
```

## New APK required

Do not publish an OTA update when the native runtime changes. Examples include:

- adding, removing, or upgrading Expo/React Native or another native package;
- changing Android permissions, config plugins, package name, signing, or
  native notification/location/background behavior;
- changing `app.json`, `eas.json`, `package.json`, or `package-lock.json` in a
  way that can affect the native build;
- upgrading the Expo SDK or changing the runtime/update channel.

For a native release, increment both `expo.version` and
`expo.android.versionCode`, build and test a new APK, and only then publish OTA
updates for that new runtime. The GitHub workflow deliberately skips automatic
publishing when core app/build configuration or the workspace lockfile changes.

JavaScript, TypeScript, UI styles, bundled assets, navigation, and business/API
logic changes are OTA-compatible when they use only native modules already in
the installed APK.

## Installed-device verification

1. Install the production APK and launch it online once.
2. Publish a harmless, identifiable update to `production`.
3. Force-stop and launch once to download it; force-stop and launch again to
   run it.
4. Confirm the update in the installed app, then smoke-test Resident login and
   navigation, Rescuer login and navigation, API access, and live/polling data.
5. If any regression appears, republish the last known-good commit or use an
   EAS rollback before further production rollout.

EAS Update end-to-end developer code signing can be added only when the Expo
account has a Production or Enterprise plan. Standard EAS Update transport is
HTTPS; no certificate validation or anti-bricking protections are disabled by
this configuration.
