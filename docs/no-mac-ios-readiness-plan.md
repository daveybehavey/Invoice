# No-Mac iOS Readiness Plan

Goal: keep NoteBill ready for the App Store without requiring a personal Mac upfront.

## What we need

1. Apple Developer Program access
2. App Store Connect access for the app record
3. A Mac-based build path later, but not necessarily owned hardware
4. App assets and metadata that are ready before the first iOS build

## Best-practice build path options

Apple supports uploading builds through Xcode, Transporter, altool, and Xcode Cloud. App Store Connect is also available on the web.

Best options if we do not own a Mac:

1. Xcode Cloud
2. Borrowed Mac
3. Rented cloud Mac

## Repo readiness checklist

Before we spend time on iOS build infrastructure, the app should be ready in these ways:

1. The product story is stable
2. The launch flow is stable on web
3. The quick AI invoice path is the main entry point
4. The app has consistent branding, icon, and screenshots
5. Privacy, support, and policy pages exist and are current
6. The release versioning scheme is clean and predictable

## App Store assets to prepare

1. App name
2. Subtitle
3. Description
4. Keywords
5. Support URL
6. Privacy policy URL
7. Screenshots for iPhone sizes
8. App icon set
9. Age rating answers
10. Advertising ID and data use declarations
11. Mobile screenshot audit output

## Functional checks before iOS work

1. Quick AI invoice flow works on mobile
2. Pricing choice is clear
3. Trust / FAQ content is present
4. Statement and follow-up flows remain discoverable
5. Analytics and conversion tracking still work
6. Route aliases and direct entry paths do not break on mobile

## Suggested sequence

1. Finish product polish and conversion work on web
2. Lock the App Store metadata and screenshots using the launch pack
3. Pick the cheapest Mac build path when we are actually ready to ship iOS
4. Upload to TestFlight first
5. Fix any iOS-only issues
6. Submit to the App Store

## Current recommendation

Do not buy a Mac yet.

Keep the product and launch assets ready, then use a cloud Mac or Xcode Cloud when the iOS release becomes worth the effort.
