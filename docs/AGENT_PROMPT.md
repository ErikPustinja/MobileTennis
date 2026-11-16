# Mobitenis: zadatak za GitHub agenta

Napravi Mobitenis, laganu 3D igru stolnog tenisa inspiriranu stolnim tenisom iz Wii Sports Resorta. Igra se u cijelosti igra u pregledniku: na računalu otvorim web-adresu, a Android mobitel mi služi kao reket. Na računalu se ništa ne instalira i ne pokreće se nikakav lokalni poslužitelj. Prioriteti su, ovim redom: brz odziv, prirodan osjećaj pokreta, jednostavno spajanje, mala i jednostavna kodna baza.

**Opseg prve verzije:** lokalna igra za dva igrača na jednom računalu s podijeljenim ekranom. Cimer i ja sjedimo pred istim ekranom, svaki sa svojim mobitelom, i svaki gleda svoju polovicu. Online igra i Android aplikacija nisu dio prve verzije; opisane su u poglavlju 11 samo zato da ih arhitektura ne zatvori.

Radiš kao autonomni agent u GitHub repozitoriju. Nemaš pristup mom računalu ni mobitelu, pa sve što se može provjeriti provjeravaš u CI-ju, a sve što zahtijeva fizički uređaj predaješ meni kao točne korake.

## 1. Kako radiš u repozitoriju

- Prije početka pregledaj repozitorij. Ako već postoji kod, nastavi na njemu i poštuj postojeće verzije i strukturu. Ako je prazan, postavi ga prema poglavlju 2.
- Radi po fazama iz poglavlja 9. Svaka faza je jedna grana i jedan pull request prema `main`. Ne spajaj više faza u jedan PR.
- U prvom PR-u dodaj `AGENTS.md` s naredbama za instalaciju, test, lint i build te s pravilima iz ovog poglavlja, kako bi ih i sljedeća pokretanja agenta slijedila.
- PR se smije označiti spremnim tek kad CI prolazi. Opis svakog PR-a ima tri odjeljka: **Što je napravljeno**, **Što je stvarno pokrenuto** (naredbe i rezultati iz CI-ja) i **Što nije provjereno** (sve što traži fizički mobitel).
- Nikad ne tvrdi da je nešto testirano na uređaju. Ukupnu latenciju od zamaha do prikaza ne navodi ni kao procjenu; nju mjerim samo ja.
- Kad je potreban moj korak (GitHub postavke, tajne, snimanje senzora, test na mobitelu), otvori issue s oznakom `needs-human`. U njemu napiši točne korake: gdje kliknuti, koju naredbu pokrenuti i što ti trebam vratiti. Zatim nastavi sa svime što o tom koraku ne ovisi.
- Ne dodaji ovisnost ako se stvar može riješiti u pedesetak redaka. Svaku novu ovisnost obrazloži jednom rečenicom u opisu PR-a.
- Tajne i keystore nikad ne idu u repozitorij.
- Kod, komentari i poruke commitova su na engleskom. Sučelje igre i kontrolera te dokumenti `docs/SETUP.md` i `docs/MANUAL_TEST.md` su na hrvatskom.

## 2. Tehnološki okvir

Koristi najnovije stabilne verzije u trenutku rada i zaključaj ih lockfileom. Prije konfiguracije provjeri službenu dokumentaciju TresJS-a i odabrane WebRTC biblioteke, jer se obje brzo mijenjaju.

| Dio | Odabir |
|---|---|
| Jezik | TypeScript, strict način, ESM u cijelom repozitoriju |
| Repozitorij | pnpm workspace; Node (aktualni LTS, zapisan u `.nvmrc`) služi samo za razvoj i CI |
| Igra | Statična web-stranica: Vue 3, Vite, TresJS (`@tresjs/core`, verzija 5 ili novija) i `three` |
| Kontroler | Statična web-stranica na istoj domeni, Vite i čisti TypeScript bez UI frameworka |
| Veza | WebRTC DataChannel između mobitela i preglednika na računalu, izravno od uređaja do uređaja |
| Uparivanje | Javni signalizacijski poslužitelj, npr. PeerJS; skriven iza vlastitog malog sučelja kako bi se mogao zamijeniti |
| Objava | GitHub Pages preko GitHub Actionsa, HTTPS |
| Testovi | Vitest za logiku, Playwright za igru i povezivanje u headless Chromiumu |

Bez Unityja, Electrona, vlastitog backend poslužitelja, gotovog fizikalnog enginea, baze podataka i vanjskih 3D modela ili tekstura. Ciljani preglednici su Chrome i Edge na računalu te Chrome na Androidu. iPhone i Safari nisu u opsegu.

Struktura:

```
packages/protocol    tipovi poruka, binarno kodiranje, verzija protokola
packages/sim         fizika, pravila, prepoznavanje gesti, test-bot (bez ovisnosti o Vueu, Threeu i DOM-u)
packages/net         uparivanje, WebRTC kanali, ponovno spajanje, ping
apps/game            Vue + TresJS: podijeljeni ekran, početni zaslon, QR kodovi, dijagnostika, simulacija
apps/controller      web-kontroler
fixtures/traces      snimke senzora s pravog mobitela (JSON)
docs/                ARCHITECTURE.md, SETUP.md, MANUAL_TEST.md
```

## 3. Arhitektura

- Simulacija se vrti u pregledniku na računalu u fiksnom koraku od 120 Hz i jedini je izvor istine za lopticu, pravila i rezultat.
- Simulacija ne zna ništa o prikazu ni o mreži. Ulaz su joj uzorci i naredbe po igraču, a izlaz stanje meča. Prikaz svakog igrača je zasebna komponenta koja prima stanje i oznaku strane. Tako se kasnije može dodati online igra bez prepravljanja jezgre.
- Korak simulacije ne smije ovisiti o broju sličica u sekundi. Ako kartica ode u pozadinu, meč se pauzira i to se prikaže na ekranu i na oba mobitela.
- Mobitel se s preglednikom na računalu povezuje izravno, preko WebRTC-a. Internet služi samo za učitavanje stranice i uparivanje; podaci o pokretu u lokalnoj mreži ne smiju ići preko posrednika.
- Položaj vlastitog reketa primjenjuje se na prikaz odmah po primitku uzorka, bez čekanja idućeg koraka simulacije.
- `packages/sim` mora biti determinističan uz isti ulaz i isto sjeme, kako bi se cijeli meč mogao reproducirati u testu.
- Nakon prvog učitavanja stranica se sprema u predmemoriju preglednika. Bez interneta se ipak ne može upariti mobitel, i to igra mora jasno reći.

## 4. Scena i kamera

- Jednostavna sportska dvorana, stol, mrežica, loptica, dva reketa i dva lako prepoznatljiva lika. Sve je složeno od osnovnih Three.js geometrija kao TresJS komponente.
- Stol i loptica imaju stvarne dimenzije (stol 2,74 × 1,525 m, visina 0,76 m, mrežica 15,25 cm, loptica 40 mm), u metrima.
- **Podijeljeni ekran.** Ekran je okomito podijeljen na dvije jednake polovice, lijevu za igrača 1 i desnu za igrača 2. Svaka polovica ima svoju kameru iza vlastitog lika, malo iznad ramena, kao u Wii Sports Resortu. Igrači tako gledaju isti stol sa suprotnih strana.
- U svakoj polovici vlastiti lik je blago proziran, njegov reket potpuno vidljiv, a protivnik potpuno vidljiv na drugoj strani stola. Lijevo i desno u upravljanju odgovaraju perspektivi te polovice.
- Svaka polovica ima rub u boji svog igrača, istoj kao na njegovu mobitelu, te vlastiti prikaz rezultata i statusa veze. Vidno polje kamere prilagodi uskom formatu polovice tako da se vidi cijeli stol.
- Obje polovice crtaju istu scenu u jednom platnu, s dva pogleda. Scena se ne smije udvostručiti u memoriji.
- Kad je spojen samo jedan mobitel, drugi igrač je bot, a prikaz je preko cijelog ekrana iza jedinog igrača.
- Cilj je stabilnih 60 FPS u 1080p na integriranoj grafici s oba pogleda. Jedno usmjereno svjetlo, najviše jedna mapa sjena, bez naknadne obrade slike.
- Igra ima gumb za prikaz preko cijelog zaslona. Ciljana veličina JavaScripta igre je do 400 kB gzip.

## 5. Igranje

- Lik se glatko i automatski pomiče prema očekivanoj točki dolaska loptice na svojoj strani. Igrač određuje položaj reketa i trenutak udarca. Cijeli meč mora se moći igrati sjedeći.
- **Bočni pomak reketa.** Kad cijelom rukom pomaknem mobitel ulijevo ili udesno i držim ga pod istim kutom, reket odmah i glatko krene u istom smjeru. Tako unaprijed namještam reket za forehand ili backhand.
  - Akcelerometar daje smjer i približnu jačinu kratkog bočnog pokreta.
  - Žiroskop razlikuje pomak ruke od zakreta zapešća.
  - Ubrzanje na početku i usporavanje na kraju pokreta obrađuju se kao jedna gesta, tako da reket pri zaustavljanju ne poskoči u suprotnom smjeru.
  - Namještanje reketa ne smije okinuti udarac.
- Podrži forehand i backhand. Jačina zamaha utječe na brzinu loptice, a smjer zamaha i kut reketa na putanju.
- Dopusti malu pogrešku u tajmingu (početno oko ±120 ms oko idealnog trenutka, podesivo), kako bi se moglo odigrati više uzastopnih udaraca.
- Gumb Servis priprema lopticu, a zamah je udara.
- Fizika je vlastita: gravitacija, otpor zraka, odskok od stola, kontakt s mrežicom i aut. Kontakt reketa i loptice računa se kontinuirano, po putanji između dva koraka, tako da ni najbrži zamah ne prođe kroz lopticu.
- Bodovanje: setovi do 11 s dva razlike, servis se mijenja svaka dva poena, a pri 10:10 nakon svakog. Nakon poena igra sama priprema idući.
- Sve konstante fizike i gesti stoje u jednoj konfiguracijskoj datoteci s komentarom za svaku vrijednost.
- Testne kontrole tipkovnicom za oba igrača pokrivaju servis, forehand, backhand, bočni pomak i jačinu udarca. Raspored tipki prikazan je u igri. Igra tipkovnicom radi i bez mobitela i bez interneta.
- U `packages/sim` dodaj jednostavnog bota. Služi za automatske testove i za isprobavanje s jednim mobitelom.

## 6. Kontroler na mobitelu

- QR kod na ekranu igre vodi na HTTPS adresu kontrolera s kodom sobe i mjestom. Skeniram ga običnom kamerom mobitela i kontroler se otvara u Chromeu, bez instalacije. Postoji i ručni unos kratkog koda sobe.
- Jedan zaslon, bez navigacije. Prikazuje oznaku igrača (boja i broj), status veze te gumbe **Omogući senzore**, **Kalibriraj** i **Servis**. Nakon kalibracije Servis je glavna radnja i zauzima većinu zaslona.
- Dodir gumba Omogući senzore pokreće čitanje senzora, traži dopuštenje ako ga preglednik zahtijeva, uključuje prikaz preko cijelog zaslona i sprječava gašenje zaslona. Mobitel kratko zavibrira pri kontaktu s lopticom.
- Čitaj `devicemotion` (ubrzanje sa i bez gravitacije, brzina rotacije) i orijentaciju uređaja. Ako neki podatak nedostaje ili dolazi rjeđe od 30 Hz, to jasno piše na zaslonu zajedno s posljedicom za igranje.
- Kalibracija sprema neutralni položaj i prilagođava osi načinu držanja mobitela.
- Prepoznavanje gesti radi se u `packages/sim` na strani igre, a ne u kontroleru. Mobitel šalje sirove uzorke, pa se geste mogu ugađati i testirati na snimkama.
- **Snimanje senzora.** U dijagnostici postoji opcija koja snimi do 60 sekundi sirovih uzoraka i izveze ih kao JSON. Te snimke spremam u `fixtures/traces/` i one su tvoj glavni materijal za ugađanje gesti. Dok ih nema, radi sa sintetičkim snimkama i otvori `needs-human` issue s popisom pokreta koje trebam snimiti: mirovanje, bočni pomak lijevo i desno pod istim kutom, zakret zapešća bez pomaka, lagani i jaki forehand i backhand.
- Ciljana veličina JavaScripta kontrolera je do 80 kB gzip, uključujući mrežni sloj.

## 7. Veza i protokol

- Svaka veza ima dva kanala. Uzorci senzora idu nepouzdanim, neuređenim kanalom bez ponovnog slanja. Naredbe (servis, kalibracija, prijava na mjesto) idu pouzdanim kanalom, s identifikatorom i potvrdom primitka, tako da se naredba ne izgubi i ne izvrši dvaput.
- Uzorci su binarne poruke fiksne duljine (do 64 bajta) s rednim brojem i vremenskom oznakom mobitela. Šalju se brzinom kojom ih uređaj daje, ciljano 60 Hz.
- Zastarjeli uzorci se ne gomilaju. Mobitel preskače slanje dok je `bufferedAmount` iznad praga. Igra odbacuje uzorke starije od 100 ms i one s rednim brojem manjim od zadnjeg obrađenog.
- Soba ima kratak kod, a svako mjesto jednokratni token koji je dio QR adrese. Mobitel ga pamti i nakon prekida se sam vraća na isto mjesto. Mjesto ostaje rezervirano 30 sekundi, a ponovno spajanje kreće unutar jedne sekunde.
- Igra prihvaća samo poruke s valjanim tokenom i poznatom verzijom protokola.
- Ping se mjeri porukama na razini aplikacije svake sekunde.
- **Izravna veza u lokalnoj mreži.** Koristi javni STUN, bez TURN-a. Dijagnostika prikazuje vrstu uspostavljene veze (lokalna, preko javne adrese ili preko posrednika). Poznat je rizik da preglednici skrivaju lokalne adrese i da se mobitel i računalo u istoj mreži ne povežu najkraćim putem; istraži to, opiši u `docs/ARCHITECTURE.md` i predaj mi provjeru kao `needs-human` korak.
- **QR i status.** Igra prikazuje QR za svako slobodno mjesto i status veze svakog igrača. Ako se QR ne može prikazati ili uparivanje ne uspije, igra navodi konkretan razlog i korak za ispravak, primjerice da nema interneta, da signalizacijski poslužitelj nije dostupan ili da mreža blokira WebRTC.
- **Dijagnostika** u igri i na mobitelu prikazuje učestalost uzoraka, raspon vrijednosti po osi, broj odbačenih uzoraka, vrstu veze i ping između mobitela i računala.

## 8. Početni zaslon i tijek meča

Prva verzija nema izbornik s načinima igre, nego jedan početni zaslon:

- Prikazuje dva QR koda, lijevi za igrača 1 i desni za igrača 2, svaki u boji svog igrača i sa statusom veze ispod. Položaj QR koda odgovara polovici ekrana u kojoj će taj igrač igrati.
- Svaki mobitel skenira svoj QR i upravlja isključivo svojim reketom. Kad se mobitel spoji, njegov QR zamjenjuje potvrda s oznakom igrača.
- Gumb **Igraj** postaje aktivan kad je spojen barem jedan mobitel. S dva mobitela kreće meč na podijeljenom ekranu, a s jednim meč protiv bota.
- Gumb **Igraj tipkovnicom** pokreće meč na podijeljenom ekranu bez mobitela.
- Ako se igrač odspoji usred meča, meč se pauzira, a u njegovoj polovici prikaže se QR za povratak. Nakon povratka meč se nastavlja s istim rezultatom.
- Po završetku meča prikazuje se rezultat i gumb za revanš, bez ponovnog uparivanja mobitela.

## 9. Faze

Svaka faza je jedan PR s navedenim uvjetima prihvaćanja.

1. **Kostur, CI i objava.** Workspace, `AGENTS.md`, lint, provjera tipova, Vitest i prazna igra. Workflow `ci.yml` pokreće se na svakom PR-u, a `deploy.yml` objavljuje `main` na GitHub Pages. Otvori `needs-human` issue s koracima za uključivanje Pagesa u postavkama repozitorija.
2. **Simulacija i pravila.** Fizika, bodovanje, servis i bot. Testovi pokrivaju odskok, mrežicu, aut i kontakt pri najvećoj brzini zamaha. Meč bota protiv bota od 200 poena završava bez iznimke i s valjanim rezultatom, a ponovljen s istim sjemenom daje isti ishod.
3. **Podijeljeni ekran i tipkovnica.** Scena, dva pogleda, početni zaslon i meč tipkovnicom. Playwright pokreće igru, odigra servis i nekoliko udaraca tipkama oba igrača, provjeri promjenu rezultata u obje polovice i spremi snimku zaslona kao artefakt. Zaseban test provjerava da isti bočni pomak u svakoj polovici pomiče reket u smjeru koji odgovara toj perspektivi.
4. **Kontroler i povezivanje.** Kontroler, protokol, sobe i tokeni, QR, ponovno spajanje i dijagnostika. Playwright otvara igru i dva kontrolera kao zasebne stranice, uparuje ih preko signalizacijskog poslužitelja pokrenutog lokalno u CI-ju i u kontrolere ubacuje snimke iz `fixtures/traces/`. Test provjerava da svaki kontroler pomiče samo svoj reket, da servis i zamah stignu do simulacije, da se zastarjeli uzorci odbacuju i da se nakon prekida kontroler vrati na isto mjesto, a meč nastavi.
5. **Geste.** Bočni pomak, razlikovanje namještanja od zamaha, forehand i backhand. Testovi na snimkama potvrđuju da bočni pomak pod istim kutom pomiče reket u pravom smjeru bez povratnog trzaja, da zakret zapešća ne pomiče reket bočno i da namještanje ne okida udarac.
6. **Dorada i upute.** Meč protiv bota s jednim mobitelom, pauza i povratak igrača, revanš, čitljivost obje polovice na 1080p ekranu. Dovrši `docs/SETUP.md` i `docs/MANUAL_TEST.md`.

## 10. Završna predaja

`docs/SETUP.md` vodi me korak po korak i jasno odvaja dvije cjeline:

- **Samo prvi put:** uključivanje GitHub Pagesa, adresa igre i dopuštenja koja Chrome na mobitelu traži.
- **Svaki put:** otvaranje adrese igre na računalu, skeniranje dva QR koda, kalibracija i servis.

`docs/MANUAL_TEST.md` je popis provjera koje radim ja:

1. Tipkovnicom: servis, nekoliko uzastopnih udaraca i dodjela boda na podijeljenom ekranu.
2. Jedan mobitel protiv bota: senzori, kalibracija, servis, zamah i bočni pomak u oba smjera pod istim kutom te da namještanje reketa ne okida udarac.
3. Dva mobitela: svaki upravlja svojim reketom u svojoj polovici, bočni pomak odgovara smjeru u toj polovici, a nakon kratkog prekida mobitel se vraća na isto mjesto i meč se nastavlja.
4. Vrsta veze i ping u dijagnostici kad su mobiteli i računalo na istom Wi-Fiju.
5. Broj sličica u sekundi s oba pogleda na mom računalu.

U opisu zadnjeg PR-a ukratko navedi što si stvarno pokrenuo, koje si scenarije povezivanja provjerio u CI-ju i što još treba potvrditi na fizičkom Android mobitelu.

## 11. Kasnije, izvan prve verzije

Ovo ne implementiraj. Navedeno je samo da odluke u prvoj verziji to ne onemoguće.

- **Online igra na dva računala.** Jedan preglednik vrti simulaciju, drugi se spaja pozivnim kodom preko WebRTC-a, šalje uzorke svog mobitela i prima stanje. Svaki igrač tada vidi jedan pogled preko cijelog ekrana, isti onaj koji u prvoj verziji zauzima njegovu polovicu.
- **Android aplikacija.** Isti kontroler u tankom Capacitor omotaču, bez vlastite logike.
