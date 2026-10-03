# EmbodyTools

Embody Games' Blockbench plugin. One plugin, with each tool as a card you switch on and off: the team's own tools for anyone signed in with an Embody Google account, and outside tools such as Wynncraft Content Tools for everyone. Tools update by themselves at your next Blockbench start.

## Install

1. In Blockbench: **File > Plugins**, then **Load Plugin from URL**, and paste
   ```
   https://raw.githubusercontent.com/Embody-Games/EGT-EmbodyTools/main/embodytools.js
   ```
2. Open **Tools > EmbodyTools**, or the **Tools** tab on its plugin page.
3. Click **Sign in with Google**, pick your Embody account, and switch on the tools you want.

Installed from that link, Blockbench downloads EmbodyTools again at every start, so new versions arrive by themselves. Don't rename the file: Blockbench works out a plugin's id from its filename.

Needs Blockbench 5.0.5 or newer. Signing in, and so the team's tools, needs the desktop app, on Windows, macOS or Linux. Outside tools work in the web version too.

If you had the old EmbodyTools 1.x installed from a downloaded file, remove it under **File > Plugins** first.

EmbodyTools never removes anything from your plugin list. A team tool you installed on its own keeps running as that copy, and its card says so. To use the card instead, which updates by itself, remove that copy or switch it off under **File > Plugins**.

## Signing in

- Google's sign-in, asking only for your name and email address. It gives EmbodyTools no access to your Drive, mail or anything else. Only Embody accounts can sign in.
- Blockbench asks permission once each for the four things the sign-in needs: listening on this computer for Google's answer, opening your browser, file access, and your computer's own credential storage, which keeps your sign-in encrypted. That's Windows' own on Windows, the Keychain on a Mac, and your desktop's keyring on Linux. A Linux desktop with no keyring gets a key file that only your account can read instead.
- The team's tools are checked against your account when Blockbench starts and every 15 minutes. They keep an encrypted offline copy, which works for up to a week without a connection.
- Signing out removes the team's tools, their offline copies and the saved sign-in. So does the end of your access.

## Outside tools

`loader/registry.json` lists the tools that aren't Embody Games' own. Each one loads from its own public link, with no sign-in. Adding a tool is an entry in that file: everyone sees its card at their next Blockbench start, with no EmbodyTools release. No outside tool gets file access unless Embody Games decides it.

**Add tool** on the Tools tab adds a plugin on your computer only, from its link. It never gets file access.

## Releases

`RELEASING.md` has how a release is made. License: MIT, see `LICENSE`.
