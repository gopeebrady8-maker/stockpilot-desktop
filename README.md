# Holdbay desktop (Windows & macOS)

The desktop app is a proper installed program (Start menu / Dock icon, its own window, menus, printing, camera
for barcode scanning) that shows the live Holdbay website inside it.

**Updates**
- Website changes (new features, fixes) reach desktop users automatically the next time they open the app. Nothing to download.
- Changes to the app itself (icon, menus, window) are built here, and installed apps update themselves in the background
  and ask to restart.

## One-time setup

1. **GitHub account** – sign up free at github.com.
2. **New repository** – click **+ → New repository**, name it `stockpilot-desktop`, choose **Public**
   (installed apps download their updates from it; it contains no passwords or keys), click **Create repository**.
3. **Upload this folder's contents** – on the new repository page click **uploading an existing file**.
   In Finder open this `desktop` folder, press **⌘⇧.** (Command-Shift-full stop) to show hidden files so the
   `.github` folder appears, select **everything inside** (`.github`, `build`, `src`, `.gitignore`, `package.json`,
   `README.md`) and drag it onto the GitHub page. Click **Commit changes**.
4. **Your username** – on GitHub open `package.json`, click the pencil, replace
   `gopeebrady8-maker` with your GitHub username, **Commit changes**.

## Make the installers (every release)

1. GitHub → your repository → **Actions** (enable workflows if asked) → **Build Holdbay desktop** → **Run workflow**.
2. Type the version (first time `1.0.0`; after that always higher: `1.0.1`, `1.1.0`…) → **Run workflow**. It takes 10–20 minutes.
3. GitHub → **Releases** → the draft release holds:
   - `Holdbay-Setup-1.0.0.exe` (Windows, Intel and ARM)
   - `Holdbay-1.0.0-mac.dmg` (Mac, Apple Silicon and Intel)
4. Download and test them. Then click **Edit → Publish release**. Publishing is what lets installed apps update.
5. In Holdbay → **Download Holdbay → Release management**, add each installer with its download link
   (right-click the file in the GitHub release → Copy link), its size and requirements, then **Verify** and **Publish**.
   The download buttons appear on the Download page.

## Signing (before giving it to customers)

Without signing, Windows shows "Windows protected your PC" and macOS refuses to open the app ("unidentified developer").
Unsigned builds are fine for your own testing (Mac: right-click the app → Open).

- **macOS:** Apple Developer Program, US$99/year (the same membership the iPhone app needs). Create a
  *Developer ID Application* certificate, then add these repository secrets (Settings → Secrets and variables → Actions):
  `CSC_LINK` (the .p12 file, base64), `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.
  Mac apps only update themselves once they're signed.
- **Windows:** Microsoft Trusted Signing (Azure) or a code-signing certificate from a provider such as Sectigo or SSL.com.
  For Trusted Signing add `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_ENDPOINT`,
  `AZURE_CODE_SIGNING_ACCOUNT`, `AZURE_CERT_PROFILE`. Check the current eligibility rules for South African businesses
  before paying.

The next build after you add the secrets is signed automatically.

## Where things are

- `src/main.js` – the window, menus, link handling, camera permission, updates. The web address is `APP_URL` at the top:
  change it when Holdbay moves to its own domain, then build a new version.
- `src/offline.html` – shown when there's no internet.
- `build/icon.png` – app icon (1024×1024).
- `.github/workflows/build-desktop.yml` – the build.
