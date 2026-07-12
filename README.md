# Ferienhaus Saaler Bodden – Website

Moderne Website mit eigenem Buchungskalender und passwortgeschütztem Admin-Bereich.
Node.js/Express-App, vorbereitet für Deployment auf [Railway](https://railway.app).

## Struktur

- `server.js` – Express-Server, API und Login
- `public/` – Website (One-Pager), Admin-Seite, Impressum, Datenschutz
- `data/bookings.json` – Belegungsdaten (JSON, wird automatisch angelegt)

## Lokal starten

```bash
npm install
ADMIN_PASSWORD=geheim npm start
# → http://localhost:3000  (Admin: http://localhost:3000/admin)
```

## Deployment auf Railway

1. Projekt als GitHub-Repo pushen (oder `railway up` mit der CLI).
2. In Railway ein neues Projekt aus dem Repo erstellen – Node wird automatisch erkannt.
3. **Volume anlegen** (wichtig, sonst gehen Buchungen bei jedem Deploy verloren):
   Service → Volumes → neues Volume mit Mount-Pfad `/data`.
4. **Variablen setzen** (Service → Variables):

   | Variable         | Wert                                             |
   | ---------------- | ------------------------------------------------ |
   | `ADMIN_PASSWORD` | Passwort für den Admin-Bereich (Pflicht!)        |
   | `SESSION_SECRET` | langer Zufallsstring                             |
   | `DATA_DIR`       | `/data` (Mount-Pfad des Volumes)                 |
   | `BOOKING_EMAIL`  | E-Mail für Buchungsanfragen (kommt noch – bis dahin gilt info@ferienhaus-saaler-bodden.de) |

5. Domain verbinden: Service → Settings → Networking → Custom Domain
   (`ferienhaus-saaler-bodden.de`), beim Domain-Anbieter den angezeigten CNAME setzen.

## Admin-Bereich

- Aufruf über `/admin` (auch unten im Footer verlinkt)
- Belegungen mit Status **Belegt** (rot) oder **Angefragt** (gelb) eintragen
- Abreisetag zählt als frei → Anschlussbuchungen möglich
- Status umschalten und Einträge löschen direkt in der Liste
- Nach 5 Fehlversuchen beim Login: 15 Minuten Sperre

## Bilder austauschen

Aktuell werden die Fotos noch von der alten Website (ferienhaus-saaler-bodden.de) geladen.
Wenn die neuen Bilder da sind: einfach in `public/img/` ablegen und die URLs in
`public/index.html` ersetzen (suchen nach `https://ferienhaus-saaler-bodden.de/apartment/`).

Das Logo liegt als SVG-Nachbau unter `public/img/logo.svg` – die Original-Datei kann es
dort direkt ersetzen (gleicher Dateiname oder Pfade anpassen).
