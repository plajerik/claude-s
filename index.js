// Bot notificari sate barbare - Triburile.ro
// Lumea: rop13.triburile.ro

const WORLD_URL = "https://rop13.triburile.ro/map/village.txt";
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const CHECK_INTERVAL_MINUTES = 1;
const STATE_FILE = "./known_villages.json";

// Puncte minime pentru ca un sat barbar sa fie notificat.
// Satele de antrenament puse de administratori au mereu 0 puncte si se
// regenereaza cu ID nou de fiecare data cand sunt cucerite - de asta le filtram.
const MIN_POINTS = parseInt(process.env.MIN_POINTS || "26", 10);

// Lista de continente (K-uri) de urmarit, ex: "55,64,65"
// Lasat gol / nesetat = se urmareste toata harta.
const CONTINENTS_RAW = process.env.CONTINENTS || "";
const ALLOWED_CONTINENTS = CONTINENTS_RAW.trim()
  ? new Set(CONTINENTS_RAW.split(",").map((c) => c.trim()))
  : null; // null = fara filtru, toate continentele

const fs = require("fs");

if (!WEBHOOK_URL) {
  console.error("EROARE: lipseste variabila de mediu DISCORD_WEBHOOK_URL.");
  process.exit(1);
}

// Calculeaza numarul continentului (K) dintr-o pereche de coordonate.
// Prima cifra vine din y, a doua din x.
// Ex: x=516, y=372 => K35
function getContinent(x, y) {
  const kx = Math.floor(x / 100);
  const ky = Math.floor(y / 100);
  return `${ky}${kx}`;
}

// Incarca lista de sate stiute din fisier local (daca exista)
function loadKnownVillages() {
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf-8");
    return new Set(JSON.parse(raw));
  } catch (e) {
    return null; // prima rulare, nu exista fisier inca
  }
}

function saveKnownVillages(idsSet) {
  fs.writeFileSync(STATE_FILE, JSON.stringify([...idsSet]));
}

// Trimite un mesaj pe webhook-ul Discord
async function sendDiscordNotification(villages) {
  const lines = villages
    .map(
      (v) =>
        `🏚️ **${v.name}** la coordonatele \`${v.x}|${v.y}\` (K${v.continent}) - ${v.points} puncte`
    )
    .join("\n");

  const content =
    villages.length === 1
      ? `A aparut un sat barbar nou!\n${lines}`
      : `Au aparut ${villages.length} sate barbare noi!\n${lines}`;

  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });

  if (!res.ok) {
    console.error("Eroare la trimiterea pe Discord:", res.status, await res.text());
  }
}

// Descarca si parseaza village.txt
// Format oficial: id,nume(urlencoded),x,y,owner_id,puncte,rank
async function fetchVillages() {
  const res = await fetch(WORLD_URL);
  if (!res.ok) {
    throw new Error(`Nu am putut descarca village.txt: ${res.status}`);
  }
  const text = await res.text();

  const villages = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const parts = line.split(",");
    if (parts.length < 7) continue;
    const [id, encodedName, x, y, ownerId, points, rank] = parts;
    const xi = parseInt(x, 10);
    const yi = parseInt(y, 10);
    villages.push({
      id,
      name: decodeURIComponent(encodedName.replace(/\+/g, " ")),
      x: xi,
      y: yi,
      continent: getContinent(xi, yi),
      ownerId,
      points: parseInt(points, 10) || 0,
      rank: parseInt(rank, 10) || 0,
    });
  }
  return villages;
}

// Aplica filtrele: barbar + puncte minime + continent permis
function applyFilters(villages) {
  return villages.filter((v) => {
    if (v.ownerId !== "0") return false;
    if (v.points < MIN_POINTS) return false;
    if (ALLOWED_CONTINENTS && !ALLOWED_CONTINENTS.has(v.continent)) return false;
    return true;
  });
}

async function checkForNewBarbarians() {
  console.log(`[${new Date().toISOString()}] Verific sate barbare...`);
  try {
    const villages = await fetchVillages();
    const barbarians = applyFilters(villages);
    // Cheia e coordonata (x|y), nu id-ul satului - unele sate se regenereaza
    // cu ID nou la aceleasi coordonate, si nu vrem sa le notificam de fiecare data.
    const barbarianKeys = barbarians.map((v) => `${v.x}|${v.y}`);

    let known = loadKnownVillages();

    if (known === null) {
      known = new Set(barbarianKeys);
      saveKnownVillages(known);
      console.log(
        `Prima rulare: am salvat ${known.size} sate barbare existente (filtru: min ${MIN_POINTS} puncte${
          ALLOWED_CONTINENTS ? ", continente: " + [...ALLOWED_CONTINENTS].join(",") : ""
        }). Nu trimit notificari acum.`
      );
      return;
    }

    const newBarbarians = barbarians.filter((v) => !known.has(`${v.x}|${v.y}`));

    if (newBarbarians.length > 0) {
      console.log(`Am gasit ${newBarbarians.length} sate barbare noi.`);
      await sendDiscordNotification(newBarbarians);
    } else {
      console.log("Niciun sat barbar nou.");
    }

    const updatedKnown = new Set(barbarianKeys);
    saveKnownVillages(updatedKnown);
  } catch (err) {
    console.error("Eroare la verificare:", err.message);
  }
}

checkForNewBarbarians();
setInterval(checkForNewBarbarians, CHECK_INTERVAL_MINUTES * 60 * 1000);
