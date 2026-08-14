# Kurumsal Sera Gazı Envanteri ve Karbon Yönetim Uygulaması — Teknik Dokümantasyon

## 1. Genel Mimari

Uygulama bir tek-sayfa uygulamadır (SPA); tüm ekran mantığı istemci tarafında çalışır,
ancak veri katmanı artık **Firebase Firestore**'a bağlıdır (proje: `cevre-87963`) —
bu, uygulamanın gerçek, paylaşılan bulut veritabanıdır: birden fazla cihaz/kullanıcı
aynı veriyi gerçek zamanlı görür ve düzenler. Kütüphaneler CDN üzerinden yüklenir
(Bootstrap 5, Chart.js, DataTables, SheetJS/XLSX, jsPDF, Font Awesome, Firebase SDK);
çalıştırmak için internet bağlantısı gerekir ama herhangi bir kurulum (Node.js, npm,
kendi sunucunuz) gerekmez. `index.html` çift tıklanarak veya basit bir statik dosya
sunucusuyla açılabilir — bkz. Bölüm 13.

```
ghg-envanter/
  index.html            SPA kabuğu: sidebar, topbar, modal'lar, bulut yükleme ekranı, <script> yüklemeleri
  css/style.css         Tüm görsel tasarım
  js/
    core/
      firebaseConfig.js Firebase proje bağlantı bilgileri (cevre-87963)
      storage.js        Firestore CRUD katmanı + gerçek zamanlı senkronizasyon + revizyon geçmişi + onay workflow
      calculationEngine.js   Hesaplama motoru (Aktivite x Faktör x GWP = CO2e)
      validation.js     Otomatik kontrol/uyarı motoru + veri tamamlanma yüzdesi
      utils.js          Ortak UI yardımcıları (toast, modal, dropdown seçenekleri, export)
      crudBuilder.js    Basit master-data ekranları için jenerik CRUD tablo/form üretici
    data/
      emissionFactorsSeed.js   Başlangıç emisyon faktörü veritabanı (referans değerler)
      gwpSeed.js               IPCC AR4/AR5/AR6 GWP değerleri
    modules/            Her menü öğesi için bir modül (aşağıda bkz. Bölüm 4)
    router.js           #hash tabanlı basit router
    app.js              Uygulama başlangıç noktası (Firestore bağlantısı + seed + wiring + ilk render)
  docs/TEKNIK_DOKUMANTASYON.md   Bu doküman
```

Her modül `window.Modules.<route> = { render(container) { ... } }` biçiminde kendini
kaydeder; `router.js` `location.hash` değiştiğinde ilgili modülün `render()`
fonksiyonunu çağırır. Modüller birbirinden bağımsızdır ve sadece `Store`, `Calc`,
`Validation`, `Utils`, `CrudBuilder` üzerinden haberleşir — global DOM state yoktur.

## 2. Veri Modeli (Firestore Koleksiyonları)

`Store.KEYS` içinde listelenen her anahtar, `systemSettings` dışında, Firestore'da
aynı adı taşıyan bir **top-level koleksiyon**dur; her kayıt o koleksiyonda bir
doküman olarak tutulur (doküman ID = Firestore'un otomatik ürettiği `id` alanı —
sıralı sayı değil, çakışma riski olmayan rastgele bir string). `systemSettings` bu
kuralın dışındadır: cihaza özel arayüz tercihleri (aktif yıl, kullanıcı adı, rol)
olduğu için hâlâ sadece bu tarayıcının LocalStorage'ında tutulur, Firestore'a
senkronize edilmez.

| Anahtar | İçerik |
|---|---|
| companyData, facilityData, departmentData, processData, emissionSourceData | Kurumsal tanımlar |
| reportingYears | Raporlama yılı / baz yıl / GWP seti / durum |
| productData, productionData | Ürün tanımı + aylık üretim |
| energyData | Aylık enerji tüketimi (tüm türler) |
| scope1Data | Scope 1 mobil yakma kayıtları (`category:'mobile'`) |
| scope2Data | *(şu an kullanılmıyor — Scope 2 verisi energyData üzerinden yürüyor)* |
| scope3Data | Scope 3, 15 kategori |
| processEmissionData | Proses emisyonları (Nitrik Asit dahil) |
| fugitiveEmissionData | Kaçak emisyonlar (soğutucu/SF6 vb.) |
| emissionFactors | Emisyon faktörü veritabanı |
| gwpFactors | GWP değerleri (AR4/AR5/AR6, gaz bazlı) |
| calculationResults | **Tüm hesaplama sonuçları + tam denetim izi** (bkz. Bölüm 3) |
| validationResults | Son çalıştırılan otomatik kontrol sonuçları |
| revisionHistory | Her CRUD işleminin öncesi/sonrası + kullanıcı + tarih |
| documents | Belge referansları |
| systemSettings | Aktif yıl, kullanıcı, rol, GWP seti vb. tekil ayar objesi |

Her veri-girişi kaydında ortak alanlar bulunur: `id`, `status` (draft/review/checked/
approved/locked), `dataQuality` (A-E), `entryDate`, `entryUser`, `isDemo`.

## 3. Hesaplama Motoru (`js/core/calculationEngine.js`)

Temel kural değişmez:

```
Aktivite Verisi  x  Emisyon Faktörü  =  Gaz Emisyonu (kg)
Gaz Emisyonu     x  GWP              =  CO2e (kg)
```

`Calc.runAndStore(meta)` çağrısı:

1. `meta.factorId` verilmişse `emissionFactors` koleksiyonundan faktörü okur; verilmemiş
   ve `meta.manualFactor` verilmişse (ör. doğrudan ölçüm, GWP-only kaçak emisyon,
   manuel/kütle dengesi girişi) onu kullanır.
2. Aktif GWP setine göre (`gwpFactors`) her gaz için (CO2, CH4, N2O, HFC, PFC, SF6, NF3)
   `Gaz Emisyonu x GWP` hesaplar ve toplar.
3. Sonucu **her zaman kaynağıyla birlikte** `calculationResults` içine yazar: hangi
   kayıttan geldiği (`sourceKey`/`sourceId`), hangi faktör kullanıldığı (kaynak, versiyon,
   geçerlilik yılı — `factorSnapshot`), hangi GWP seti kullanıldığı, hesaplama yöntemi ve
   okunabilir bir "trace" metni (bkz. `Calc.buildTrace`). Bu, uygulamanın hiçbir zaman bir
   emisyon faktörünü kullanıcıdan gizlemeden kullanmaması kuralını (bölüm 41) sağlar.
4. Aynı kaynak kayıt için önceki hesaplama sonucu varsa silinip yenisi yazılır (idempotent
   yeniden hesaplama — kayıt güncellendiğinde eski sonuç birikmez).

Her modülün "Detay" (büyüteç) butonu bu trace metnini bir modal'da gösterir —
"Toplam Scope 1 → Sabit Yakma → Doğalgaz → Ocak 2026 → 150.000 Sm³ → Faktör → Sonuç"
izlenebilirliği böyle sağlanır (bölüm 39-40).

### Veri Akışı: Üretim → Enerji → Emisyon → CO2e → Ürün Karbon Yoğunluğu

- **Enerji Verileri** ekranına girilen her kayıt, enerji türüne göre otomatik olarak
  Scope 1 (yakılan yakıtlar: doğalgaz, fuel-oil, kömür, LPG, kızgın yağ, motorin/benzin)
  veya Scope 2 (elektrik, buhar, ısıtma, soğutma) hesaplamasına yönlendirilir
  (`energy.js` → `runEnergyCalculations`). Elektrik için location-based ve market-based
  sonuçlar ayrı ayrı hesaplanır (GHG Protocol Scope 2 Guidance).
- **Proses Emisyonları**, **Scope 1 Mobil Yakma**, **Scope 3** ve **Kaçak Emisyonlar**
  kendi ekranlarından girilir ve kaydedildiği anda hesaplanır.
- **Üretim** verisi CO2e üretmez; paydaç olarak kullanılır. Dashboard, Üretim Analizleri
  ve Raporlar ekranları `toplam CO2e / toplam üretim` işlemiyle `tCO2e/ton ürün`,
  Scope 1/2/3 yoğunluğu ve enerji yoğunluğunu **her zaman canlı veriden** hesaplar —
  hiçbir gösterge önceden hesaplanıp saklanmaz.

## 4. Modül Haritası

| Menü | Dosya | Notlar |
|---|---|---|
| Dashboard | dashboard.js | 10 KPI kartı, 7 grafik, filtreler, veri tamamlanma göstergesi |
| Kurumsal Tanımlar | corporateDefinitions.js | Firma/Tesis/Bölüm/Proses/Emisyon Kaynağı (5 sekme) |
| Raporlama Yılı | reportingYear.js | Yıl, baz yıl, GWP seti, durum |
| Üretim Bilgileri | production.js | Ürün tanımı + aylık üretim + üretim analizleri |
| Enerji Verileri | energy.js | Tüm enerji türleri, otomatik Scope 1/2 tetikleyici |
| Scope 1 | scope1.js | Sabit yakma (enerjiden otomatik) + Mobil yakma (CRUD) + Proses/Kaçak özet |
| Scope 2 | scope2.js | Location-based / Market-based karşılaştırma (salt-okunur özet) |
| Scope 3 | scope3.js | 15 kategori CRUD + kategori dağılımı |
| Proses Emisyonları | processEmissions.js | Genel proses + Nitrik Asit özel N2O/NOx ölçüm alanları |
| Kaçak Emisyonlar | fugitiveEmissions.js | Kaçak miktar x GWP (doğrudan) |
| Emisyon Faktörleri | emissionFactors.js | Faktör veritabanı CRUD |
| GWP Yönetimi | gwpManagement.js | AR4/AR5/AR6 gaz bazlı GWP CRUD |
| Hesaplamalar | calculationsView.js | Tüm `calculationResults` — aranabilir denetim izi |
| Veri Kalitesi | dataQuality.js | A-E dağılımı + onay workflow (draft→review→checked→approved→locked) |
| Kontrol ve Uyarılar | controls.js | `Validation.runChecks()` çıktısı, önem derecesine göre gruplu |
| Raporlar | reports.js | Aylık/Yıllık/Ürün Bazlı/Yıl Karşılaştırma/ISO 14064/GHG Protocol |
| Excel İşlemleri | excelIO.js | Her veri-girişi modülü için şablon + içe aktarım + tam dışa aktarım |
| Veri Yedekleme | backup.js | JSON tam yedekleme/geri yükleme + sıfırlama |
| Sistem Ayarları | settings.js | Kullanıcı/rol, genel ayarlar, demo veri temizleme |

## 5. Veri Kalitesi ve Onay Workflow'u

Her veri-girişi kaydı `Taslak → Kontrol Bekliyor → Kontrol Edildi → Onaylandı →
Kilitlendi` durumlarından geçer (`Store.STATUS`). **Veri Kalitesi** ekranındaki
"İlerlet" butonu bir sonraki duruma taşır ve `revisionHistory`'e kayıt düşer. Kilitli
bir kayıt `Store.update()` ile normal yoldan değiştirilemez — `opts.revisionReason`
zorunlu kılınmıştır (bkz. `storage.js`).

## 6. Kontrol / Uyarı Motoru (`validation.js`)

`Validation.runChecks(year)` şu kontrolleri otomatik yapar: eksik aylık üretim/enerji
verisi, sıfır tüketim, önceki aya göre %50'den fazla anormal değişim, üretim var
enerji yok (ve tersi), eksik Scope 1/2/3, eksik/uyumsuz emisyon faktörü, eksik GWP.
Sonuçlar önem derecesine (high/medium/low) göre **Kontrol ve Uyarılar** ekranında
listelenir; aylık veri tamamlanma yüzdesi Dashboard'da ve bu ekranda gösterilir.

## 7. Emisyon Faktörleri ve GWP — Önemli Not

`emissionFactorsSeed.js` içindeki tüm faktörler **başlangıç/referans** değerlerdir
(çoğunlukla IPCC 2006 Guidelines varsayılan faktörleri veya örnek tedarikçi/şebeke
değerleri) ve her birinin `description` alanında açıkça "REFERANS DEĞER — doğrulayın"
uyarısı vardır. Gerçek bir raporlama için:

- Elektrik şebeke faktörü (Scope 2 location-based) ilgili yılın resmi ulusal
  şebeke ortalama emisyon faktörüyle güncellenmelidir.
- Tesise özgü yakıt/ürün faktörleri mümkünse ölçüme veya tedarikçi beyanına
  dayandırılmalıdır.
- Nitrik asit N2O faktörü azaltım sistemi (NSCR/tersiyer) durumuna göre büyük
  ölçüde değişir; iki örnek satır (kontrolsüz / NSCR'li) seed'e eklenmiştir,
  gerçek tesis verisiyle değiştirilmelidir.

Hiçbir faktör kodun içine sabit yazılmamıştır; hepsi **Emisyon Faktörleri** ekranından
düzenlenebilir/silinebilir/eklenebilir.

## 8. Excel İçe/Dışa Aktarım (`excelIO.js`)

Aşağıdaki veri-girişi türlerinin her biri için ayrı şablon indirme + içe aktarım
sağlanır (yalnızca Üretim/Enerji/Scope 3 değil — orijinal istekten genişletilmiştir):

- Üretim Verileri
- Enerji Verileri (Elektrik, Doğalgaz, **Motorin/Mazot**, Benzin, LPG, Kömür, Buhar…)
- Scope 1 — Mobil Yakma (araç yakıt faturaları)
- Scope 3 (15 kategori)
- Proses Emisyonları
- Kaçak Emisyonlar

İçe aktarım sırasında Tesis/Ürün eşleştirmesi **kod** (Tesis Kodu / Ürün Kodu) ile
yapılır; eşleşmeyen satırlar atlanır ve kullanıcıya kaç satırın başarılı/atlandığı
gösterilir. Her başarılı içe aktarım, ilgili modülün `runCalc()` fonksiyonunu
çağırarak CO2e hesaplamasını manuel girişle birebir aynı şekilde tetikler. Ayrıca
"Tüm Verileri İndir" ile bütün koleksiyonlar tek bir çok sayfalı Excel dosyasına
aktarılabilir.

## 9. Demo Veri

Uygulama artık açılışta örnek/demo veri oluşturmaz — kullanıcı isteğiyle bu
davranış kaldırıldı (`js/data/demoData.js` silindi, `app.js` onun yerine
`Store.purgeDemoData()` çağırıyor). `isDemo` alanı ve `Utils.demoBadge()` altyapısı
hâlâ mevcuttur (örn. eski bir sürümden kalma veya bir yedekten geri yüklenen
`isDemo:true` kayıtları arayüzde **DEMO VERİ** rozetiyle işaretlemeye devam eder),
ancak hiçbir yerde otomatik olarak veri üretilmez. **Sistem Ayarları → Demo
Verilerini Kontrol Et ve Temizle** butonu, uygulama her açıldığında zaten otomatik
çalışan bu temizliği manuel olarak da tetikleyebilir (örn. eski bir sürümden
kalma `isDemo:true` kayıtları varsa).

## 10. Roller, Kullanıcı Yönetimi ve Güvenlik

Roller artık **gerçek hesaba bağlıdır** — Firestore'daki `users` koleksiyonunda
(doküman ID = Firebase Auth UID) her hesap için `{email, role, active}` tutulur.
Bu, eski self-servis "rol seç" dropdown'ının yerini almıştır:

- **İlk giriş bootstrap'ı:** `users` koleksiyonu tamamen boşken giriş yapan ilk
  kişi otomatik olarak `admin` yapılır (`app.js` → `resolveMyAccess()`). Bundan
  sonraki her yeni hesap sadece bir admin tarafından **Kullanıcı Yönetimi**
  ekranından eklenebilir.
- **Kullanıcı Yönetimi** ekranı (sadece admin görebilir — hem sidebar'da
  gizlenir hem modül kendi içinde ayrıca kontrol eder) yeni hesap oluşturma
  (e-posta+şifre+rol), rol değiştirme, aktif/pasif yapma ve erişim kaldırma
  sağlar. Hesap oluşturma, `Store.createUserAccount()` içinde **ikincil bir
  Firebase app instance** kullanır — böylece yeni hesap oluşturulurken admin
  kendi oturumundan atılmaz (Firebase client SDK normalde `createUser` sonrası
  o hesaba geçiş yapar; bu, o davranışı izole eder).
- **Erişim kaldırma**, Firebase Authentication hesabını silmez — sadece
  `users` dokümanını siler. Uygulama girişte bu dokümanı kontrol ettiğinden
  (ve mevcut oturumları `queueRerender` içinde periyodik olarak yeniden
  kontrol ettiğinden) erişimi kaldırılan biri anında dışarı atılır, ama
  Firebase Auth hesabı Console'da hâlâ görünür durur; tamamen silmek isterseniz
  Console'dan elle silinmelidir.
- Son admin hesabının rolü düşürülemez / devre dışı bırakılamaz / erişimi
  kaldırılamaz (uygulama içi güvenlik: sistemi kilitli bırakmayı önler).

**Bilinen sınırlama:** Firestore Security Rules şu an `users` koleksiyonu için
özel bir kısıtlama içermiyor (bkz. Bölüm 11'deki kural) — yani teknik olarak
zaten davet edilmiş, gerçek bir hesabı olan sofistike bir kullanıcı, tarayıcı
konsolundan doğrudan Firestore API'sini çağırarak kendi `users` dokümanını
değiştirip kendini admin yapabilir. Uygulamanın arayüzü bunu hiçbir yerde
sunmaz/kolaylaştırmaz, ama sert bir güvenlik sınırı da değildir. Küçük bir
ekip için pratikte düşük risktir; tam kapatmak isterseniz `users` koleksiyonu
için "sadece admin yazabilir + ilk-bootstrap'a özel istisna" kuralını
Firestore Rules Playground'da test ederek dikkatle eklemenizi öneririz (yanlış
yazılmış bir kural herkesi tamamen dışarıda bırakabilir).

## 11. Firestore Backend

Uygulama **Firebase proje `cevre-87963`**'e bağlıdır (`js/core/firebaseConfig.js`).
`storage.js` her koleksiyon için gerçek zamanlı bir `onSnapshot` dinleyicisi açar ve
sonucu bellekte bir `cache` nesnesinde tutar; `Store.getAll/getById` bu önbellekten
senkron okur, `Store.add/update/remove/setAll` hem önbelleği hem Firestore'u günceller
(iyimser/optimistic yazma — UI, sunucu onayını beklemeden anında güncellenir).
Bu sayede tüm modül dosyaları (production.js, energy.js, ...) hiç değişmeden aynı
senkron `Store` API'sini kullanmaya devam eder.

**Kimlik doğrulama:** Firebase Email/Password Authentication kullanılır — uygulama
açılışta gerçek bir giriş ekranı gösterir, hiçbir self-servis "Kayıt Ol" yoktur.
Hesaplar sadece Firebase Console'dan (Authentication → Users → Add user) elle
oluşturulur, böylece uygulamaya kimlerin girebileceğini siz kontrol edersiniz.
Eski (artık kaldırılmış) anonim-giriş sürümünden kalma bir oturum varsa
`storage.js` bunu tanıyıp otomatik `signOut()` yapar ve giriş ekranını gösterir —
anonim bir oturumun giriş ekranını atlayabilmesi mümkün değildir.

**Çevrimdışı önbellekleme kasıtlı olarak kapalı:** Firestore'un `enablePersistence()`
(IndexedDB önbellek + sekmeler arası koordinasyon) özelliği kullanılmıyor. Bu özellik
sekmeler arası koordinasyon için küçük miktarda LocalStorage da kullanır; eski
LocalStorage tabanlı sürümden kalan büyük veri kotayı doldurduğunda bu küçük yazma
başarısız olup Firestore'un iç durumunu bozuyor ve tekrarlayan "INTERNAL ASSERTION
FAILED" hatalarına yol açıyordu (gerçek ortamda görülüp düzeltildi). Gerçek zamanlı
senkronizasyon (`onSnapshot`) bundan etkilenmez, sadece tamamen çevrimdışıyken okuma
yapılamaz. `storage.js`'nin `initFirebase()` fonksiyonu ayrıca her açılışta eski
sürümden kalmış olabilecek LocalStorage anahtarlarını (`systemSettings` hariç) otomatik
temizler (`purgeLegacyLocalStorage()`), aynı kota sorununu tekrar yaşamamak için.

**Gerekli Firebase Console kurulumu** (bu adımlar kod dışıdır, konsoldan elle
yapılmalıdır — Node.js/Firebase CLI olmadığı için buradan otomatik uygulanamaz):
1. **Authentication → Sign-in method → Email/Password** → etkinleştir.
   (Daha önce etkinleştirilmiş olan **Anonymous** sağlayıcısını artık kullanılmadığı
   için kapatabilirsiniz — açık kalması güvenlik açığı oluşturmaz çünkü kod artık
   anonim oturumları otomatik reddediyor, ama temiz olması için kapatmanız önerilir.)
2. **Authentication → Users → Add user** ile uygulamayı kullanacak her kişi için
   e-posta + şifre girin. Bu, "kimin girebileceğini" belirlediğiniz tek yer —
   uygulamanın kendisinde kayıt ol ekranı yoktur.
3. **Firestore Database** oluşturulmamışsa oluştur (Native mode, uygun bölge).
4. **Firestore Database → Rules** sekmesine şu kuralları yapıştır:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{collection}/{docId} {
         allow read, write: if request.auth != null;
       }
     }
   }
   ```
   Bu kural, sadece gerçek bir hesapla giriş yapmış istemcilerin okuma/yazma
   yapmasına izin verir. Veri gerçekten hassaslaşırsa (ör. birden çok bağımsız
   müşteri/OSGB paylaşacaksa) kural bazında koleksiyon/kullanıcı ayrımı eklenmelidir.

**Ölçeklenebilirlik notları:**
- `calculationResults` her hesaplamada eski kaydı hedefli olarak silip yenisini
  ekler (tüm koleksiyonu yeniden yazmaz) — bkz. `calculationEngine.js`.
- `validationResults` artık Firestore'a hiç yazılmaz (sadece bellekte hesaplanıp
  döndürülür) — her dashboard/kontrol ekranı render'ında koleksiyonun tamamını
  yeniden yazmak hem gereksiz hem de canlı-senkron dinleyicisiyle birleşince
  sonsuz render döngüsü riski taşıyordu.
- `Store.setAll` (ör. Excel toplu içe aktarım, yedekten geri yükleme, demo veri
  temizleme) Firestore'un 500 işlemlik batch sınırına karşı otomatik olarak
  450'lik gruplara bölünür.

## 12. Bilinen Sınırlamalar

- Scope 2 için ayrı bir `scope2Data` koleksiyonu yoktur; veri girişi tamamen
  Enerji Verileri ekranı üzerinden yürür (bilinçli tasarım kararı — bkz. Bölüm 3).
- HFC/PFC gibi soğutucu gaz karışımları için emisyon faktörü değil, doğrudan GWP
  Yönetimi kaydı kullanılır (gerçek yönteme daha uygun — leaked kg x GWP).
- Belge yönetimi (bölüm 20) şu an her kayıtta bir metin alanı (belge referansı /
  fatura no) olarak tutulur; gerçek dosya yükleme/saklama kapsam dışı bırakılmıştır
  (Firebase Storage entegrasyonu ileride eklenebilir).
- Rol bazlı kısıtlama yalnızca arayüz seviyesindedir (bkz. Bölüm 10) — gerçek
  erişim denetimi Firestore Security Rules'a bağlıdır.
- Firestore bulut veritabanı artık **paylaşılan/tek** bir veri kümesidir — bu
  Firebase projesine erişimi olan herkes aynı verileri görür/değiştirir (Risk360'ın
  aksine çok-kiracılı/firma bazlı ayrım burada yoktur; gerekirse ileride eklenebilir).

## 13. Kurulum ve Çalıştırma

1. Klasörü herhangi bir statik dosya sunucusundan açın (`python -m http.server`,
   `npx http-server`, ya da doğrudan `index.html`'i çift tıklayarak `file://` ile).
2. İlk açılışta ekran "Firestore'a bağlanılıyor..." yükleme ekranını gösterir; bu,
   Bölüm 11'deki 3 Firebase Console adımı tamamlanana kadar bir hata mesajıyla
   takılı kalır. Adımlar tamamlandıktan sonra sayfa yenilenince uygulama açılır.
3. Birden fazla cihaz/tarayıcıdan aynı anda açılan uygulamalar artık aynı veriyi
   gerçek zamanlı paylaşır — bir cihazda girilen veri birkaç yüz milisaniye içinde
   diğerlerinde de görünür.
