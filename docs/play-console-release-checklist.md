# NoteBill Play Console Release Checklist

Use this when the Android bundle is uploaded and you want the shortest path to review.

## Current release

- App: `NoteBill`
- Package: `app.notebill.app`
- Version: `2.1.50`
- Version code: `78`
- Bundle: `android/app/build/outputs/bundle/release/app-release-2.1.50.aab`

## What is already done

- Advertising ID declaration is completed
- The release bundle contains the required packaged web assets
- `npm run build` passed
- `npm run check:frontend-routes` passed
- `npm run check:production-sanity` passed
- `npm run check:android-release` passed

## Final steps in Play Console

1. Open **Play Console** and go to **Publishing overview**.
2. Confirm the latest changes are attached to the release.
3. Make sure any remaining **App content** or **Policy** items are completed.
4. Review the release summary one last time.
5. Click **Send for review**.

## If Play shows another issue

- If it is a policy declaration, complete that declaration first.
- If it is a release readiness check, fix the issue and re-upload the same version.
- If it is only an informational warning, keep going unless Play blocks submission.

## After sending for review

- Keep managed publishing in mind if you want to delay public release after approval.
- Watch for review status updates in Publishing overview.
- If approval comes back clean, proceed with the staged rollout or production publish plan.

## Right after Play submission

1. Finish GA4 key event marking and Google Ads conversion import.
2. Keep the launch packet and Play listing copy aligned with the latest product state.
3. Be ready for the real-device billing proof window when your subscription expires.
