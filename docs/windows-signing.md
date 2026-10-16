# Windows code signing (Azure Artifact Signing, formerly Trusted Signing)

Unsigned installers are blocked by **Smart App Control** on clean Windows 11 machines
(no "run anyway" button) and warned on by SmartScreen. electron-updater also only
installs updates silently when the download is signed by the expected publisher.

We sign with Azure Artifact Signing: Basic tier ~10 USD/month, cloud signing, no hardware
token, supported for organizations in Israel. The CI (`.github/workflows/desktop.yml`) signs
the Windows installer only when every secret/variable below exists; otherwise it builds
unsigned, exactly as before.

## One-time setup in Azure (portal.azure.com)

1. Azure subscription (Pay-As-You-Go, credit card). Subscription > Resource providers >
   register `Microsoft.CodeSigning`.
2. Search "Artifact Signing Accounts" > Create: resource group `shoco-signing`, account
   name `shocomeet` (3-24 chars, globally unique), region **West Europe**
   (endpoint `https://weu.codesigning.azure.net`), pricing **Basic**.
3. Account > Access control (IAM) > add yourself the role **Artifact Signing Identity Verifier**
   (you also need Reader on the subscription).
4. Account > Identity validations > Organization > New identity > **Public**:
   legal business name as registered, website `shocomarketing.co.il`, primary + secondary
   e-mail on that domain, business identifier (ח.פ / עוסק מורשה), address, your first/last name
   exactly as on your ID. Then follow the "Action required" link: AU10TIX ID check with the
   phone camera + Microsoft Authenticator (Verified ID). Microsoft processing: 1-20 business days.
5. When the validation is **Completed**: Certificate profiles > Create > **Public Trust**,
   name `shocomeet-public`, pick the validated identity. Copy the **certificate subject**
   shown in the preview (e.g. `CN=Shoco Marketing, O=Shoco Marketing, L=..., S=..., C=IL`).
6. Microsoft Entra ID > App registrations > New registration `shoco-meet-ci` (single tenant).
   Copy **Application (client) ID** and **Directory (tenant) ID**. Certificates & secrets >
   New client secret (24 months) > copy the **Value** immediately.
7. Back on the Artifact Signing account > Access control (IAM) > Add role assignment >
   **Artifact Signing Certificate Profile Signer** > assign to the app `shoco-meet-ci`
   (search by its name under "User, group, or service principal").

## GitHub repository settings (Settings > Secrets and variables > Actions)

Secrets: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`.
Variables: `AZURE_SIGN_ENDPOINT` (`https://weu.codesigning.azure.net`), `AZURE_SIGN_ACCOUNT`
(`shocomeet`), `AZURE_SIGN_PROFILE` (`shocomeet-public`), `AZURE_SIGN_PUBLISHER`
(the exact certificate subject from step 5; electron-updater checks it before installing).

Then tag a release (`vX.Y.Z` matching `desktop/package.json`). The Windows job logs
"Azure signing configured". Verify on Windows: installer Properties > Digital Signatures.

Notes: Artifact Signing certificates rotate daily (short-lived) but stay valid thanks to
timestamping. macOS is still unsigned (Apple Developer Program, 99 USD/year, is a separate decision).
