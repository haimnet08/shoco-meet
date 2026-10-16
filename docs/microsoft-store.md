# Microsoft Store distribution (chosen 16.10.2026 instead of Azure code signing)

Why: Smart App Control on clean Windows 11 blocks unsigned installers with no override. Store apps
are signed by Microsoft, install with one click, and update through the Store. Cost: Partner Center
individual developer account, 19 USD one-time. Trade-off: every version passes Microsoft
certification (usually 1-3 days) and the listing must be maintained.

## 1. Partner Center (Haim, once)
1. https://partner.microsoft.com/dashboard/registration → sign in with a Microsoft account
   (personal account is fine for an individual developer) → "Individual" → 19 USD, credit card.
2. Apps and games → New product → MSIX or PWA app → reserve the name **Shoco Meet**.
3. Product → Product management → **Product identity**. Copy three values:
   - `Package/Identity/Name` (looks like `12345HaimNeta.ShocoMeet`)
   - `Package/Identity/Publisher` (looks like `CN=12345678-1234-...`)
   - `Package/Properties/PublisherDisplayName`

## 2. GitHub (agent, once the values exist)
```
gh variable set APPX_IDENTITY_NAME    -R haimnet08/shoco-meet -b "<Package/Identity/Name>"
gh variable set APPX_PUBLISHER        -R haimnet08/shoco-meet -b "<Package/Identity/Publisher>"
gh variable set APPX_PUBLISHER_DISPLAY -R haimnet08/shoco-meet -b "<PublisherDisplayName>"
```
Then push a tag (or `gh workflow run desktop.yml`). The Windows job adds the step
"Microsoft Store package (AppX)" and uploads the artifact **shoco-meet-store-appx**
(`Shoco-Meet-win.appx`, unsigned: the Store signs it). Download it from the run page.

## 3. Submission (Haim or agent in the browser, per version)
Product → Start your submission:
- **Packages:** upload `Shoco-Meet-win.appx` (x64). Device family: Windows 10/11 desktop.
- **Pricing and availability:** Free, all markets (or Israel only), visibility public.
- **Properties:** category Productivity (or Business); privacy policy URL
  `https://meet.shocoweb.com/privacy.html`; website `https://meet.shocoweb.com`;
  support contact `haim@shocomarketing.co.il`. Declarations: "This app accesses camera, microphone
  and allows remote control only after explicit user consent" (answer the questionnaire honestly;
  the app uses webcam, microphone, internet).
- **Age ratings:** IARC questionnaire, utility app, no user-generated public content → "All ages / 3+".
- **Store listings:** English + Hebrew texts from `docs/store/listing-he.md` / `listing-en.md`,
  screenshots `docs/store/*.png` (1366x768), logo = `desktop/build/appx/Square310x310Logo.png`.
- **Submission options:** publish as soon as certification passes.
Certification: typically 1-3 days. Afterwards: Product → Product identity → Store ID
(`9Nxxxxxxxxx`); the listing URL is `https://apps.microsoft.com/detail/<StoreID>`. Put that URL
into `STORE_URL` in `web/app.js` and deploy (the "Windows" download buttons then open the Store page).

## Notes
- Store builds set `process.windowsStore`, so the in-app updater is off there (the Store updates).
- Protocol `shocomeet://` is declared in the AppX manifest (electron-builder `protocols`), so the
  invite page still opens the installed app directly.
- The GitHub installer (unsigned exe) stays for machines where the Store is blocked and
  Smart App Control is off.
