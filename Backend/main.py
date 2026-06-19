import base64
import binascii
import hashlib
import unicodedata
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from database import get_connection
from datetime import date

app = FastAPI()
UPLOADS_DIR = Path(__file__).resolve().parent / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def public_user(user: dict | None):
    if not user:
        return None

    user.pop("parola", None)
    return user


def normalize_medical_text(value: str | None) -> str:
    text = str(value or '').lower()
    text = ''.join(
        char for char in unicodedata.normalize('NFD', text)
        if unicodedata.category(char) != 'Mn'
    )
    return text

def recommendation_matches_symptoms(keyword: str | None, symptoms_text: str) -> bool:
    keyword_text = normalize_medical_text(keyword)
    symptom_text = normalize_medical_text(symptoms_text)

    if not keyword_text or not symptom_text:
        return False

    keywords = [item.strip() for item in keyword_text.replace(',', ';').split(';') if item.strip()]
    return any(item in symptom_text or symptom_text in item for item in keywords)


class UserRegister(BaseModel):
    nume: str
    email: str
    parola: str
    telefon: str | None = None
    adresa: str | None = None
    fotografie_url: str | None = None


class UserLogin(BaseModel):
    email: str
    parola: str


class UserUpdate(BaseModel):
    # Emailul contului nu se modifica din profil.
    # Pastram campul optional doar ca sa nu crape frontend-ul daca il trimite.
    nume: str | None = None
    email: str | None = None
    telefon: str | None = None
    adresa: str | None = None
    fotografie_url: str | None = None


class PasswordUpdate(BaseModel):
    parola_veche: str
    parola_noua: str


class AnimalCreate(BaseModel):
    user_id: int | None = None
    nume: str
    specie: str
    rasa_id: int | None = None
    varsta: int | None = None
    greutate: float | None = None
    sex: str | None = None
    fotografie_url: str | None = None


class AnimalUpdate(BaseModel):
    nume: str
    specie: str
    rasa_id: int | None = None
    varsta: int | None = None
    greutate: float | None = None
    sex: str | None = None
    culoare: str | None = None
    data_nasterii: str | None = None
    sterilizat: bool | None = None
    microcip: str | None = None
    observatii_generale: str | None = None
    fotografie_url: str | None = None
    fotografie_data: str | None = None


class SimptomAnimal(BaseModel):
    animal_id: int
    simptom_id: int
    severitate: str
    frecventa: str | None = None
    observatii: str | None = None
    episod_id: str | None = None


class TratamentCreate(BaseModel):
    animal_id: int
    nume: str
    tip: str = "ciclic"
    durata_administrare: int | None = None
    durata_pauza: int | None = None
    data_start: str | None = None
    observatii: str | None = None


class AdministrareTratament(BaseModel):
    tratament_id: int
    data_administrare: str | None = None
    observatii: str | None = None


class GreutateCreate(BaseModel):
    animal_id: int
    greutate: float
    data_inregistrare: str | None = None
    observatii: str | None = None


@app.get("/")
def root():
    return {"message": "PetCare API running"}


@app.post("/register")
def register(user: UserRegister):
    email = user.email.strip().lower()

    if not user.nume.strip():
        raise HTTPException(status_code=400, detail="Numele este obligatoriu.")

    if not email:
        raise HTTPException(status_code=400, detail="Emailul este obligatoriu.")

    if len(user.parola) < 6:
        raise HTTPException(status_code=400, detail="Parola trebuie sa aiba cel putin 6 caractere.")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    cursor.execute("SELECT id FROM utilizatori WHERE email = %s", (email,))
    existent = cursor.fetchone()

    if existent:
        cursor.close()
        conn.close()
        raise HTTPException(status_code=400, detail="Exista deja un cont cu acest email.")

    cursor.execute(
        """
        INSERT INTO utilizatori
        (nume, email, parola, telefon, adresa, fotografie_url)
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (
            user.nume.strip(),
            email,
            hash_password(user.parola),
            user.telefon,
            user.adresa,
            user.fotografie_url
        )
    )

    conn.commit()
    user_id = cursor.lastrowid

    cursor.execute(
        """
        SELECT id, nume, email, telefon, adresa, fotografie_url, creat_la
        FROM utilizatori
        WHERE id = %s
        """,
        (user_id,)
    )
    created_user = cursor.fetchone()

    cursor.close()
    conn.close()

    return created_user


@app.post("/login")
def login(user: UserLogin):
    email = user.email.strip().lower()

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    cursor.execute(
        """
        SELECT id, nume, email, parola, telefon, adresa, fotografie_url, creat_la
        FROM utilizatori
        WHERE email = %s
        LIMIT 1
        """,
        (email,)
    )

    db_user = cursor.fetchone()

    cursor.close()
    conn.close()

    if not db_user:
        raise HTTPException(status_code=401, detail="Email sau parola invalida.")

    parola_introdusa_hash = hash_password(user.parola)
    parola_db = db_user.get("parola")

    # Accepta temporar si parole vechi salvate in clar, ca sa nu pierzi conturile create in teste.
    if parola_db not in (parola_introdusa_hash, user.parola):
        raise HTTPException(status_code=401, detail="Email sau parola invalida.")

    return public_user(db_user)


@app.get("/utilizator/{user_id}")
def get_utilizator(user_id: int):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    cursor.execute(
        """
        SELECT id, nume, email, telefon, adresa, fotografie_url, creat_la
        FROM utilizatori
        WHERE id = %s
        LIMIT 1
        """,
        (user_id,)
    )

    user = cursor.fetchone()

    cursor.close()
    conn.close()

    if not user:
        raise HTTPException(status_code=404, detail="Utilizatorul nu exista.")

    return user


@app.put("/utilizator/{user_id}")
def update_utilizator(user_id: int, data: UserUpdate):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    cursor.execute(
        """
        SELECT id, nume, email, telefon, adresa, fotografie_url, creat_la
        FROM utilizatori
        WHERE id = %s
        LIMIT 1
        """,
        (user_id,)
    )
    existent = cursor.fetchone()

    if not existent:
        cursor.close()
        conn.close()
        raise HTTPException(status_code=404, detail="Utilizatorul nu exista.")

    nume = data.nume.strip() if data.nume and data.nume.strip() else existent.get("nume")
    telefon = data.telefon.strip() if isinstance(data.telefon, str) else data.telefon
    adresa = data.adresa.strip() if isinstance(data.adresa, str) else data.adresa

    # Nu permitem schimbarea emailului prin pagina de setari.
    # Emailul ramane cel cu care a fost creat contul.
    fotografie_url = data.fotografie_url
    if fotografie_url is None:
        fotografie_url = existent.get("fotografie_url")

    cursor.execute(
        """
        UPDATE utilizatori
        SET
            nume = %s,
            telefon = %s,
            adresa = %s,
            fotografie_url = %s
        WHERE id = %s
        """,
        (
            nume,
            telefon,
            adresa,
            fotografie_url,
            user_id
        )
    )

    conn.commit()

    cursor.execute(
        """
        SELECT id, nume, email, telefon, adresa, fotografie_url, creat_la
        FROM utilizatori
        WHERE id = %s
        """,
        (user_id,)
    )
    updated_user = cursor.fetchone()

    cursor.close()
    conn.close()

    return updated_user


@app.put("/utilizator/{user_id}/parola")
def update_parola(user_id: int, data: PasswordUpdate):
    if len(data.parola_noua) < 6:
        raise HTTPException(status_code=400, detail="Parola noua trebuie sa aiba cel putin 6 caractere.")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    cursor.execute(
        """
        SELECT id, parola
        FROM utilizatori
        WHERE id = %s
        LIMIT 1
        """,
        (user_id,)
    )

    user = cursor.fetchone()

    if not user:
        cursor.close()
        conn.close()
        raise HTTPException(status_code=404, detail="Utilizatorul nu exista.")

    parola_veche_hash = hash_password(data.parola_veche)

    if user["parola"] not in (parola_veche_hash, data.parola_veche):
        cursor.close()
        conn.close()
        raise HTTPException(status_code=400, detail="Parola veche nu este corecta.")

    cursor.execute(
        """
        UPDATE utilizatori
        SET parola = %s
        WHERE id = %s
        """,
        (hash_password(data.parola_noua), user_id)
    )

    conn.commit()

    cursor.close()
    conn.close()

    return {"message": "Parola a fost actualizata."}


@app.get("/animale")
def get_animale(user_id: int | None = None):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    query = """
        SELECT 
            a.id,
            a.user_id,
            a.nume,
            a.specie,
            CASE
                WHEN a.data_nasterii IS NOT NULL THEN TIMESTAMPDIFF(YEAR, a.data_nasterii, CURDATE())
                ELSE a.varsta
            END AS varsta,
            a.greutate,
            a.sex,
            a.fotografie_url,
            a.culoare,
            a.data_nasterii,
            a.sterilizat,
            a.microcip,
            a.observatii_generale,
            a.rasa_id,
            r.nume AS rasa,
            r.descriere AS rasa_descriere,
            r.temperament AS rasa_temperament,
            r.greutate_medie AS rasa_greutate_medie,
            r.nivel_activitate AS rasa_nivel_activitate
        FROM animale a
        LEFT JOIN rase_animale r ON a.rasa_id = r.id
    """

    values = ()

    if user_id is not None:
        query += " WHERE a.user_id = %s"
        values = (user_id,)

    cursor.execute(query, values)
    data = cursor.fetchall()

    cursor.close()
    conn.close()

    return data


@app.get("/rase")
def get_rase():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    query = """
        SELECT *
        FROM rase_animale
        ORDER BY specie, nume
    """

    cursor.execute(query)
    data = cursor.fetchall()

    cursor.close()
    conn.close()

    return data


@app.get("/rase/{specie}")
def get_rase_by_specie(specie: str):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    query = """
        SELECT *
        FROM rase_animale
        WHERE specie = %s
        ORDER BY nume
    """

    cursor.execute(query, (specie,))
    data = cursor.fetchall()

    cursor.close()
    conn.close()

    return data

@app.get("/rase-detalii/{rasa_id}")
def get_rasa_detalii(rasa_id: int):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    query = """
        SELECT
            rd.*,
            r.nume AS rasa
        FROM rase_detalii rd
        JOIN rase_animale r ON rd.rasa_id = r.id
        WHERE rd.rasa_id = %s
        LIMIT 1
    """

    cursor.execute(query, (rasa_id,))
    data = cursor.fetchone()

    cursor.close()
    conn.close()

    if not data:
        raise HTTPException(
            status_code=404,
            detail="Nu exista detalii pentru aceasta rasa"
        )

    return data

@app.post("/animale")
def create_animal(animal: AnimalCreate):
    conn = get_connection()
    cursor = conn.cursor()

    query = """
        INSERT INTO animale 
        (user_id, nume, specie, rasa_id, varsta, greutate, sex, fotografie_url)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
    """

    values = (
        animal.user_id,
        animal.nume,
        animal.specie,
        animal.rasa_id,
        animal.varsta,
        animal.greutate,
        animal.sex,
        animal.fotografie_url
    )

    cursor.execute(query, values)
    conn.commit()

    new_id = cursor.lastrowid

    cursor.close()
    conn.close()

    return {"id": new_id}


@app.put("/animale/{animal_id}")
def update_animal(animal_id: int, animal: AnimalUpdate):
    fotografie_url = animal.fotografie_url

    if animal.fotografie_data:
        try:
            _, encoded_image = animal.fotografie_data.split(",", 1)
            image_bytes = base64.b64decode(encoded_image, validate=True)
        except (ValueError, binascii.Error):
            raise HTTPException(status_code=400, detail="Imaginea trimisa nu este valida.")

        image_name = f"animal-{animal_id}.jpg"
        image_path = UPLOADS_DIR / image_name
        image_path.write_bytes(image_bytes)
        fotografie_url = (
            f"http://127.0.0.1:8000/uploads/{image_name}"
            f"?v={image_path.stat().st_mtime_ns}"
        )

    conn = get_connection()
    cursor = conn.cursor()

    query = """
        UPDATE animale
        SET nume = %s,
            specie = %s,
            rasa_id = %s,
            varsta = %s,
            greutate = %s,
            sex = %s,
            culoare = %s,
            data_nasterii = %s,
            sterilizat = %s,
            microcip = %s,
            observatii_generale = %s,
            fotografie_url = %s
        WHERE id = %s
    """

    values = (
        animal.nume,
        animal.specie,
        animal.rasa_id,
        animal.varsta,
        animal.greutate,
        animal.sex,
        animal.culoare,
        animal.data_nasterii,
        animal.sterilizat,
        animal.microcip,
        animal.observatii_generale,
        fotografie_url,
        animal_id
    )

    cursor.execute(query, values)
    conn.commit()

    cursor.close()
    conn.close()

    return {"message": "Profil salvat", "fotografie_url": fotografie_url}


@app.delete("/animale/{animal_id}")
def delete_animal(animal_id: int):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    def table_exists(table_name: str) -> bool:
        cursor.execute("SHOW TABLES LIKE %s", (table_name,))
        return cursor.fetchone() is not None

    def column_exists(table_name: str, column_name: str) -> bool:
        cursor.execute(f"SHOW COLUMNS FROM `{table_name}` LIKE %s", (column_name,))
        return cursor.fetchone() is not None

    try:
        cursor.execute("SELECT id, fotografie_url FROM animale WHERE id = %s LIMIT 1", (animal_id,))
        animal = cursor.fetchone()

        if not animal:
            raise HTTPException(status_code=404, detail="Animalul nu exista.")

        if table_exists("administrari_tratamente") and table_exists("tratamente"):
            cursor.execute(
                """
                DELETE FROM administrari_tratamente
                WHERE tratament_id IN (
                    SELECT id FROM tratamente WHERE animal_id = %s
                )
                """,
                (animal_id,)
            )

        optional_child_tables = [
            "tratamente",
            "simptome_animale",
            "jurnal_zilnic",
            "inregistrari_medicale",
            "carnet_medical",
            "vaccinari",
            "deparazitari",
            "vizite_control",
            "tratamente_prescrise"
        ]

        for table_name in optional_child_tables:
            if table_exists(table_name) and column_exists(table_name, "animal_id"):
                cursor.execute(f"DELETE FROM `{table_name}` WHERE animal_id = %s", (animal_id,))

        cursor.execute("DELETE FROM animale WHERE id = %s", (animal_id,))
        conn.commit()

        fotografie_url = animal.get("fotografie_url") if isinstance(animal, dict) else None
        if fotografie_url and "/uploads/animal-" in fotografie_url:
            try:
                image_name = fotografie_url.split("/uploads/", 1)[1].split("?", 1)[0]
                image_path = UPLOADS_DIR / image_name
                if image_path.exists():
                    image_path.unlink()
            except Exception:
                # Stergerea fisierului local nu trebuie sa anuleze stergerea din baza de date.
                pass

        return {"message": "Animalul a fost sters."}
    except HTTPException:
        conn.rollback()
        raise
    except Exception as error:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Nu am putut sterge animalul: {error}")
    finally:
        cursor.close()
        conn.close()


@app.get("/simptome")
def get_simptome():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    cursor.execute("SELECT * FROM simptome")
    data = cursor.fetchall()

    cursor.close()
    conn.close()

    return data


@app.post("/simptome-animale")
def adauga_simptom(data: SimptomAnimal):
    conn = get_connection()
    cursor = conn.cursor()

    query = """
        INSERT INTO simptome_animale 
        (animal_id, simptom_id, severitate, frecventa, observatii, episod_id)
        VALUES (%s, %s, %s, %s, %s, %s)
    """

    values = (
        data.animal_id,
        data.simptom_id,
        data.severitate,
        data.frecventa,
        data.observatii,
        data.episod_id
    )

    cursor.execute(query, values)
    conn.commit()

    cursor.close()
    conn.close()

    return {"message": "Simptom salvat"}


@app.get("/istoric-simptome/{animal_id}")
def get_istoric(animal_id: int):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    query = """
        SELECT 
            sa.id,
            s.nume_afisare AS simptom,
            sa.severitate,
            sa.frecventa,
            sa.observatii,
            sa.data_raportare,
            sa.episod_id
        FROM simptome_animale sa
        JOIN simptome s ON sa.simptom_id = s.id
        WHERE sa.animal_id = %s
        ORDER BY sa.data_raportare DESC
    """

    cursor.execute(query, (animal_id,))
    data = cursor.fetchall()

    cursor.close()
    conn.close()

    return data


@app.get("/analiza-episod/{episod_id}")
def analiza_episod(episod_id: str):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    query = """
        SELECT 
            a.id AS afectiune_id,
            a.nume_afisare AS afectiune,
            a.descriere,
            a.recomandare,
            a.nivel_risc,
            ROUND(
                SUM(
                    sa.pondere *
                    CASE 
                        WHEN s_an.severitate = 'usoara' THEN 1
                        WHEN s_an.severitate = 'medie' THEN 1.5
                        WHEN s_an.severitate = 'ridicata' THEN 2
                        ELSE 1
                    END *
                    CASE
                        WHEN s_an.frecventa = 'rar' THEN 1
                        WHEN s_an.frecventa = 'ocazional' THEN 1.5
                        WHEN s_an.frecventa = 'des' THEN 2
                        ELSE 1
                    END
                ), 2
            ) AS scor_total
        FROM simptome_animale s_an
        JOIN simptome_afectiuni sa ON s_an.simptom_id = sa.simptom_id
        JOIN afectiuni a ON sa.afectiune_id = a.id
        WHERE s_an.episod_id = %s
        GROUP BY a.id, a.nume_afisare, a.descriere, a.recomandare, a.nivel_risc
        ORDER BY scor_total DESC
    """

    cursor.execute(query, (episod_id,))
    data = cursor.fetchall()

    cursor.execute(
        """
        SELECT
            an.id AS animal_id,
            an.rasa_id,
            r.nume AS rasa,
            GROUP_CONCAT(DISTINCT s.nume_afisare SEPARATOR ', ') AS simptome_raportate,
            GROUP_CONCAT(DISTINCT COALESCE(s_an.observatii, '') SEPARATOR ' ') AS observatii_raportate
        FROM simptome_animale s_an
        JOIN animale an ON s_an.animal_id = an.id
        LEFT JOIN rase_animale r ON an.rasa_id = r.id
        JOIN simptome s ON s_an.simptom_id = s.id
        WHERE s_an.episod_id = %s
        GROUP BY an.id, an.rasa_id, r.nume
        LIMIT 1
        """,
        (episod_id,)
    )
    episod_info = cursor.fetchone()
    preventive_matches = []

    if episod_info and episod_info.get("rasa_id"):
        cursor.execute(
            """
            SELECT
                id, rasa_id, simptom_cheie, predispozitie, explicatie,
                tratament_preventiv, recomandare
            FROM recomandari_preventive_rasa
            WHERE rasa_id = %s
            ORDER BY id
            """,
            (episod_info["rasa_id"],)
        )
        preventive_rows = cursor.fetchall()
        reported_text = f"{episod_info.get('simptome_raportate') or ''} {episod_info.get('observatii_raportate') or ''}"

        preventive_matches = [
            {
                **row,
                "rasa": episod_info.get("rasa")
            }
            for row in preventive_rows
            if recommendation_matches_symptoms(row.get("simptom_cheie"), reported_text)
        ]

    if preventive_matches:
        if data:
            data[0]["recomandari_preventive"] = preventive_matches
            for item in data[1:]:
                item["recomandari_preventive"] = []
        else:
            first_match = preventive_matches[0]
            data = [{
                "afectiune_id": f"preventiv-rasa-{first_match['id']}",
                "afectiune": f"Atenție preventivă pentru {first_match.get('rasa') or 'rasa selectată'}",
                "descriere": first_match.get("explicatie"),
                "recomandare": first_match.get("recomandare") or first_match.get("tratament_preventiv"),
                "nivel_risc": "mediu",
                "scor_total": 0,
                "recomandari_preventive": preventive_matches
            }]
    else:
        for item in data:
            item["recomandari_preventive"] = []

    cursor.close()
    conn.close()

    return data


@app.get("/tratamente/{animal_id}")
def get_tratamente(animal_id: int):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    query = """
        SELECT *
        FROM tratamente
        WHERE animal_id = %s
        ORDER BY data_start DESC
    """

    cursor.execute(query, (animal_id,))
    data = cursor.fetchall()

    cursor.close()
    conn.close()

    return data


@app.post("/tratamente")
def create_tratament(tratament: TratamentCreate):
    conn = get_connection()
    cursor = conn.cursor()

    query = """
        INSERT INTO tratamente
        (animal_id, nume, tip, durata_administrare, durata_pauza, data_start, observatii)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
    """

    values = (
        tratament.animal_id,
        tratament.nume,
        tratament.tip,
        tratament.durata_administrare,
        tratament.durata_pauza,
        tratament.data_start,
        tratament.observatii
    )

    cursor.execute(query, values)
    conn.commit()

    new_id = cursor.lastrowid

    cursor.close()
    conn.close()

    return {"message": "Tratament adaugat", "id": new_id}


@app.post("/administrari-tratamente")
def adauga_administrare(data: AdministrareTratament):
    conn = get_connection()
    cursor = conn.cursor()

    data_admin = data.data_administrare or str(date.today())

    query = """
        INSERT INTO administrari_tratamente
        (tratament_id, data_administrare, observatii)
        VALUES (%s, %s, %s)
    """

    values = (
        data.tratament_id,
        data_admin,
        data.observatii
    )

    cursor.execute(query, values)
    conn.commit()

    new_id = cursor.lastrowid

    cursor.close()
    conn.close()

    return {"message": "Administrare salvata", "id": new_id}


@app.get("/administrari-tratamente/{tratament_id}")
def get_administrari_tratament(tratament_id: int):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    query = """
        SELECT *
        FROM administrari_tratamente
        WHERE tratament_id = %s
        ORDER BY data_administrare DESC
    """

    cursor.execute(query, (tratament_id,))
    data = cursor.fetchall()

    cursor.close()
    conn.close()

    return data


@app.get("/istoric-greutate/{animal_id}")
def get_istoric_greutate(animal_id: int):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    cursor.execute(
        """
        SELECT
            id,
            animal_id,
            greutate,
            data_inregistrare,
            observatii,
            creat_la
        FROM istoric_greutate
        WHERE animal_id = %s
        ORDER BY data_inregistrare DESC, id DESC
        """,
        (animal_id,)
    )

    data = cursor.fetchall()

    cursor.close()
    conn.close()

    return data


@app.post("/istoric-greutate")
def adauga_greutate(data: GreutateCreate):
    if data.greutate <= 0:
        raise HTTPException(status_code=400, detail="Greutatea trebuie sa fie mai mare decat 0.")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    cursor.execute("SELECT id FROM animale WHERE id = %s LIMIT 1", (data.animal_id,))
    animal = cursor.fetchone()

    if not animal:
        cursor.close()
        conn.close()
        raise HTTPException(status_code=404, detail="Animalul nu exista.")

    data_inregistrare = data.data_inregistrare or str(date.today())

    cursor.execute(
        """
        INSERT INTO istoric_greutate
        (animal_id, greutate, data_inregistrare, observatii)
        VALUES (%s, %s, %s, %s)
        """,
        (
            data.animal_id,
            data.greutate,
            data_inregistrare,
            data.observatii
        )
    )

    new_id = cursor.lastrowid

    cursor.execute(
        """
        UPDATE animale
        SET greutate = %s
        WHERE id = %s
        """,
        (data.greutate, data.animal_id)
    )

    conn.commit()

    cursor.execute(
        """
        SELECT
            id,
            animal_id,
            greutate,
            data_inregistrare,
            observatii,
            creat_la
        FROM istoric_greutate
        WHERE id = %s
        """,
        (new_id,)
    )

    created_entry = cursor.fetchone()

    cursor.close()
    conn.close()

    return created_entry
