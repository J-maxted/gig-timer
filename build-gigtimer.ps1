<#
.SYNOPSIS
  One‑shot personal build script for Expo/EAS "Gig Timer" – Android APK + iOS Ad Hoc via direct links.

.USAGE
  # In the project root (where package.json/app.json live):
  # 1) Run in a new PowerShell window (Windows Terminal recommended):
  #    Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
  #    ./build-gigtimer.ps1
  #
  # 2) Answer the prompts. You can pre-fill defaults by editing the PARAMS section below.

.NOTES
  - Requires Node.js, npm, Git installed locally.
  - Expo/EAS builds run in the cloud; Android SDK/Xcode are NOT required on your machine.
  - iOS Ad Hoc requires an Apple Developer (Individual or Company/Org) account and device UDIDs.

#>

# =========================
# ====== PARAMETERS =======
# =========================
$AppName             = "Gig Timer"
$BundleIdentifier    = "com.yourname.gigtimer"  # iOS bundle id (change if you like)
$AndroidPackage      = "com.yourname.gigtimer"  # Android package (change if you like)
$AppVersion          = "1.0.0"
$IosBuildNumber      = "1.0.0"
$AndroidVersionCode  = 1

# Build profile to use from eas.json (we create a preview profile if missing)
$EasProfile          = "preview"

# Set to $true to update/ensure basic app.json fields before building
$EnsureAppJson       = $true

# If true, script will prompt to run iOS device registration before building iOS
$RegisterIosDevices  = $true

# If true, offer to publish an OTA update to the same "preview" branch at the end
$OfferEasUpdate      = $true


# =========================
# ====== FUNCTIONS ========
# =========================
function Write-Header($text) {
  Write-Host "`n=== $text ===" -ForegroundColor Cyan
}

function Exit-OnError($Message) {
  Write-Host "ERROR: $Message" -ForegroundColor Red
  exit 1
}

function Check-Cmd($cmd, $display) {
  $exists = Get-Command $cmd -ErrorAction SilentlyContinue
  if (-not $exists) { Exit-OnError "$display ('$cmd') not found on PATH." }
}

function Ensure-GlobalCli($cmd, $pkg) {
  $exists = Get-Command $cmd -ErrorAction SilentlyContinue
  if (-not $exists) {
    Write-Host "Installing $pkg globally..."
    npm i -g $pkg | Out-Null
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
      Exit-OnError "Failed to install $pkg"
    }
  }
}

function Ensure-AppJson() {
  if (-not (Test-Path "./app.json") -and -not (Test-Path "./app.config.js") -and -not (Test-Path "./app.config.ts")) {
    Exit-OnError "No app.json/app.config.* found. Run 'npx expo init' or create one."
  }

  if (Test-Path "./app.json") {
    Write-Host "Ensuring fields in app.json..."
    $json = Get-Content ./app.json -Raw | ConvertFrom-Json

    if (-not $json.expo) { $json | Add-Member -Name "expo" -Value (@{}) -MemberType NoteProperty }

    $json.expo.name            = $AppName
    $json.expo.slug            = "gig-timer"
    $json.expo.version         = $AppVersion

    if (-not $json.expo.runtimeVersion) { $json.expo.runtimeVersion = @{} }
    $json.expo.runtimeVersion.policy = "sdkVersion"

    if (-not $json.expo.updates) { $json.expo.updates = @{} }
    $json.expo.updates.fallbackToCacheTimeout = 0

    if (-not $json.expo.ios) { $json.expo.ios = @{} }
    $json.expo.ios.bundleIdentifier = $BundleIdentifier
    $json.expo.ios.buildNumber      = $IosBuildNumber

    if (-not $json.expo.android) { $json.expo.android = @{} }
    $json.expo.android.package     = $AndroidPackage
    $json.expo.android.versionCode = $AndroidVersionCode

    $json | ConvertTo-Json -Depth 10 | Out-File -Encoding utf8 ./app.json
  } else {
    Write-Host "Found app.config.* — please ensure identifiers are set there."
  }
}

function Ensure-EasJson() {
  if (-not (Test-Path "./eas.json")) {
    Write-Host "Creating minimal eas.json..."
    $eas = @{
      cli = @{ version = ">= 12.5.0" }
      build = @{
        $EasProfile = @{
          distribution = "internal"
          android     = @{ buildType = "apk" }
          ios         = @{ simulator = $false }
        }
      }
    } | ConvertTo-Json -Depth 10
    $eas | Out-File -Encoding utf8 ./eas.json
  } else {
    # Validate profile exists; if not, append it
    $easObj = Get-Content ./eas.json -Raw | ConvertFrom-Json
    if (-not $easObj.build.$EasProfile) {
      Write-Host "Adding '$EasProfile' profile to eas.json..."
      $easObj.build | Add-Member -Name $EasProfile -MemberType NoteProperty -Value @{
        distribution = "internal"
        android     = @{ buildType = "apk" }
        ios         = @{ simulator = $false }
      }
      $easObj | ConvertTo-Json -Depth 10 | Out-File -Encoding utf8 ./eas.json
    }
  }
}

function Show-SectionTip($title, $lines) {
  Write-Header $title
  $lines | ForEach-Object { Write-Host " - $_" }
}

# =========================
# ====== EXECUTION ========
# =========================
Write-Header "Environment checks"
Check-Cmd node "Node.js"
Check-Cmd npm  "npm"
Check-Cmd git  "Git"

Write-Host "Node: $(node -v)"
Write-Host "npm : $(npm -v)"
Write-Host "Git : $(git --version)"

Write-Header "Ensuring Expo & EAS CLI"
Ensure-GlobalCli "expo" "expo-cli"          # expo-cli is optional; most commands are npx expo these days
Ensure-GlobalCli "eas"  "eas-cli"

# Make sure we are in a project (package.json)
if (-not (Test-Path "./package.json")) {
  Exit-OnError "No package.json in current directory. Run from your project root."
}

Write-Header "Installing project deps (npm ci or npm install)"
if (Test-Path "./package-lock.json") {
  npm ci || Exit-OnError "npm ci failed"
} else {
  npm install || Exit-OnError "npm install failed"
}

# Ensure app.json / eas.json content
if ($EnsureAppJson) { Ensure-AppJson }
Ensure-EasJson

Write-Header "Login to Expo/EAS (if needed)"
eas whoami | Out-Null
if ($LASTEXITCODE -ne 0) {
  eas login || Exit-OnError "EAS login failed"
}

# ANDROID BUILD
Write-Header "Building Android (APK via '$EasProfile')"
$androidLog = New-TemporaryFile
eas build -p android --profile $EasProfile 2>&1 | Tee-Object -FilePath $androidLog
if ($LASTEXITCODE -ne 0) { Exit-OnError "Android build failed. See log: $androidLog" }

# Extract install page from output (basic pattern match)
$AndroidUrl = Select-String -Path $androidLog -Pattern "https?://.*expo\.dev.*" -SimpleMatch | Select-Object -Last 1 | ForEach-Object { $_.Matches.Value }
if (-not $AndroidUrl) { Write-Host "Could not auto-detect Android install URL. Open the EAS build page to copy it." -ForegroundColor Yellow }

# iOS DEVICE REGISTRATION (optional)
if ($RegisterIosDevices) {
  Write-Header "iOS device registration (Ad Hoc)"
  Write-Host "If you have NEW testers, register their UDIDs now. Otherwise, press Ctrl+C to skip."
  Write-Host "A short link will be generated; send it to testers (must open in Safari)."
  try {
    eas device:create
  } catch {
    Write-Host "Skipping device registration." -ForegroundColor Yellow
  }
}

# IOS BUILD
Write-Header "Building iOS (Ad Hoc via '$EasProfile')"
$iosLog = New-TemporaryFile
eas build -p ios --profile $EasProfile 2>&1 | Tee-Object -FilePath $iosLog
if ($LASTEXITCODE -ne 0) { Exit-OnError "iOS build failed. See log: $iosLog" }

# Extract install page from output
$IosUrl = Select-String -Path $iosLog -Pattern "https?://.*expo\.dev.*" -SimpleMatch | Select-Object -Last 1 | ForEach-Object { $_.Matches.Value }
if (-not $IosUrl) { Write-Host "Could not auto-detect iOS install URL. Open the EAS build page to copy it." -ForegroundColor Yellow }

# SUMMARY
Write-Header "Build complete – share these links"
if ($AndroidUrl) { Write-Host "Android (APK) install page: $AndroidUrl" -ForegroundColor Green }
if ($IosUrl)     { Write-Host "iOS (Ad Hoc) install page: $IosUrl" -ForegroundColor Green }

Show-SectionTip "Tester guidance – Android" @(
  "Open the link on the phone, download the APK, then install.",
  "If Play Protect warns: More details → Install anyway.",
  "If blocked: Settings → Apps → Special access → Install unknown apps (enable for the browser)."
)

Show-SectionTip "Tester guidance – iOS" @(
  "If first-time: you must add their device via the registration link, then rebuild.",
  "Install from Safari using the install page link above.",
  "First run only: Settings → General → VPN & Device Management → Trust Developer App."
)

# OPTIONAL OTA UPDATE
if ($OfferEasUpdate) {
  Write-Header "Optional: Publish OTA update to the 'preview' branch"
  Write-Host "Run this anytime after code changes (no reinstall needed):"
  Write-Host "  eas update --branch $EasProfile --message `"Quick fix`""
}

Write-Host "`nAll done. Happy racing! 🛶"