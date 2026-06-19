# Project Summary - Animal App (PetCare)

## Overview

Aplicatia este o aplicatie web dezvoltata in Python (Flask), care permite gestionarea si vizualizarea animalelor. Pana in acest punct, aplicatia functioneaza corect pentru afisarea listei de animale si vizualizarea detaliilor fiecarui animal.

## Tehnologii utilizate

- Python
- FastAPI
- MySQL (baza de date)
- React
- React Router
- TanStack React Query
- Axios
- HTML / CSS (frontend)

## Structura proiectului

### Backend

- `Backend/main.py`
  - Fisierul principal al aplicatiei FastAPI
  - Defineste rutele (routes)
  - Conectare la baza de date
  - Preluare date animale din DB
  - Expune endpoint-uri JSON pentru frontend
- `Backend/database.py`
  - Defineste functia `get_connection()`
  - Creeaza conexiunea MySQL folosind `mysql.connector`
  - Conectare locala:
    - host: `localhost`
    - user: `root`
    - password: `root`
    - database: `pet_health`

### Frontend

- `Frontend/src/`
  - `App.jsx` - configurare aplicatie si rute
  - `main.jsx` - entry point React
  - `App.css` - stiluri principale pentru layout, carduri, profil, formulare si istoric
  - `index.css` - stiluri globale
- `Frontend/src/pages/`
  - `Dashboard.jsx` - pagina cu animalele utilizatorului
  - `AnimalPage.jsx` - pagina de profil animal, evaluare simptome, istoric si tratamente
  - `HistoryPage.jsx` - pagina cu istoricul complet al simptomelor
  - `Login.jsx` - pagina login
  - `Register.jsx` - pagina register

## Functionalitati implementate

### 0. Profil animal cu taburi interne

- Pagina `AnimalPage.jsx` este organizata pe taburi:
  - Prezentare generala
  - Evaluare preventiva
  - Istoric
  - Medicatie
  - Recomandari
- Tabul de prezentare generala afiseaza rezumat:
  - date animal
  - ultimul simptom raportat
  - status medicatie
  - tratamente active
  - risc orientativ pe rasa

### 1. Afisare lista animale

- Se face interogare in baza de date
- Se extrag toate animalele
- Se afiseaza in pagina de dashboard (`Dashboard.jsx`)
- Fiecare animal are:
  - nume
  - specie
  - rasa
  - varsta
  - greutate
  - sex
  - imagine / avatar
  - buton / link catre detalii

### 2. Pagina individuala animal (Animal Page)

- Fiecare animal poate fi accesat prin ID
- Ruta de tip: `/animal/:id`
- Frontend-ul preia lista de animale si gaseste animalul dupa ID
- Se afiseaza:
  - nume
  - specie
  - rasa
  - varsta
  - greutate
  - sex
  - avatar in functie de specie
  - alte detalii relevante

### 3. Evaluare preventiva simptome

- Pagina `AnimalPage.jsx` permite:
  - cautarea simptomelor
  - selectarea mai multor simptome
  - alegerea severitatii
  - alegerea frecventei
  - completarea observatiilor
- La generare:
  - se creeaza un `episod_id`
  - se salveaza fiecare simptom prin endpoint-ul `/simptome-animale`
  - se cere analiza episodului prin `/analiza-episod/{episod_id}`
  - se afiseaza afectiunile posibile, nivelul de risc, scorul estimativ si recomandarea

### 4. Istoric simptome

- Pentru fiecare animal se incarca istoricul prin `/istoric-simptome/{animal_id}`
- In pagina animalului se afiseaza ultimele 3 simptome raportate
- Exista link catre istoricul complet: `/animal/{animalId}/istoric`

### 5. Medicatie si suplimente

- Pagina `AnimalPage.jsx` permite adaugarea unui tratament ciclic
- Campuri folosite:
  - nume tratament
  - durata administrare
  - durata pauza
  - data start
  - observatii
- Tratamentele sunt salvate prin `/tratamente`
- Lista tratamentelor se incarca prin `/tratamente/{animal_id}`
- Frontend-ul calculeaza statusul tratamentului:
  - `Administrare`
  - `Pauza`
  - ziua curenta din etapa
  - zile ramase
- Frontend-ul incarca administrarile prin `/administrari-tratamente/{tratament_id}`
- Pentru fiecare tratament se afiseaza:
  - ultima administrare
  - daca a fost administrat azi
  - progresul in etapa curenta
  - zilele ramase
- Exista actiune in frontend pentru marcarea administrarii de azi prin `/administrari-tratamente`
- Sectiunea de tratamente include alerte:
  - tratament neadministrat azi
  - tratament care trebuie reluat dupa pauza
  - corelare orientativa cu simptomele raportate
- Fiecare tratament are calendar compact cu checkbox pentru zile recente si urmatoare

### 6. Conectare la baza de date

- Foloseste MySQL
- Baza de date se numeste `pet_health`
- Conexiunea este definita in `Backend/database.py`
- Exista tabel pentru animale: `animale`
- Structura folosita in backend:
  - `id`
  - `nume`
  - `specie`
  - `rasa_id`
  - `varsta`
  - `greutate`
  - `sex`
  - `fotografie_url`

## Baza de date `pet_health`

Tabele vizibile in schema MySQL:

- `administrari_tratamente`
  - Pastreaza administrarile efective ale tratamentelor.
  - Este folosita de endpoint-urile `/administrari-tratamente` si `/administrari-tratamente/{tratament_id}`.
- `afectiuni`
  - Pastreaza afectiunile posibile, descrierea, recomandarea si nivelul de risc.
  - Este folosita in analiza episodului.
- `animale`
  - Pastreaza profilurile animalelor.
  - Este folosita de endpoint-urile `/animale`.
- `rase_animale`
  - Pastreaza rasele animalelor.
  - Este legata de `animale` prin `rasa_id`.
- `simptome`
  - Pastreaza lista de simptome disponibile in formularul de evaluare.
  - Este folosita de endpoint-ul `/simptome`.
- `simptome_afectiuni`
  - Tabel de legatura intre simptome si afectiuni.
  - Include ponderi folosite la calcularea scorului estimativ.
- `simptome_animale`
  - Pastreaza simptomele raportate pentru fiecare animal.
  - Include severitate, frecventa, observatii si `episod_id`.
- `tratamente`
  - Pastreaza tratamentele si suplimentele animalelor.
  - Include durata administrare, durata pauza, data start si observatii.

## Endpoint-uri backend importante

- `GET /` - verifica daca API-ul ruleaza
- `GET /animale` - returneaza animalele cu rasa asociata
- `POST /animale` - creeaza un animal
- `GET /simptome` - returneaza lista de simptome
- `POST /simptome-animale` - salveaza un simptom raportat pentru un animal
- `GET /istoric-simptome/{animal_id}` - returneaza istoricul simptomelor pentru animal
- `GET /analiza-episod/{episod_id}` - calculeaza evaluarea pe baza simptomelor din episod
- `GET /tratamente/{animal_id}` - returneaza tratamentele animalului
- `POST /tratamente` - creeaza un tratament
- `POST /administrari-tratamente` - salveaza o administrare de tratament
- `GET /administrari-tratamente/{tratament_id}` - returneaza administrarile pentru un tratament

## Fluxul aplicatiei

1. User acceseaza pagina principala animale.
2. Frontend-ul cere datele de la `GET /animale`.
3. Backend-ul face query in MySQL si returneaza JSON.
4. React afiseaza lista de animale.
5. User apasa pe un animal.
6. Se acceseaza ruta: `/animal/:id`.
7. `AnimalPage.jsx` incarca simptome, istoric si tratamente.
8. Se afiseaza pagina individuala, evaluarea preventiva si sectiunea de tratamente.

## Stadiu actual (functional)

- Lista de animale se afiseaza corect
- Navigarea catre pagina unui animal functioneaza
- Datele din baza de date sunt afisate corect
- Frontend-ul React foloseste React Query si Axios pentru date
- Backend-ul FastAPI expune endpoint-urile principale
- Evaluarea simptomelor este implementata
- Istoricul simptomelor este implementat
- Tratamentele ciclice sunt implementate la nivel de creare, listare si calcul status in frontend
- Nu exista erori majore

## Observatii

- UI poate fi imbunatatit
- Mesajele de notificare nu sunt inca stilizate complet
- Posibile imbunatatiri:
  - validari
  - mesaje de succes/eroare
  - design mai modern
  - butoane cu iconuri
  - stari vizuale pentru incarcare si eroare pe fiecare sectiune
  - validare mai stricta pentru tratamente
  - administrari tratamente vizibile in frontend
  - editare/stergere animale
  - editare/stergere tratamente

## Scop pentru Codex

Continuarea dezvoltarii aplicatiei prin:

- imbunatatirea UI/UX
- adaugare notificari
- optimizare cod
- extindere functionalitati, de exemplu adaugare/editare animale
