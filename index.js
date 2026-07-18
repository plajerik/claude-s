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

// Lista de continente (K-uri) de urmarit, ex: "35,53,54"
// Lasat gol / nesetat = se urmareste toata harta.
const CONTINENTS_RAW = process.env.CONTINENTS || "";
const ALLOWED_CONTINENTS = CONTINENTS_RAW.trim()
  ? new Set(CONTINENTS_RAW.split(",").map((c) => c.trim()))
  : null; // null = fara filtru, toate continentele

// Cooldown: daca am notificat deja pentru o coordonata, nu mai trimitem alta
// notificare pentru acelasi loc timp de X minute, chiar daca satul dispare
// si reapare intre timp (unele sate se "reseteaza" foarte rapid).
const NOTIFY_COOLDOWN_MINUTES = parseInt(process.env.NOTIFY_COOLDOWN_MINUTES || "60", 10);

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

// Structura starii salvate:
// {
//   current: [ "x|y", ... ],           // sate barbare prezente la ultima verificare
//   lastNotified: { "x|y": timestampMs } // ultima data cand am notificat pt acea coordonata
// }
function loadState() {
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      current: new Set(parsed.current || []),
      lastNotified: parsed.lastNotified || {},
    };
  } catch (e) {
    return null; // prima rulare, nu exista fisier inca
  }
}

function saveState(state) {
  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify({
      current: [...state.current],
      lastNotified: state.lastNotified,
    })
  );
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
    // cu ID nou la aceleasi coordonate.
    const barbarianKeys = new Set(barbarians.map((v) => `${v.x}|${v.y}`));

    let state = loadState();

    if (state === null) {
      state = { current: barbarianKeys, lastNotified: {} };
      saveState(state);
      console.log(
        `Prima rulare: am salvat ${state.current.size} sate barbare existente (filtru: min ${MIN_POINTS} puncte${
          ALLOWED_CONTINENTS ? ", continente: " + [...ALLOWED_CONTINENTS].join(",") : ""
        }, cooldown: ${NOTIFY_COOLDOWN_MINUTES} min). Nu trimit notificari acum.`
      );
      return;
    }

    const now = Date.now();
    const cooldownMs = NOTIFY_COOLDOWN_MINUTES * 60 * 1000;

    const newBarbarians = barbarians.filter((v) => {
      const key = `${v.x}|${v.y}`;
      if (state.current.has(key)) return false; // era deja barbar la ultima verificare
      const lastNotifiedAt = state.lastNotified[key];
      if (lastNotifiedAt && now - lastNotifiedAt < cooldownMs) return false; // in cooldown
      return true;
    });

    if (newBarbarians.length > 0) {
      console.log(`Am gasit ${newBarbarians.length} sate barbare noi.`);
      // Salvam ca "notificat" INAINTE de a trimite mesajul, ca sa nu riscam
      // sa trimitem de doua ori daca ceva intrerupe procesul chiar in acel moment.
      for (const v of newBarbarians) {
        state.lastNotified[`${v.x}|${v.y}`] = now;
      }
      state.current = barbarianKeys;
      saveState(state);
      await sendDiscordNotification(newBarbarians);
    } else {
      console.log("Niciun sat barbar nou.");
      state.current = barbarianKeys;
      saveState(state);
    }
  } catch (err) {
    console.error("Eroare la verificare:", err.message);
  }
}

checkForNewBarbarians();
setInterval(checkForNewBarbarians, CHECK_INTERVAL_MINUTES * 60 * 1000);
