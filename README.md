# Bot notificari sate barbare - Triburile.ro (lumea rop13)

Verifica la fiecare 5 minute lista de sate de pe `rop13.triburile.ro` si trimite
pe un webhook Discord orice sat barbar aparut nou.

## Pasul 1: Creeaza un webhook Discord

1. In Discord, intra pe serverul tau -> canalul unde vrei notificarile.
2. Click dreapta pe canal (sau Edit Channel) -> **Integrations** -> **Webhooks** -> **New Webhook**.
3. Da-i un nume (ex: "Barbari Bot"), apoi apasa **Copy Webhook URL**.
4. Pastreaza acel link, il pui la Pasul 3 mai jos.

## Pasul 2: Urca proiectul pe GitHub

1. Creeaza un repo nou pe GitHub (poate fi privat).
2. Urca fisierele `index.js`, `package.json` si `README.md` in el.
   (Cel mai simplu: pe pagina repo-ului -> "Add file" -> "Upload files" -> trage fisierele.)

## Pasul 3: Deploy pe Railway (gratuit)

1. Intra pe https://railway.app si logheaza-te cu contul de GitHub.
2. **New Project** -> **Deploy from GitHub repo** -> alege repo-ul creat mai sus.
3. Railway va detecta automat ca e un proiect Node.js si va rula `npm install` + `npm start`.
4. Intra in proiect -> tab **Variables** -> adauga:
   - `DISCORD_WEBHOOK_URL` = link-ul copiat la Pasul 1
   - `MIN_POINTS` (optional) = puncte minime pentru ca un sat barbar sa fie notificat.
     Implicit e `26`. Satele de antrenament puse de administratori au mereu 0 puncte
     si se regenereaza cu ID nou de fiecare data cand sunt cucerite - de-asta au
     nevoie de un filtru, altfel primesti notificari repetate pentru acelasi loc.
   - `CONTINENTS` (optional) = lista de continente (K-uri) de urmarit, separate prin
     virgula, ex: `55,64,65`. Daca o lasi goala / nesetata, se urmareste toata harta.
5. Salveaza. Railway va reporni automat serviciul si bot-ul incepe sa ruleze non-stop.

Poti urmari log-urile in tab-ul **Deployments** -> **View Logs**, sa vezi mesaje de genul:
```
Verific sate barbare...
Prima rulare: am salvat 1532 sate barbare existente. Nu trimit notificari acum.
```

## De ce nu sunt notificarile 100% live?

Botul verifica fisierul public `village.txt` de pe serverul jocului la fiecare
**1 minut** (`CHECK_INTERVAL_MINUTES` in `index.js`). Insa acel fisier este
generat periodic de serverul jocului insusi, nu in timp real - pe lumile
"casual" (ca rop13) actualizarea sursei se intampla de obicei la 15-20 minute.
Asta inseamna ca oricat de des ar verifica botul, nu poate afla o schimbare
mai repede decat regenereaza jocul acel fisier. Intervalul de 1 minut asigura
doar ca botul prinde actualizarea sursei cat mai repede posibil, fara sa mai
adauge el intarziere suplimentara.

## Cum aflu ce K vreau sa urmaresc?

Un continent (K) e format din prima cifra a lui x si prima cifra a lui y.
Exemplu: satul de la coordonatele `617|539` e in continentul **K65**
(6 de la 617, 5 de la 539). Daca vrei sa urmaresti doar zona ta (ex: K55, K64, K65),
pui in Railway: `CONTINENTS=55,64,65`.

## Observatii importante

- **Prima rulare** nu trimite notificari (doar salveaza starea curenta a hartii),
  ca sa nu primesti dintr-o data mesaje pentru toate satele barbare deja existente.
  De la a doua verificare incolo (dupa 5 minute), orice sat barbar nou va genera notificare.
- Fisierul `known_villages.json` tine minte satele deja vazute. Pe Railway (plan free),
  discul e persistent cat timp nu redeployezi/nu se reseteaza containerul; la un redeploy
  se poate reseta si vei primi din nou o "prima rulare" fara notificari.
- Daca vrei sa schimbi intervalul de verificare, modifica `CHECK_INTERVAL_MINUTES` in `index.js`.
- Daca vrei sa monitorizezi alta lume, schimba `WORLD_URL` in `index.js`
  (ex: pentru ro115 ar fi `https://ro115.triburile.ro/map/village.txt`).

## Testare locala (optional)

```bash
npm install
DISCORD_WEBHOOK_URL="linkul_tau_aici" npm start
```
