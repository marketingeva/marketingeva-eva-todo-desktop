# Eva To-do agent: desktop-app

De desktop-app van de **To-do agent** uit de Eva hub, voor Mac en Windows.

De app laadt de To-do agent rechtstreeks uit de hub. Het is dus precies dezelfde app met dezelfde data, en alles loopt live synchroon met de hub. Extra in de desktop-app:

- **Sneltoets die overal werkt**, ook in andere programma's: standaard `Ctrl/⌘ + Shift + Spatie` opent "snel toevoegen".
- **Icoon in de menubalk (Mac) of taakbalk (Windows)** met: openen, snel toevoegen, sneltoets kiezen, starten bij inloggen.
- Eigen venster, los van je browser.

## Downloaden

- **Mac:** [Eva-To-do-agent.dmg](https://github.com/marketingeva/marketingeva-eva-todo-desktop/releases/latest/download/Eva-To-do-agent.dmg)
- **Windows:** [Eva-To-do-agent-Setup.exe](https://github.com/marketingeva/marketingeva-eva-todo-desktop/releases/latest/download/Eva-To-do-agent-Setup.exe)

## Installeren

**Mac (aanrader: één regel in Terminal)**
1. Open **Terminal** (Spotlight: ⌘ + Spatie, typ "Terminal").
2. Plak deze regel en druk op Enter:
   ```
   curl -fsSL https://independent-ambition-production-792a.up.railway.app/mac | bash
   ```
   De app wordt in Programma's gezet en start vanzelf. Je krijgt geen melding van macOS, omdat de app niet via de browser binnenkomt. Dezelfde regel werkt ook om bij te werken.
3. Log in met je hub-account (inclusief 2FA). Daarna blijf je ingelogd.

**Mac (via de download)**
1. Open het `.dmg`-bestand en sleep **Eva To-do agent** naar **Programma's**.
2. Open de app. macOS zegt dan "Eva To-do agent kan niet worden geopend" (alleen een knop **Gereed**). Klik op Gereed.
3. Ga naar **Systeeminstellingen → Privacy en beveiliging**, scroll naar beneden en klik bij "Eva To-do agent werd geblokkeerd" op **Open toch**. Bevestig met je wachtwoord of Touch ID. Daarna opent hij gewoon.

Waarom die melding? De app is nog niet door Apple gecertificeerd (daarvoor is een Apple Developer-account van $99 per jaar nodig). Met dat account kan de build hem automatisch laten ondertekenen en notariseren; dan verdwijnt de melding helemaal.

**Windows**
1. Open `Eva-To-do-agent-Setup.exe`.
2. Krijg je "Windows heeft uw pc beschermd", klik dan op **Meer info → Toch uitvoeren**.
3. Log in met je hub-account (inclusief 2FA).

## Voor ontwikkelaars

- `npm install` en `npm start` om lokaal te draaien. `EVA_HUB_URL=http://localhost:8340 npm start` gebruikt een lokale hub.
- Een nieuwe versie: verhoog `version` in `package.json` en push een tag `vX.Y.Z`. GitHub Actions bouwt de `.dmg` en `.exe` en zet ze in een Release.
- De app heeft (nog) geen code-certificaat. Daarom de eenmalige melding bij het openen.
