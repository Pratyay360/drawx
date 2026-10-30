#Requires -Version 5.1

<#
.SYNOPSIS
    Repackages a .msi installer into an .msix package.

.DESCRIPTION
    Fills an MSIX Packaging Tool conversion template (defaults come from
    src-tauri/tauri.conf.json), runs `MsixPackagingTool.exe create-package
    --template <template>`, verifies the output and removes the test
    installation the tool leaves behind.

    Requires an elevated console and the MSIX Packaging Tool on the machine
    (it installs the MSI while a driver captures system changes).

    The package is produced unsigned on purpose: for Microsoft Store
    distribution the Store re-signs the package during submission.

.PARAMETER MsiPath
    The .msi file, or a directory containing .msi files (the newest one is used).

.PARAMETER OutDir
    Directory for the .msix and the generated template. Defaults to the MSI's directory.

.PARAMETER PackageName
    MSIX identity name. Must match the package identity reserved in Partner Center.
    Defaults to the tauri.conf.json identifier; can be set via $env:MSIX_PACKAGE_NAME.

.PARAMETER PackageDisplayName
    Name shown to users. Defaults to tauri.conf.json productName.

.PARAMETER PublisherName
    Publisher from Partner Center (CN=...). Defaults to $env:MSIX_PUBLISHER.

.PARAMETER PublisherDisplayName
    Publisher display name. Defaults to tauri.conf.json bundle.publisher.

.PARAMETER PackageVersion
    Four-octet package version (x.y.z.w). Defaults to tauri.conf.json version.

.PARAMETER InstallLocation
    Root folder the MSI installs to (template Installer/@InstallLocation).
    Defaults to the folder resolved from the MSI Directory table.

.PARAMETER ToolPath
    Path to MsixPackagingTool.exe. Discovered automatically when omitted.

.EXAMPLE
    ./scripts/msi-to-msix.ps1 -MsiPath src-tauri/target/release/bundle/msi -OutDir msix-out
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string] $MsiPath,

    [string] $OutDir = '',

    [string] $PackageName = ($env:MSIX_PACKAGE_NAME),

    [string] $PackageDisplayName = '',

    [string] $PublisherName = ($env:MSIX_PUBLISHER),

    [string] $PublisherDisplayName = '',

    [string] $PackageVersion = '',

    [string] $InstallLocation = '',

    [string] $ToolPath = '',

    [string] $TauriConfig = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function ConvertTo-XmlAttributeValue {
    param([string] $Value)
    return [System.Security.SecurityElement]::Escape($Value)
}

function ConvertTo-MsixVersion {
    # MSIX requires exactly four octets, each 0..65535.
    param([string] $Version)

    $parts = @($Version.Trim() -split '\.')
    if ($parts.Count -gt 4) {
        throw "Version '$Version' has more than 4 components; MSIX requires x.y.z.w."
    }
    while ($parts.Count -lt 4) {
        $parts += '0'
    }

    $octets = @()
    foreach ($part in $parts) {
        $number = 0
        if (-not [int]::TryParse($part, [ref] $number) -or $number -lt 0 -or $number -gt 65535) {
            throw "Version component '$part' of '$Version' is not a number between 0 and 65535."
        }
        $octets += $number
    }
    return ($octets -join '.')
}

function Assert-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Administrator privileges are required: MsixPackagingTool installs the MSI on this machine while capturing the changes.'
    }
}

function Find-MsixPackagingTool {
    param([string] $Explicit)

    if ($Explicit) {
        if (-not (Test-Path $Explicit)) {
            throw "MsixPackagingTool not found at '$Explicit'."
        }
        return (Resolve-Path $Explicit).Path
    }

    foreach ($name in @('MsixPackagingTool.exe', 'MsixPackagingToolCLI.exe')) {
        $command = Get-Command $name -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($command) {
            return $command.Path
        }
    }

    # Installed as a Visual Studio individual component ("MSIX Packaging Tool").
    $searchRoots = @()
    $programFilesX86 = ${env:ProgramFiles(x86)}
    if ($programFilesX86) {
        $vsInstaller = Join-Path $programFilesX86 'Microsoft Visual Studio\Installer\vswhere.exe'
        if (Test-Path $vsInstaller) {
            $vsPath = & $vsInstaller -latest -property installationPath
            if ($vsPath) {
                $searchRoots += $vsPath.Trim()
            }
        }
    }
    foreach ($programFiles in @($env:ProgramFiles, ${env:ProgramFiles(x86)})) {
        if ($programFiles) {
            $vsRoot = Join-Path $programFiles 'Microsoft Visual Studio'
            if (Test-Path $vsRoot) {
                $searchRoots += $vsRoot
            }
        }
    }

    foreach ($root in ($searchRoots | Select-Object -Unique)) {
        $found = Get-ChildItem -Path $root -Filter 'MsixPackagingTool*.exe' -Recurse -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($found) {
            return $found.FullName
        }
    }

    return $null
}

function Get-DefaultDirName {
    # DefaultDir may be "SHORTN~1|Long Name"; the long name wins when present.
    param([string] $DefaultDir)

    if ($DefaultDir.Contains('|')) {
        return $DefaultDir.Substring($DefaultDir.IndexOf('|') + 1)
    }
    return $DefaultDir
}

function Get-MsiDefaultInstallLocation {
    # Resolves e.g. "C:\Program Files\My Company\My Product" from the MSI Directory table.
    param([string] $Path)

    $installer = New-Object -ComObject WindowsInstaller.Installer
    $database = $installer.OpenDatabase($Path, 0)
    $view = $database.OpenView('SELECT `Directory`, `Directory_Parent`, `DefaultDir` FROM `Directory`')
    $view.Execute() | Out-Null

    $rows = @()
    while ($record = $view.Fetch()) {
        $rows += [pscustomobject]@{
            Id     = $record.StringData(1)
            Parent = $record.StringData(2)
            Name   = $record.StringData(3)
        }
    }
    $view.Close()

    $rootId = $null
    $current = $null
    foreach ($candidate in @('ProgramFiles64Folder', 'ProgramFilesFolder')) {
        $child = $rows | Where-Object { $_.Parent -eq $candidate } | Select-Object -First 1
        if ($child) {
            $rootId = $candidate
            $current = $child
            break
        }
    }
    if (-not $current) {
        return $null
    }

    $names = @()
    while ($true) {
        $names += Get-DefaultDirName -DefaultDir $current.Name
        $children = @($rows | Where-Object { $_.Parent -eq $current.Id })
        if ($children.Count -ne 1) {
            break
        }
        $current = $children[0]
    }

    if ($rootId -eq 'ProgramFiles64Folder') {
        $base = if (${env:ProgramW6432}) { ${env:ProgramW6432} } else { $env:ProgramFiles }
    }
    else {
        $base = if (${env:ProgramFiles(x86)}) { ${env:ProgramFiles(x86)} } else { $env:ProgramFiles }
    }

    return (Join-Path $base ($names -join '\'))
}

function Read-MsiInfo {
    param([string] $Path)

    $info = [pscustomobject]@{
        ProductCode     = $null
        InstallLocation = $null
    }

    try {
        $installer = New-Object -ComObject WindowsInstaller.Installer
        $database = $installer.OpenDatabase($Path, 0)
        $view = $database.OpenView('SELECT `Value` FROM `Property` WHERE `Property` = ''ProductCode''')
        $view.Execute() | Out-Null
        $record = $view.Fetch()
        if ($record) {
            $info.ProductCode = $record.StringData(1)
        }
        $view.Close()
    }
    catch {
        Write-Warning "Could not read the ProductCode from the MSI: $($_.Exception.Message)"
    }

    try {
        $info.InstallLocation = Get-MsiDefaultInstallLocation -Path $Path
    }
    catch {
        Write-Warning "Could not resolve the install folder from the MSI: $($_.Exception.Message)"
    }

    return $info
}

function Test-MsiInstalled {
    param([string] $ProductCode)

    if (-not $ProductCode) {
        return $false
    }
    $uninstallKeys = @(
        "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\$ProductCode",
        "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\$ProductCode"
    )
    foreach ($key in $uninstallKeys) {
        if (Test-Path $key) {
            return $true
        }
    }
    return $false
}

function Invoke-MsiUninstall {
    param([string] $Target)

    $arguments = if ($Target.StartsWith('{')) {
        "/x $Target /qn /norestart"
    }
    else {
        "/x `"$Target`" /qn /norestart"
    }
    $process = Start-Process -FilePath 'msiexec.exe' -ArgumentList $arguments -Wait -PassThru -WindowStyle Hidden
    return $process.ExitCode
}

# --- Resolve identity defaults ------------------------------------------------

if (-not $TauriConfig) {
    $TauriConfig = Join-Path $PSScriptRoot '..\src-tauri\tauri.conf.json'
}

$tauri = $null
if (Test-Path $TauriConfig) {
    $tauri = Get-Content -Path $TauriConfig -Raw | ConvertFrom-Json
}
else {
    Write-Warning "tauri.conf.json not found at '$TauriConfig'; identity defaults are unavailable."
}

if (-not $PackageName -and $tauri) { $PackageName = $tauri.identifier }
if (-not $PackageDisplayName -and $tauri) { $PackageDisplayName = $tauri.productName }
if (-not $PublisherDisplayName -and $tauri) { $PublisherDisplayName = $tauri.bundle.publisher }
if (-not $PackageVersion -and $tauri) { $PackageVersion = $tauri.version }

$missing = @()
if (-not $PackageName) { $missing += '-PackageName (or $env:MSIX_PACKAGE_NAME, or tauri identifier)' }
if (-not $PackageDisplayName) { $missing += '-PackageDisplayName (or tauri productName)' }
if (-not $PublisherName) { $missing += '-PublisherName (or $env:MSIX_PUBLISHER, e.g. CN=67A9BB80-...)' }
if (-not $PublisherDisplayName) { $missing += '-PublisherDisplayName (or tauri bundle.publisher)' }
if (-not $PackageVersion) { $missing += '-PackageVersion (or tauri version)' }
if ($missing.Count -gt 0) {
    throw "Missing required package identity values:`n  $($missing -join "`n  ")"
}

$PublisherName = $PublisherName.Trim()
if ($PublisherName -notlike 'CN=*') {
    $PublisherName = "CN=$PublisherName"
}
$PackageVersion = ConvertTo-MsixVersion -Version $PackageVersion

# --- Resolve the MSI ----------------------------------------------------------

if (Test-Path $MsiPath -PathType Container) {
    $msi = Get-ChildItem -Path $MsiPath -Filter '*.msi' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $msi) {
        throw "No .msi file found in '$MsiPath'."
    }
}
elseif (Test-Path $MsiPath -PathType Leaf) {
    $msi = Get-Item $MsiPath
}
else {
    throw "MSI path '$MsiPath' does not exist."
}

if (-not $OutDir) {
    $OutDir = $msi.DirectoryName
}
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
$OutDir = (Resolve-Path $OutDir).Path

$baseName = $msi.BaseName
$packagePath = Join-Path $OutDir "$baseName.msix"
$templatePath = Join-Path $OutDir "$baseName.msix.template.xml"
$commandLineTemplatePath = Join-Path $OutDir "$baseName.msix.g.xml"

Assert-Administrator

$tool = Find-MsixPackagingTool -Explicit $ToolPath
if (-not $tool) {
    throw ("MsixPackagingTool.exe was not found. Install the MSIX Packaging Tool " +
           "(Visual Studio individual component or Microsoft Store app), or pass -ToolPath.")
}

# --- MSI metadata -------------------------------------------------------------

$msiInfo = Read-MsiInfo -Path $msi.FullName
$productCode = $msiInfo.ProductCode

$effectiveInstallLocation = $InstallLocation
if (-not $effectiveInstallLocation) {
    $effectiveInstallLocation = $msiInfo.InstallLocation
}

Write-Host "MSI               : $($msi.FullName)"
Write-Host "MSIX Packaging    : $tool"
Write-Host "Package           : $PackageName ($PackageDisplayName) v$PackageVersion"
Write-Host "Publisher         : $PublisherName ($PublisherDisplayName)"
Write-Host "Install location  : $(if ($effectiveInstallLocation) { $effectiveInstallLocation } else { '<not set>' })"
Write-Host "Output            : $packagePath"

# --- Conversion template ------------------------------------------------------

$installLocationAttribute = ''
if ($effectiveInstallLocation) {
    $installLocationAttribute = ' InstallLocation="' + (ConvertTo-XmlAttributeValue $effectiveInstallLocation) + '"'
}

$templateXml = @"
<?xml version="1.0" encoding="utf-8"?>
<MsixPackagingToolTemplate xmlns="http://schemas.microsoft.com/appx/msixpackagingtool/template/2018">
    <Settings AllowTelemetry="false" ApplyAllPrepareComputerFixes="true" GenerateCommandLineFile="true" AllowPromptForPassword="false" EnforceMicrosoftStoreVersioningRequirements="false" />
    <SaveLocation PackagePath="$(ConvertTo-XmlAttributeValue $packagePath)" TemplatePath="$(ConvertTo-XmlAttributeValue $commandLineTemplatePath)" />
    <Installer Path="$(ConvertTo-XmlAttributeValue $msi.FullName)"$installLocationAttribute />
    <PackageInformation PackageName="$(ConvertTo-XmlAttributeValue $PackageName)" PackageDisplayName="$(ConvertTo-XmlAttributeValue $PackageDisplayName)" PublisherName="$(ConvertTo-XmlAttributeValue $PublisherName)" PublisherDisplayName="$(ConvertTo-XmlAttributeValue $PublisherDisplayName)" Version="$PackageVersion" />
</MsixPackagingToolTemplate>
"@

Set-Content -Path $templatePath -Value $templateXml -Encoding UTF8

# --- Convert ------------------------------------------------------------------

try {
    if (Test-MsiInstalled -ProductCode $productCode) {
        Write-Host "Removing a previous installation ($productCode)..."
        $exitCode = Invoke-MsiUninstall -Target $productCode
        if ($exitCode -notin @(0, 1605, 1641, 3010)) {
            throw "Pre-conversion uninstall failed with msiexec exit code $exitCode."
        }
    }

    Remove-Item -Path $packagePath -Force -ErrorAction SilentlyContinue

    Write-Host "Running: $tool create-package --template $templatePath"
    & $tool create-package --template $templatePath
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        throw "MsixPackagingTool failed with exit code $exitCode."
    }

    if (-not (Test-Path $packagePath)) {
        throw "Conversion reported success but '$packagePath' was not created. Check the tool output above."
    }

    $created = Get-Item $packagePath
    Write-Host ("Created: {0} ({1:N0} KB)" -f $created.FullName, ($created.Length / 1KB))
}
finally {
    # The tool installs the MSI on this machine while capturing changes; clean up.
    if (Test-MsiInstalled -ProductCode $productCode) {
        Write-Host "Cleaning up the test installation..."
        $exitCode = Invoke-MsiUninstall -Target $productCode
        if ($exitCode -notin @(0, 1605, 1641, 3010)) {
            Write-Warning "Cleanup uninstall failed with msiexec exit code $exitCode."
        }
    }
}
