# Mobitenis – postavljanje

Igra se cijela vrti u pregledniku. Na računalu se ništa ne instalira, a mobitel je reket.

Adresa igre: **https://erikpustinja.github.io/MobileTennis/**

Potrebno:
- računalo s Chromeom ili Edgeom
- jedan ili dva Android mobitela s Chromeom
- internet na računalu i mobitelima (mreže mogu biti različite)

---

## Samo prvi put

### 1. Uključi GitHub Pages

1. Otvori https://github.com/ErikPustinja/MobileTennis/settings/pages
2. Pod **Build and deployment → Source** odaberi **GitHub Actions**.
3. Otvori https://github.com/ErikPustinja/MobileTennis/actions/workflows/deploy.yml i klikni **Run workflow → Run workflow** (ili pričekaj sljedeći merge u `main`).
4. Kad se pokretanje završi zelenom kvačicom (oko dvije minute), igra je na adresi iznad.

### 2. Posrednik za igru s bilo koje mreže (TURN)

Ne treba ništa postavljati. Kad mobitel i računalo ne mogu razgovarati izravno (različite mreže, mobilni podaci, hotspot, vatrozid), igra sama koristi besplatni javni posrednik **Open Relay**, za koji ne treba račun. Na istom Wi-Fiju promet i dalje ide izravno.

Provjera: u igri pritisni **F2**; gore piše **Posrednik (TURN): postavljen**. Kad je mobitel spojen preko posrednika, pod **Veza** piše „preko posrednika“.

Samo ako javni posrednik ne radi ili se potroši njegova kvota, možeš postaviti vlastiti ključ:
1. Napravi račun na https://www.metered.ca/tools/openrelay/ i kopiraj adresu oblika `https://<ime>.metered.live/api/v1/turn/credentials?apiKey=<ključ>`.
2. Na https://github.com/ErikPustinja/MobileTennis/settings/variables/actions dodaj varijablu `TURN_CREDENTIALS_URL` s tom adresom.
3. Ponovno pokreni objavu: https://github.com/ErikPustinja/MobileTennis/actions/workflows/deploy.yml → **Run workflow**.

### 3. Provjeri adresu igre

Otvori https://erikpustinja.github.io/MobileTennis/ na računalu. Trebao bi se pojaviti početni zaslon s dva QR koda, za Igrača 1 (narančasti) i Igrača 2 (plavi).

Ako umjesto QR koda piše da signalizacijski poslužitelj nije dostupan, provjeri internet i osvježi stranicu za minutu. Igra tipkovnicom radi i bez toga.

### 4. Dopuštenja koja traži Chrome na mobitelu

- **Kamera** (samo za skeniranje QR koda): otvori aplikaciju Kamera, usmjeri je na QR kod i dodirni poveznicu koja se pojavi. Ako je ne prepoznaje, koristi Google Lens ili u Chromeu dodirni ikonu kamere u adresnoj traci.
- **Senzori pokreta:** Chrome na Androidu ih obično daje bez pitanja. Ako kontroler javi da senzori ne šalju podatke, u Chromeu otvori **⋮ → Postavke → Postavke web-lokacije → Senzori pokreta** i dopusti ih, za `erikpustinja.github.io` ili općenito.
- **Vibracija, cijeli zaslon i sprječavanje gašenja zaslona** uključuju se dodirom na **Omogući senzore**; ne traže posebno dopuštenje.

Nakon prvog učitavanja preglednik pamti stranicu, pa se igra otvara i bez interneta. Mobitel se tada ipak ne može upariti, i igra to jasno napiše.

---

## Svaki put

1. **Na računalu** otvori https://erikpustinja.github.io/MobileTennis/ i pritisni ⛶ za prikaz preko cijelog zaslona.
2. **Skeniraj QR kodove:**
   - ti skeniraš lijevi (narančasti) QR za **Igrača 1**, cimer desni (plavi) za **Igrača 2**;
   - na mobitelu se otvori kontroler. Kad gore desno piše **Spojeno**, na ekranu igre umjesto QR koda pojavi se kvačica.
   - Ako QR ne radi, na mobitelu otvori `erikpustinja.github.io/MobileTennis/c/` i upiši **kod sobe** s ekrana igre.
3. **Na svakom mobitelu:**
   1. dodirni **Omogući senzore**;
   2. drži mobitel kao dršku reketa (ekran prema sebi) i dodirni **Kalibriraj**.
4. Na računalu klikni **Igraj**. S dva mobitela igra se na podijeljenom ekranu, a s jednim protiv bota.
5. **Servis:** kad piše „Tvoj servis“, dodirni veliki gumb **Servis** (loptica se baci) pa zamahni mobitelom prema naprijed.
6. **Igra:**
   - lik se sam kreće prema loptici; ti biraš trenutak i jačinu zamaha;
   - pomakni cijelu ruku ulijevo ili udesno pod istim kutom da namjestiš reket za forehand ili backhand;
   - nagib mobitela naprijed-natrag otvara ili zatvara lice reketa.
7. Na kraju meča klikni **Revanš**: mobiteli ostaju spojeni.

Ako se mobitel odspoji, meč se pauzira, a u njegovoj polovici pojavi se QR kod. Mobitel se obično sam vrati unutar sekunde ili dvije; ako ne, ponovno skeniraj QR.

### Korisno

- **F2** ili ⚙ otvara dijagnostiku (učestalost uzoraka, vrsta veze, ping, snimanje senzora).
- **Esc** pauzira; **razmak** ili gumb **Servis** na mobitelu nastavlja.
- Kraći meč: dodaj na adresu `?points=5&sets=1` (poeni po setu, broj setova za pobjedu).
- Igra tipkovnicom: **Igraj tipkovnicom**; raspored tipki je na početnom zaslonu.
