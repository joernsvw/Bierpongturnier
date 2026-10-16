# 🍺 Bierpong-Turnier

Kleine Web-App für Bierpong-Turniere in der Mannschaft – gebaut für Laptop + Fernseher (Bildschirmspiegelung, 1920×1080).

- **Einzel und Doppel – auch gleichzeitig**: gemeinsame Spielerliste, zwei unabhängige Turnierbäume (Umschalter oben)
- **Mehrere Tische** (1–4, Standard 2): Laufende Matches bleiben an ihrem Tisch, freie Tische bekommen das nächste Match. Niemand wird gleichzeitig an zwei Tische gesetzt, und beide Turniere kommen abwechselnd dran
- Team-Auslosung mit zwei Glücksrädern (auch „alle auf einmal“ oder Teams von Hand)
- Fortlaufende Spielnummern in Spielreihenfolge („Spiel 1 … Finale“), Freilose werden nicht mitgezählt
- **Double Elimination** wie im E-Sport: Winner Bracket, Loser Bracket, Grand Final; gewinnt der Loser-Bracket-Sieger, folgt ein Extra-Finale mit 6 gegen 6 Cups (abschaltbar)
- Freilose bei ungerader Teilnehmerzahl werden automatisch verteilt und weitergeleitet
- Ergebnisse per Klick eintragen (optional mit verbleibenden Bechern), korrigierbar mit Warnung für abhängige Matches
- „Als Nächstes“-Leiste, Tabelle mit Siegen/Niederlagen/Becherdifferenz, Siegerehrung mit Konfetti
- Präsentationsmodus (Taste **F**), Rückgängig (**Strg+Z**), Backup als JSON (Export/Import)
- Alles bleibt im `localStorage` des Browsers – kein Server, kein Login

## Lokal starten

Voraussetzung: [Node.js](https://nodejs.org/) ab Version 20.

```bash
npm install
npm run dev
```

Dann im Browser <http://localhost:5173> öffnen und mit **F** in den Vollbild-/Präsentationsmodus wechseln.

Weitere Befehle:

```bash
npm test        # Unit-Tests der Bracket-Logik (Vitest)
npm run build   # Produktions-Build nach dist/
```

## Online über GitHub Pages

Bei jedem Push auf `main` baut die GitHub Action (`.github/workflows/deploy.yml`) die App, führt die Tests aus und veröffentlicht sie.
Einmalig im Repository einstellen: **Settings → Pages → Build and deployment → Source: „GitHub Actions“**.
Danach ist die App unter `https://<benutzername>.github.io/<repo-name>/` erreichbar.

Hinweis: Die Turnierdaten liegen auch online nur im Browser des jeweiligen Geräts. Für einen Gerätewechsel den Stand über *Menü → Export* sichern und auf dem anderen Gerät importieren.

## Bedienung

| Aktion | So geht's |
| --- | --- |
| Spieler hinzufügen | Name eintippen, Enter |
| Umbenennen | Auf den Namen klicken |
| Teams auslosen | Tab „Teams“ oder Mitte: „Nächstes Team losen“ |
| Ergebnis eintragen | Match im Baum oder in „Als Nächstes“ anklicken, Taste 1/2, Enter |
| Baum zoomen/verschieben | Mausrad / ziehen, „Alles einpassen“ |
| Präsentationsmodus | Taste F (Esc beendet) |

## Aufbau

- `src/lib/bracket.ts` – UI-unabhängige Double-Elimination-Logik (Generierung, Freilose, Weiterleitung, Loser-Bracket-Zuordnung, Grand Final/Reset, Statistik)
- `src/lib/bracket.test.ts` – Tests für 2, 3, 4, 5, 6, 8, 12 und 16 Teams
- `src/lib/tables.ts` – Verteilung der Matches auf die Tische (mit Tests)
- `src/lib/state.ts` – App-Zustand (Einzel + Doppel), Speichern/Laden, Spieler- und Team-Aktionen
- `src/components/` – Oberfläche (Turnierbaum, Ergebnis-Fenster, Glücksräder, Tabellen …)
