# Eva To-do agent: desktop-app

De desktop-app van de **To-do agent** uit de Eva hub, voor Mac en Windows.

De app laadt de To-do agent rechtstreeks uit de hub. Het is dus precies dezelfde app met dezelfde data, en alles loopt live synchroon met de hub. Extra in de desktop-app:

- **Sneltoets die overal werkt**, ook in andere programma's: standaard `Ctrl/⌘ + Shift + Spatie` opent "snel toevoegen".
- **Icoon in de menubalk (Mac) of taakbalk (Windows)** met: openen, snel toevoegen, sneltoets kiezen, starten bij inloggen.
- Eigen venster, los van je browser.

## Downloaden

- **Mac:** [Eva-To-do-agent.dmg](https://github.com/marketingeva/eva-todo-desktop/releases/latest/download/Eva-To-do-agent.dmg)
- **Windows:** [Eva-To-do-agent-Setup.exe](https://github.com/marketingeva/eva-todo-desktop/releases/latest/download/Eva-To-do-agent-Setup.exe)

## Installeren

**Mac**
1. Open het `.dmg`-bestand en sleep **Eva To-do agent** naar **Programma's**.
2. De eerste keer: open de app. Krijg je de melding dat de ontwikkelaar niet geverifieerd is, ga dan naar **Systeeminstellingen → Privacy en beveiliging**, scroll naar beneden en klik op **Toch openen**.
3. Log in met je hub-account (inclusief 2FA). Daarna blijf je ingelogd.

**Windows**
1. Open `Eva-To-do-agent-Setup.exe`.
2. Krijg je "Windows heeft uw pc beschermd", klik dan op **Meer info → Toch uitvoeren**.
3. Log in met je hub-account (inclusief 2FA).

## Voor ontwikkelaars

- `npm install` en `npm start` om lokaal te draaien. `EVA_HUB_URL=http://localhost:8340 npm start` gebruikt een lokale hub.
- Een nieuwe versie: verhoog `version` in `package.json` en push een tag `vX.Y.Z`. GitHub Actions bouwt de `.dmg` en `.exe` en zet ze in een Release.
- De app heeft (nog) geen code-certificaat. Daarom de eenmalige melding bij het openen.
