# Ručne provjere

Ove provjere radi čovjek s pravim uređajima; CI ih ne može pokriti. Igra: https://erikpustinja.github.io/MobileTennis/ (postavljanje je u `SETUP.md`).

Za svaku točku zapiši **prolazi / ne prolazi** i kratku napomenu. Rezultate pošalji kao komentar na issue ili u novi issue s oznakom `needs-human`.

Zabilježi uređaje: model računala i grafike, preglednik i verziju, model mobitela, verziju Androida i Chromea.

---

## 1. Tipkovnica

1. Otvori igru i klikni **Igraj tipkovnicom**.
2. Igrač 1 pritisne **W** (servis) pa **E** (forehand) dok loptica pada.
3. Odigrajte nekoliko uzastopnih udaraca (Igrač 1: **E** i **Q**, Igrač 2: **O** i **U**).
4. Odigrajte dok netko ne osvoji poen.

Očekivano:
- [ ] servis prelazi mrežu
- [ ] mogu se odigrati barem 3 uzastopna udarca
- [ ] nakon poena obje polovice pokazuju isti rezultat, svaka iz svoje perspektive, s razlogom poena
- [ ] igra sama pripremi idući servis
- [ ] **D** pomiče reket Igrača 1 udesno u lijevoj polovici, a **L** reket Igrača 2 udesno u desnoj polovici

## 2. Jedan mobitel protiv bota

1. Skeniraj QR za Igrača 1, dodirni **Omogući senzore**, pa **Kalibriraj**.
2. Na računalu klikni **Igraj**.

Očekivano:
- [ ] kontroler ne prikazuje upozorenje o senzorima (ako prikazuje, prepiši ga)
- [ ] prikaz je preko cijelog ekrana iza tvog lika, a protivnik je bot
- [ ] **Servis** baca lopticu, a zamah prema naprijed je udara
- [ ] mobitel kratko zavibrira kad reket udari lopticu
- [ ] lagani zamah šalje sporiju lopticu od jakog
- [ ] cijelom rukom pomakni mobitel **ulijevo** pod istim kutom: reket ide ulijevo, glatko i odmah, bez trzaja natrag pri zaustavljanju
- [ ] isto **udesno**
- [ ] samo zakretanje zapešća (bez pomicanja ruke) ne pomiče reket bočno
- [ ] namještanje reketa (bočni pomak) **ne okida udarac**
- [ ] forehand i backhand oba vraćaju lopticu

## 3. Dva mobitela

1. Ti skeniraš QR za Igrača 1, cimer za Igrača 2; oba **Omogući senzore** i **Kalibriraj**.
2. Klikni **Igraj**.

Očekivano:
- [ ] svaki mobitel upravlja samo svojim reketom, u svojoj polovici (narančasta lijevo, plava desno)
- [ ] bočni pomak udesno pomiče reket udesno **u polovici tog igrača** (za oba igrača)
- [ ] na jednom mobitelu na par sekundi uključi način rada u zrakoplovu, pa ga isključi:
  - [ ] meč se pauzira i u toj polovici se pojavi QR za povratak
  - [ ] mobitel se sam vrati na isto mjesto (gore desno opet **Spojeno**)
  - [ ] meč se nastavlja s istim rezultatom

## 4. Vrsta veze i ping

Mobiteli i računalo su na istom Wi-Fiju. Na računalu pritisni **F2**.

- [ ] **Veza** za oba igrača: zapiši vrijednost (očekivano „lokalna mreža“)
- [ ] **Ping** za oba igrača: zapiši u ms
- [ ] **Uzorci**: zapiši u Hz (očekivano oko 60)
- [ ] **Odbačeno**: brojke rastu sporo ili nikako tijekom igre

## 5. Broj sličica u sekundi

Na računalu u 1080p, preko cijelog zaslona, s oba pogleda (dva mobitela ili tipkovnica).

1. Pritisni **F2**; gore piše broj FPS.
2. Igrajte minutu i povremeno pogledaj vrijednost.

- [ ] zapiši najmanji i tipični FPS (cilj: stabilnih 60)
- [ ] zapiši je li računalo na punjaču (na bateriji preglednik često ograničava grafiku)

---

### Napomena o kašnjenju

Ukupno kašnjenje od zamaha do prikaza mjeriš samo ti, na pravim uređajima. Ako ga želiš izmjeriti, snimi usporenu snimku mobitelom: kadar neka obuhvati i ruku s drugim mobitelom i ekran računala, pa izbroji sličice od početka zamaha do pomaka reketa na ekranu.
