# QR

En selvindeholdt QR code generator med arkiv og live scanner — bygget som en enkelt HTML-fil.

## Funktioner

- **Generator** — Skab QR-koder fra tekst eller URL. Justér størrelse, fejlkorrigeringsniveau og farver.
- **Arkiv** — Gem koder lokalt i browseren (`localStorage`). Load, download, kopier eller slet tidligere koder. Eksportér/importér hele arkivet som JSON.
- **Scanner** — Live kamera-scan via `html5-qrcode`. Vælger bagkamera automatisk, viser URLs som klikbare links, og kan gemme scannede koder direkte i arkivet.

## Brug

Åbn `index.html` i en browser — ingen build eller dependencies. Scanneren kræver HTTPS eller `localhost` for kamera-adgang.

## Teknologi

- [qrcodejs](https://github.com/davidshimjs/qrcodejs) — QR-generering (CDN)
- [html5-qrcode](https://github.com/mebjas/html5-qrcode) — Kamera-scanner (CDN)

Del af [GAMES by TEAMBATTLE](https://github.com/Teambattle1/GAMES).
