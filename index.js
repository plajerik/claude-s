// Bot notificari sate barbare - Triburile.ro
// Lumea: rop13.triburile.ro

const WORLD_URL = "https://rop13.triburile.ro/map/village.txt";
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const CHECK_INTERVAL_MINUTES = 5;
const STATE_FILE = "./known_villages.json";

const fs = require("fs");

if (!WEBHOOK_URL) {
  console.error("EROARE: lipseste variabila de mediu DISCORD_WEBHOOK_URL.");
  process.exit(1);
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
        `🏚️ **${v.name}** la coordonatele \`${v.x}|${v.y}\` (${v.points} puncte)`
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
async function fetchVillages() {
  const res = await fetch(WORLD_URL);
  if (!res.ok) {
    throw new Error(`Nu am putut descarca village.txt: ${res.status}`);
  }
  const text = await res.text();

  const villages = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    // format: id,nume(urlencoded),x,y,owner_id,tribe_id,puncte
    const parts = line.split(",");
    if (parts.length < 7) continue;
    const [id, encodedName, x, y, ownerId, tribeId, points] = parts;
    villages.push({
      id,
      name: decodeURIComponent(encodedName.replace(/\+/g, " ")),
      x,
      y,
      ownerId,
      tribeId,
      points: parseInt(points, 10) || 0,
    });
  }
  return villages;
}

async function checkForNewBarbarians() {
  console.log(`[${new Date().toISOString()}] Verific sate barbare...`);
  try {
    const villages = await fetchVillages();
    const barbarians = villages.filter((v) => v.ownerId === "0");

    let known = loadKnownVillages();

    if (known === null) {
      // Prima rulare: doar salvam starea curenta, nu trimitem notificari
      // (altfel am primi o avalansa de mesaje cu toate satele barbare existente)
      known = new Set(barbarians.map((v) => v.id));
      saveKnownVillages(known);
      console.log(
        `Prima rulare: am salvat ${known.size} sate barbare existente. Nu trimit notificari acum.`
      );
      return;
    }

    const newBarbarians = barbarians.filter((v) => !known.has(v.id));

    if (newBarbarians.length > 0) {
      console.log(`Am gasit ${newBarbarians.length} sate barbare noi.`);
      await sendDiscordNotification(newBarbarians);
    } else {
      console.log("Niciun sat barbar nou.");
    }

    const updatedKnown = new Set(barbarians.map((v) => v.id));
    saveKnownVillages(updatedKnown);
  } catch (err) {
    console.error("Eroare la verificare:", err.message);
  }
}

// Ruleaza imediat la pornire, apoi la fiecare CHECK_INTERVAL_MINUTES
checkForNewBarbarians();
setInterval(checkForNewBarbarians, CHECK_INTERVAL_MINUTES * 60 * 1000);
