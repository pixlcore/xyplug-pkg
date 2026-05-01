<p align="center"><img src="https://raw.githubusercontent.com/pixlcore/xyplug-pkg/refs/heads/main/logo.png" height="160" alt="Package Manager"/></p>
<h1 align="center">Package Manager</h1>

Manage all your system packages using the excellent [meta-package-manager](https://github.com/kdeldycke/meta-package-manager) project. This Event Plugin can report on outdated packages, generate package inventory reports, create SBOM files, install or remove packages, perform upgrades, back up package state, restore package state, and assemble combined upgrade reports across multiple servers.

This is a [xyOps](https://xyops.io) Event Plugin packaged as a pure Node.js marketplace plugin. It is designed to be attached to a scheduled Event and run nightly or weekly, so you can keep visibility into package drift and optionally automate upgrades.

## Features

- Pure Node.js marketplace plugin
- Supports two runtime launch methods for `meta-package-manager`: precompiled binary or `uvx`
- Supports reporting, e-mail notifications, and actual package upgrades
- Works across many different package managers on Linux, macOS, BSD, and Windows
- Can generate SBOM files in SPDX or CycloneDX formats
- Can back up package state to TOML and restore from a TOML backup
- Can aggregate outdated-package reports from multiple servers into one combined report

## Requirements

- One or more supported package managers installed on the target server
- Sufficient OS privileges for the operation you want to perform

Notes:

- If you use the precompiled binary launcher, the job runner needs network access to GitHub Releases on first run, so the plugin can download the standalone `meta-package-manager` binary.
- If you use the `uvx` launcher, `uvx` must already be installed and available on every target server where the plugin will run.
- Read-only tools such as reports and SBOM generation usually work with normal user permissions.
- Mutating tools such as install, upgrade, remove, and restore may require administrator or root privileges, depending on the package manager.
- The plugin only works with package managers that are both supported by `meta-package-manager` and actually detected on the current server.

## Overview

The plugin exposes a toolset with nine tools:

- [Outdated Packages](#outdated-packages)
- [List All Packages](#list-all-packages)
- [Software Bill of Materials](#software-bill-of-materials)
- [Install Packages](#install-packages)
- [Upgrade Packages](#upgrade-packages)
- [Remove Packages](#remove-packages)
- [Backup Packages](#backup-packages)
- [Restore Packages](#restore-packages)
- [Combined Report](#combined-report)

For most users, the main setup is simple:

1. Install or import the Plugin into xyOps.
2. Create an Event that uses **Package Manager**.
3. Choose the **Outdated Packages** tool.
4. Decide whether you want report-only, e-mail notifications, and/or automatic upgrades.
5. Schedule the Event to run nightly or weekly.

Nightly is a good fit for fast-moving systems. Weekly is a good fit for lower-change environments.

## Common Parameters

These parameters are available at the plugin level:

| Parameter | Description |
|-----------|-------------|
| `MPM Launcher` | Selects how to run `meta-package-manager`: precompiled binary or `uvx`. |
| `Tool Select` | Selects which package-management operation to run. |
| `Package Managers` | JSON object that enables or disables individual package managers. |

### MPM Launcher

Available options:

- `Binary`: Download and cache the precompiled standalone `meta-package-manager` executable, then run it directly.
- `UVX`: Execute `meta-package-manager` via `uvx`, pinned to the plugin's bundled version, assuming `uvx` is already installed on the target server.

Why this exists:

- On some Linux systems, the upstream precompiled binaries may require a newer `glibc` than the server provides.
- A common failure looks like: `/lib/x86_64-linux-gnu/libm.so.6: version GLIBC_2.38 not found`.
- The `uvx` option gives users a compatibility fallback when the standalone binary does not run cleanly on their fleet.

Recommended use:

- Use `Binary` if you want the simplest setup and it works on your servers.
- Use `UVX` if you have already standardized on Astral `uv`, or if the standalone binary fails due to `glibc` compatibility issues.
- If you choose `UVX`, make sure it is present on every server that may run the Event.

### Package Managers JSON

By default, the plugin enables all detected package managers except for a select few:

```json
{
  "*": true,
  "cpan": false,
  "uv": false,
  "vscode": false,
  "vscodium": false
}
```

Please adjust to taste.

Behavior notes:

- `*` means "enable all detected managers by default."
- Any manager explicitly set to `false` is excluded.
- Any manager explicitly set to `true` is included, as long as it is detected on the current server.
- If no supported managers are detected after filtering, the job fails.

## Supported Package Managers

As of the bundled `meta-package-manager` version used by this plugin, the following package managers are supported:

- [`apk`](https://gitlab.alpinelinux.org/alpine/apk-tools)
- [`apm`](https://atom.io/packages)
- [`apt`](https://wiki.debian.org/AptCLI)
- [`apt-mint`](https://github.com/kdeldycke/meta-package-manager/issues/52)
- [`brew`](https://brew.sh)
- [`cargo`](https://doc.rust-lang.org/cargo/)
- [`cask`](https://github.com/Homebrew/homebrew-cask)
- [`choco`](https://chocolatey.org)
- [`composer`](https://getcomposer.org)
- [`cpan`](https://www.cpan.org)
- [`deb-get`](https://github.com/wimpysworld/deb-get)
- [`dnf`](https://github.com/rpm-software-management/dnf)
- [`dnf5`](https://github.com/rpm-software-management/dnf5)
- [`emerge`](https://wiki.gentoo.org/wiki/Portage#emerge)
- [`eopkg`](https://github.com/getsolus/eopkg/)
- [`flatpak`](https://flatpak.org)
- [`fwupd`](https://fwupd.org)
- [`gem`](https://rubygems.org)
- [`guix`](https://guix.gnu.org)
- [`macports`](https://www.macports.org)
- [`mas`](https://github.com/argon/mas)
- [`nix`](https://nixos.org)
- [`npm`](https://www.npmjs.com)
- [`opkg`](https://git.yoctoproject.org/cgit/cgit.cgi/opkg/)
- [`pacaur`](https://github.com/E5ten/pacaur)
- [`pacman`](https://wiki.archlinux.org/title/pacman)
- [`pacstall`](https://pacstall.dev)
- [`paru`](https://github.com/Morganamilo/paru)
- [`pip`](https://pip.pypa.io)
- [`pipx`](https://pipx.pypa.io)
- [`pkg`](https://github.com/freebsd/pkg)
- [`ports`](https://www.freebsd.org/ports/)
- [`scoop`](https://scoop.sh)
- [`sdkman`](https://sdkman.io)
- [`sfsu`](https://github.com/winpax/sfsu)
- [`snap`](https://snapcraft.io)
- [`steamcmd`](https://developer.valvesoftware.com/wiki/SteamCMD)
- [`stew`](https://github.com/marwanhawari/stew)
- [`uv`](https://docs.astral.sh/uv)
- [`uvx`](https://docs.astral.sh/uv/guides/tools/)
- [`vscode`](https://code.visualstudio.com)
- [`vscodium`](https://vscodium.com)
- [`winget`](https://github.com/microsoft/winget-cli)
- [`xbps`](https://github.com/void-linux/xbps)
- [`yarn`](https://yarnpkg.com)
- [`yarn-berry`](https://yarnpkg.com)
- [`yay`](https://github.com/Jguer/yay)
- [`yum`](http://yum.baseurl.org)
- [`zerobrew`](https://github.com/lucasgelfond/zerobrew)
- [`zypper`](https://en.opensuse.org/Portal:Zypper)

Important notes:

- Support here means `meta-package-manager` knows how to work with the manager.
- Actual availability still depends on your operating system and what is installed on the target server.
- The plugin automatically queries the current server and only operates on managers that are detected locally.

## Tool Reference

### Outdated Packages

Checks all selected package managers for available upgrades, generates a Markdown report in the job output, optionally sends an e-mail, and can optionally perform the upgrades.

This is the best tool to use for a scheduled nightly or weekly maintenance event.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `Send Email` | No | Send an e-mail containing the outdated package report. |
| `Perform Upgrades` | No | Actually perform all available upgrades across the selected package managers. |
| `Email Addresses` | No | Comma-separated destination list for notification e-mails. |

Behavior notes:

- If no outdated packages are found, the job succeeds and exits quietly.
- If `Send Email` is enabled, e-mail is only sent when outdated packages are found, and `Email Addresses` is populated.
- To reduce duplicate notifications, the plugin remembers the last exact outdated report it e-mailed and skips re-sending the same report again.
- If `Perform Upgrades` is enabled, upgrades are executed after the report is generated.

Recommended use:

- Schedule this tool nightly or weekly.
- Start with `Perform Upgrades` disabled until you are comfortable with the reporting.
- Once validated, you can enable automatic upgrades if that matches your maintenance policy.

### List All Packages

Generates a Markdown report listing **all** installed packages across the selected package managers, and can optionally send the report by e-mail.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `Send Email` | No | Send an e-mail containing the installed package report. |
| `Email Addresses` | No | Comma-separated destination list for notification e-mails. |

Behavior notes:

- The report is attached to the job output as Markdown.
- Unlike the outdated report, this is a full inventory of all installed packages.
- If `Send Email` is enabled, the plugin sends the report after the job succeeds.

This tool is useful for audits, baseline inventory snapshots, and software review workflows.

### Software Bill of Materials

Generates a SBOM file for the selected package managers and attaches it to the xyOps job output.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `SBOM Format` | Yes | SBOM standard to use: `SPDX` or `CycloneDX`. |
| `File Format` | Yes | Output file format.  See below. |

Supported SBOM combinations:

| Standard | JSON | XML | YAML | TAG | RDF |
|----------|------|-----|------|-----|-----|
| `SPDX` | Yes | Yes | Yes | Yes | Yes |
| `CycloneDX` | Yes | Yes | No | No | No |

Behavior notes:

- The generated filename looks like `sbom-STANDARD-SERVERID.EXT`, for example `sbom-spdx-s12345.json`.
- The file is attached to the job output for download or downstream workflow use.
- `CycloneDX` only supports `JSON` and `XML`.

This is a good fit for compliance, security, asset inventory, and software supply chain workflows.

### Install Packages

Installs one or more specific packages using the selected package managers.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `Package IDs` | Yes | Comma-separated list of package IDs to install. Versions may be included with `@version` when supported by the underlying package manager. |

Behavior notes:

- The plugin passes the package IDs through to `meta-package-manager`.
- Whether version pinning works depends on the underlying package manager.
- You should generally target this at the specific server where you want the installation to occur.

Example:

```text
git,curl,jq
```

Example with versions where supported:

```text
node@22,npm@10
```

### Upgrade Packages

Upgrades one or more specific packages using the selected package managers.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `Package IDs` | Yes | Comma-separated list of package IDs to upgrade. Versions may be included with `@version` when supported by the underlying package manager. |

Behavior notes:

- This is for targeted upgrades, not a full "upgrade everything" pass.
- For full automatic maintenance, the **Outdated Packages** tool with `Perform Upgrades` is usually the better choice.

### Remove Packages

Removes one or more specific packages using the selected package managers.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `Package IDs` | Yes | Comma-separated list of package IDs to remove. |

Behavior notes:

- This is a destructive operation.
- Use with care, especially on shared servers or servers managed by configuration tools.

### Backup Packages

Creates a TOML backup of the current installed package state and attaches it to the job output.

This gives you a portable package manifest that can later be fed back into the plugin using the **Restore Packages** tool.

Parameters:

- None

Behavior notes:

- The generated filename looks like `packages-SERVERID.toml`.
- The backup file is attached to the job output.
- This is useful before major upgrades, migrations, or server rebuilds.

### Restore Packages

Restores package state from a TOML backup file that is provided as job input.

Parameters:

- None

Behavior notes:

- The plugin expects an input file attached to the job.
- It uses the first input file as the restore source.
- If no input file is present, the job fails.

Typical usage:

1. Run **Backup Packages** on a source server.
2. Download or pass the generated TOML file into another workflow step.
3. Run **Restore Packages** with that TOML file attached as job input.

### Combined Report

This tool merges multiple outdated-package reports into one combined Markdown report and can optionally send it by e-mail.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `Send Email` | No | Send an e-mail containing the combined report. |
| `Email Addresses` | No | Comma-separated destination list for notification e-mails. |

This tool is designed to receive [Outdated Packages](#outdated-packages) reports from multiple servers as job input data, by way of a [xyOps Workflow](https://docs.xyops.io/workflows), and a [Multiplex](https://docs.xyops.io/workflows/multiplex-controller) / [Join](https://docs.xyops.io/workflows/join-controller) operation.  Example workflow:

<p align="center"><img src="https://raw.githubusercontent.com/pixlcore/xyplug-pkg/refs/heads/main/images/workflow.png" alt="Example Workflow"/></p>

The idea here is that you multiplex the "Outdated Packages" jobs across your server fleet (or any target groups you want), and then those reports are piped through a Join controller, so they are all collected and combined before calling the "Combined Report" tool as a final job.

Behavior notes:

- This tool expects multiplexed input data items from upstream jobs.
- It is designed to run after multiple **Outdated Packages** jobs have completed.
- It produces a combined server summary plus a combined package summary.
- Like the single-server outdated report, it de-duplicates identical e-mail reports.

## Scheduling Recommendation

For most installations, the best starting point is to create a scheduled Event that uses **Outdated Packages**:

- Run nightly or weekly
- Send e-mail notifications
- Optionally perform upgrades
- Target the server or group of servers whose packages you want to manage

Suggested rollout:

1. Start with report-only mode.
2. Add e-mail notifications so the report reaches the right people.
3. After you trust the results, enable automatic upgrades if desired.

If you want a cluster-wide summary, build a workflow that runs **Outdated Packages** across multiple servers, then joins the outputs into **Combined Report**.

## Runtime Behavior

A few details about how the plugin works at runtime:

- The plugin can launch `meta-package-manager` in one of two ways, depending on your `MPM Launcher` selection.
- In `Binary` mode, the plugin downloads the standalone `meta-package-manager` binary from GitHub Releases the first time it runs on a server and caches it locally for reuse.
- In `UVX` mode, the plugin invokes `uvx meta-package-manager==VERSION` instead of downloading a standalone binary.
- Each non-combo run first asks `meta-package-manager` which package managers are available on the current server.
- The plugin filters that list using your `Package Managers` JSON configuration.
- Reports are emitted back to xyOps as Markdown job output.
- Generated files such as SBOM and package backup files are attached to the job output.

## Local Testing

The plugin expects a xyOps job payload on STDIN and emits [XYWP](https://docs.xyops.io/xywp) / report output on STDOUT.

If you select the `Binary` launcher, the plugin will attempt to download the standalone `meta-package-manager` binary from GitHub Releases on first run.

If you select the `UVX` launcher, make sure `uvx` is installed and available in the server's `PATH`.

### Report Only Example

```sh
cat <<'JSON' | node index.js
{
  "xy": 1,
  "type": "job",
  "id": "jtestpkg001",
  "event": "etestpkg001",
  "plugin": "ptestpkg001",
  "server": "local",
  "temp_dir": "/tmp",
  "params": {
    "tool": "outdated",
    "send_email": false,
    "do_upgrade": false,
    "email_addrs": "",
    "managers": {
      "*": true
    }
  },
  "input": {
    "data": {},
    "files": []
  }
}
JSON
```

## Data Collection

This plugin does not collect telemetry, analytics, or usage metrics.

Requests made by the underlying package managers, and by GitHub Releases when downloading the standalone `meta-package-manager` binary, may be logged by those services according to their own policies.

## Credits

This plugin is powered by [meta-package-manager](https://github.com/kdeldycke/meta-package-manager), by Kevin Deldycke, licensed under GPL-2.0.

## License

MIT.
