# Server-Bot – Vollständige Anleitung

Ein modularer Discord-Bot mit Verifizierung, Tickets, Moderation, Logging, Text-XP,
Voice-XP, Level-Rollen, Auto-Rollen, Embed-Builder und zentraler `/config`-Oberfläche.

Diese Anleitung ist für **Anfänger** geschrieben und geht jeden Schritt einzeln durch.
Du kannst alles auf dem Handy machen (z. B. mit der App **Termux** unter Android)
oder an einem PC – die Schritte sind identisch.

---

## Inhalt
1. [Was du brauchst](#1-was-du-brauchst)
2. [Bot im Discord Developer Portal anlegen](#2-bot-im-discord-developer-portal-anlegen)
3. [Bot auf deinen Server einladen](#3-bot-auf-deinen-server-einladen)
4. [Dateien vorbereiten](#4-dateien-vorbereiten)
5. [Bot installieren und starten](#5-bot-installieren-und-starten)
6. [Ersteinrichtung in Discord](#6-ersteinrichtung-in-discord)
7. [Alle Befehle im Überblick](#7-alle-befehle-im-überblick)
8. [Der Verifizierungs-Ablauf](#8-der-verifizierungs-ablauf)
9. [Wie du den Bot erweiterst](#9-wie-du-den-bot-erweiterst)
10. [Fehlerbehebung](#10-fehlerbehebung)
11. [Wichtige technische Hinweise](#11-wichtige-technische-hinweise)

---

## 1. Was du brauchst

- Einen Computer oder ein Handy mit Termux
- [Node.js](https://nodejs.org) Version 18 oder neuer
- Adminrechte auf deinem Discord-Server
- Etwa 20–30 Minuten Zeit für die Ersteinrichtung

---

## 2. Bot im Discord Developer Portal anlegen

1. Öffne https://discord.com/developers/applications
2. Klicke oben rechts auf **New Application**, gib einen Namen ein (z. B. "Server-Bot") und bestätige.
3. Klicke links im Menü auf **Bot**.
4. Klicke auf **Reset Token** → **Yes, do it!** → **Copy**.
   Speichere diesen Token sicher zwischen (z. B. in einer Passwort-App). **Teile ihn mit niemandem.**
5. Scrolle auf derselben Seite zu **Privileged Gateway Intents** und aktiviere:
   - ✅ **Server Members Intent**
   - ✅ **Message Content Intent**
6. Speichere die Änderungen (Discord speichert meist automatisch).

---

## 3. Bot auf deinen Server einladen

1. Klicke links im Menü auf **OAuth2** → **URL Generator**.
2. Setze bei **Scopes** ein Häkchen bei `bot` und bei `applications.commands`.
3. Setze bei **Bot Permissions** ein Häkchen bei **Administrator**
   (am einfachsten für den Start – du kannst die Rechte später einschränken).
4. Kopiere den Link ganz unten, öffne ihn in einem neuen Tab, wähle deinen Server aus und bestätige.
5. Gehe danach in deine **Servereinstellungen → Rollen** und ziehe die neue Bot-Rolle **so weit wie möglich nach oben**
   (mindestens über `Member`, `Unverified` und alle Rollen, die der Bot verwalten soll).

---

## 4. Dateien vorbereiten

1. Lade dir den kompletten Projektordner herunter und entpacke ihn.
2. Suche die Datei `.env.example` im Hauptordner. Kopiere sie und benenne die Kopie in `.env` um
   (nur `.env`, ohne "example").
3. Öffne die `.env` mit einem Texteditor und trage ein:

```env
DISCORD_TOKEN=dein_token_aus_schritt_2
GUILD_ID=deine_server_id
DATABASE_PATH=./data/database.json
AUTO_DEPLOY=true
```

**Server-ID herausfinden:** Discord-Einstellungen (Zahnrad) → **Erweitert** → **Entwicklermodus** aktivieren.
Dann Rechtsklick auf dein Server-Symbol → **Server-ID kopieren**.

> `GUILD_ID` sorgt dafür, dass die Befehle **sofort** auf deinem Server erscheinen.
> Lässt du das Feld leer, werden die Befehle global registriert – das kann bis zu einer Stunde dauern.

---

## 5. Bot installieren und starten

Öffne ein Terminal (PC: Eingabeaufforderung/PowerShell/Terminal, Handy: Termux)
und wechsle in den Projektordner:

```bash
cd pfad/zu/deinem/ordner
```

Installiere einmalig alle benötigten Pakete:

```bash
npm install
```

Starte den Bot:

```bash
npm start
```

Wenn alles funktioniert, siehst du im Terminal unter anderem:

```
[INFO] Datenbank geladen: ...
[INFO] 📦 15 Commands geladen.
[INFO] 📦 12 Events geladen.
[INFO] ✅ Eingeloggt als DeinBot#1234 (1 Server)
[INFO] 📤 ... Commands auf Server ... registriert (sofort verfügbar).
[INFO] 🚀 Bot ist vollständig bereit.
```

Lass das Terminal-Fenster offen – schließt du es, geht der Bot offline.
Für den Dauerbetrieb (24/7) brauchst du einen Server/VPS und ein Tool wie `pm2` (siehe Abschnitt 10).

---

## 6. Ersteinrichtung in Discord

Führe diese Befehle **in dieser Reihenfolge** aus:

1. **Log-Kanal festlegen**
   ```
   /config channels
   ```
   Wähle **LOGS (Standard)** und deinen Log-Kanal. Optional auch `TICKET_LOGS` und `TRANSCRIPTS`.

2. **Kategorien festlegen** (optional, aber empfohlen)
   ```
   /config categories
   ```
   Kategorien für Verifizierung, Support, Reports, Bewerbungen und ein Archiv festlegen.

3. **Verifizierungs-Panel senden**
   ```
   /verify setup
   ```
   Führe den Befehl in dem Kanal aus, den **nur `Unverified`-User sehen sollen**.
   Der Bot sendet dort das Panel und setzt die Kanalrechte automatisch.

4. **Ticket-Panel(s) für normale Tickets senden**
   ```
   /ticket setup
   ```
   Du kannst beliebig viele Panels mit unterschiedlichen Tickettypen senden.

5. **XP-System prüfen/anpassen** (Standardwerte funktionieren bereits ohne weitere Einstellung)
   ```
   /config xp
   /config voice
   ```

6. **Level-Rollen einrichten** (optional)
   ```
   /levelrole add level:5 role:@Bronze
   /levelrole add level:10 role:@Silber
   ```

Fertig! Der Bot arbeitet jetzt vollständig mit deinen bereits vorhandenen Rollen
(`Owner`, `Admin`, `Tickets`, `Moderator`, `Member`, `Unverified`, `Bot`).

---

## 7. Alle Befehle im Überblick

> Hinweis zu `/xp`, `/level`, `/voice`: Discord erlaubt es technisch nicht, dass ein Befehl
> gleichzeitig ohne UND mit Unterbefehlen funktioniert. Deshalb heißt "XP anzeigen" `/xp view`
> statt nur `/xp`. Alle anderen Befehle entsprechen genau der ursprünglichen Planung.

| Bereich | Befehle |
|---|---|
| **Text-XP** | `/xp view [user]`, `/xp leaderboard`, `/xp add`, `/xp remove`, `/xp set`, `/xp reset`, `/xp config` |
| **Level** | `/level view [user]`, `/level leaderboard`, `/level rewards`, `/level set`, `/level reset`, `/level config` |
| **Voice-XP** | `/voice xp [user]`, `/voice level [user]`, `/voice leaderboard`, `/voice add`, `/voice remove`, `/voice reset`, `/voice config` |
| **Verifizierung** | `/verify setup`, `/verify status`, `/verify user`, `/verify approve`, `/verify reject`, `/verify config` |
| **Tickets** | `/ticket setup`, `create`, `close`, `claim`, `unclaim`, `add`, `remove`, `rename`, `priority`, `transcript`, `delete`, `info`, `types`, `type create/edit/delete`, `config` |
| **Reports** | `/report create`, `list`, `view`, `close`, `delete` |
| **Moderation** | `/mod warn`, `warnings`, `clearwarn`, `timeout`, `kick`, `ban`, `unban`, `clear`, `slowmode`, `lock`, `unlock` |
| **Logs** | `/logs setup`, `config`, `enable`, `disable`, `channel`, `list` |
| **Auto-Rollen** | `/autorole`, `add`, `remove`, `list` |
| **Level-Rollen** | `/levelrole add`, `remove`, `list`, `config` |
| **Embeds** | `/embed create`, `preview`, `send`, `edit`, `cancel` |
| **Konfiguration** | `/config menu`, `view`, `roles`, `channels`, `categories`, `tickets`, `verification`, `xp`, `voice`, `level`, `logs`, `autoroles`, `moderation`, `embeds`, `permissions` |
| **Server & User** | `/server info`, `membercount`, `roles`, `channels`, `/user info`, `avatar`, `banner` |
| **Hilfe** | `/help` |

Jeder Befehl prüft selbst, ob du berechtigt bist (anhand deiner Rollen `Owner` / `Admin` /
`Tickets` / `Moderator` / `Member`) – unberechtigte Personen bekommen eine klare Fehlermeldung.

---

## 8. Der Verifizierungs-Ablauf

1. Ein neuer User tritt bei → bekommt automatisch die Rolle **Unverified**.
2. Er sieht nur den Verifizierungs-Kanal und klickt dort auf **„Verifizierung beantragen"**.
3. Der Bot erstellt ein privates Ticket, das nur der User und das Team sehen (`Tickets`, `Moderator`, `Admin`, `Owner`).
4. Ein Teamler klickt auf **Claim** → wird als Bearbeiter eingetragen.
5. Der Teamler klickt auf **Freigeben** ✅ oder **Ablehnen** ❌ / **Ablehnen + Kick** 👢.
6. Bei Freigabe: `Unverified` wird entfernt, `Member` wird vergeben, alles wird geloggt, Ticket schließt automatisch.
7. Bei Ablehnung: Grund wird gespeichert und geloggt; der User kann es nach Ablauf der Sperrzeit erneut versuchen.

---

## 9. Wie du den Bot erweiterst

```
src/
├── commands/    → jede Datei ist EIN Slash-Befehl (z. B. xp.js, ticket.js)
├── events/      → jede Datei reagiert auf EIN Discord-Ereignis
├── interactions/→ Logik für Buttons, Menüs und Formulare
├── systems/     → die eigentliche Logik (Tickets, XP, Moderation, ...)
├── config/      → Rollen-IDs und Grundeinstellungen
└── database/    → Speicherung aller Daten
```

**Neuen Befehl hinzufügen:** eine neue Datei in `src/commands/` anlegen, die
`{ data: SlashCommandBuilder, async execute(interaction) {...} }` exportiert – wird beim nächsten Start automatisch geladen.

**Neuen Tickettyp hinzufügen:** `/ticket type create` verwenden – kein Code nötig.

**Neue Log-Kategorie:** in `src/config/constants.js` bei `LOG_TYPES` ergänzen.

---

## 10. Fehlerbehebung

| Problem | Lösung |
|---|---|
| "Kein DISCORD_TOKEN gefunden" | `.env` fehlt oder falsch benannt – prüfe, dass sie exakt `.env` heißt |
| Bot online, aber Befehle fehlen | Prüfe `GUILD_ID`; ohne sie dauert die Registrierung bis zu 1 Std. |
| "Ich kann diese Rolle nicht vergeben" | Bot-Rolle in den Servereinstellungen weiter nach oben ziehen |
| Ticket-Kanal wird nicht erstellt | Bot braucht die Rechte "Kanäle verwalten" und "Rollen verwalten" |
| Bot geht offline, wenn Fenster geschlossen wird | Für Dauerbetrieb: `npm install -g pm2`, dann `pm2 start src/index.js --name bot` |
| Daten scheinen weg zu sein | Sieh in `data/database.json` nach; bei Beschädigung wird `data/database.json.bak` automatisch geladen |

---

## 11. Wichtige technische Hinweise

- **Rollen-IDs** sind fest in `src/config/roles.js` hinterlegt und werden nirgends verändert oder neu erstellt.
  Über `/config roles` kannst du sie **pro Server überschreiben**, ohne den Code anzufassen.
- **Datenbank:** Eine lokale JSON-Datei (`data/database.json`), atomar gespeichert (kein Datenverlust bei Absturz),
  mit automatischem Backup (`data/database.json.bak`).
- **Mehrere Server gleichzeitig:** Alle Einstellungen werden pro Server (Guild-ID) getrennt gespeichert –
  du kannst den Bot ohne Änderungen auf mehrere Server gleichzeitig einladen.
- **Sicherheit:** Der Bot-Token steht nie im Code, nur in der `.env`-Datei, die laut `.gitignore`
  niemals mit hochgeladen wird. Committe deine `.env` niemals zu GitHub.
