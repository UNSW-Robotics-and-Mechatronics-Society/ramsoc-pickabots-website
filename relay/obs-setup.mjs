// One-shot OBS scene-collection scaffold for the Sumobots stream.
// Creates the 12 scenes + all overlay browser sources + MediaMTX media
// sources via obs-websocket. Idempotent: skips anything that already exists.
// Cameras, stream key, and output settings stay manual (physical devices +
// Settings dialog aren't scriptable).
import "dotenv/config";
import OBSWebSocket from "obs-websocket-js";

const BASE = "https://pickabots.ramsocunsw.org";
const obs = new OBSWebSocket();
await obs.connect(process.env.OBS_WS_URL || "ws://127.0.0.1:4455", process.env.OBS_WS_PASSWORD);

const { currentSceneCollectionName } = await obs.call("GetSceneCollectionList");
console.log("scene collection:", currentSceneCollectionName);

// Every scene the control panel can target (SCREEN_SCENES in src/lib/obs.ts).
const SCENES = [
  "Ring 1", "Ring 2", "Ring 3", "Ring 4", "Ring 5", "Ring 6",
  "Sumobots", "Intermission", "Bracket", "Standings", "Leaderboard",
  "Results", "All Rings", "Vote", "Commentary", "Standby", "Blank",
];

const existing = new Set((await obs.call("GetSceneList")).scenes.map(s => s.sceneName));
for (const sceneName of SCENES) {
  if (existing.has(sceneName)) { console.log("scene exists:", sceneName); continue; }
  await obs.call("CreateScene", { sceneName });
  console.log("scene created:", sceneName);
}

const { inputs } = await obs.call("GetInputList");
const inputNames = new Set(inputs.map(i => i.inputName));

async function browserSource(sceneName, inputName, url) {
  if (inputNames.has(inputName)) {
    console.log("input exists:", inputName);
    return;
  }
  await obs.call("CreateInput", {
    sceneName,
    inputName,
    inputKind: "browser_source",
    inputSettings: {
      url, width: 1920, height: 1080, fps: 30,
      shutdown: false,          // keep realtime subscriptions warm across cuts
      restart_when_active: false,
      webpage_control_level: 0, // page gets no control over OBS
    },
  });
  inputNames.add(inputName);
  console.log("browser source:", inputName, "->", url);
}

async function mediaSource(sceneName, inputName, rtmpUrl) {
  if (inputNames.has(inputName)) {
    // Already created for another scene — add a reference, not a duplicate.
    const items = await obs.call("GetSceneItemList", { sceneName });
    if (!items.sceneItems.some(i => i.sourceName === inputName)) {
      await obs.call("CreateSceneItem", { sceneName, sourceName: inputName });
      console.log("added existing", inputName, "to", sceneName);
    }
    return;
  }
  await obs.call("CreateInput", {
    sceneName,
    inputName,
    inputKind: "ffmpeg_source",
    inputSettings: {
      is_local_file: false,
      input: rtmpUrl,
      restart_on_activate: true,
      reconnect_delay_sec: 2,
      hw_decode: true,
      clear_on_media_end: false,
    },
  });
  inputNames.add(inputName);
  console.log("media source:", inputName, "->", rtmpUrl);
}

// Ring scenes: lower-third overlay each (division/ring mapping is a guess of
// rings 1-3 standard, 4-6 open — flip the URLs in OBS if the floor plan
// differs). Remote feeds parked in Ring 4/5/6 as a starting point.
for (let r = 1; r <= 6; r++) {
  const scene = `Ring ${r}`;
  const url = r <= 3
    ? `${BASE}/overlay/now-battling?ring=${r}`
    : `${BASE}/overlay/now-battling?ring=${r - 3}&division=open`;
  await browserSource(scene, `overlay-nowbattling-ring${r}`, url);
}
await mediaSource("Ring 4", "feed-room2", "rtmp://localhost:1935/room2");
await mediaSource("Ring 5", "feed-room3", "rtmp://localhost:1935/room3");
await mediaSource("Ring 6", "feed-phone", "rtmp://localhost:1935/phone");

// Screen scenes
await browserSource("Sumobots", "overlay-title", `${BASE}/overlay/title`);
await browserSource("Intermission", "overlay-upcoming", `${BASE}/overlay/upcoming?count=5`);
await browserSource("Bracket", "overlay-bracket", `${BASE}/overlay/bracket`);
await browserSource("Standings", "overlay-stats", `${BASE}/overlay/stats?top=8`);
await browserSource("Leaderboard", "overlay-leaderboard", `${BASE}/overlay/leaderboard?top=10`);
await browserSource("Results", "overlay-results", `${BASE}/overlay/results`);
await browserSource("Vote", "overlay-vote", `${BASE}/overlay/vote`);

// Commentary: the phone camera full-frame + the KPI side banner on top.
await mediaSource("Commentary", "feed-phone", "rtmp://localhost:1935/phone");
await browserSource("Commentary", "overlay-kpi", `${BASE}/overlay/kpi`);

// All Rings: 2x2 multiview. The info board takes the bottom-right quadrant;
// the three camera quadrants are physical devices, added by hand (see docs).
await browserSource("All Rings", "overlay-board", `${BASE}/overlay/board`);
{
  const items = await obs.call("GetSceneItemList", { sceneName: "All Rings" });
  const board = items.sceneItems.find(i => i.sourceName === "overlay-board");
  if (board) {
    await obs.call("SetSceneItemTransform", {
      sceneName: "All Rings",
      sceneItemId: board.sceneItemId,
      sceneItemTransform: {
        boundsType: "OBS_BOUNDS_SCALE_INNER",
        boundsWidth: 960, boundsHeight: 540,
        positionX: 960, positionY: 540,
      },
    });
    console.log("board overlay placed in All Rings bottom-right quadrant");
  }
}

// Standby gets a text placeholder (swap in a real image later — see guide).
if (!inputNames.has("standby-text")) {
  // GDI+ text only exists on Windows; macOS/Linux OBS uses FreeType 2.
  const settings = {
    text: "SUMOBOTS 2026\n\nBack shortly",
    font: { face: "Arial", size: 96, style: "Bold" },
    align: "center",
  };
  const kinds = process.platform === "win32"
    ? ["text_gdiplus_v3", "text_gdiplus_v2"]
    : ["text_ft2_source_v2", "text_ft2_source"];
  let created = false;
  for (const inputKind of kinds) {
    try {
      await obs.call("CreateInput", { sceneName: "Standby", inputName: "standby-text", inputKind, inputSettings: settings });
      created = true;
      break;
    } catch { /* try the next kind */ }
  }
  console.log(created ? "standby text source created" : "WARN: no text input kind available — add Standby text by hand");
}

// Land on the title card, and clean up OBS's default empty scene if present.
await obs.call("SetCurrentProgramScene", { sceneName: "Sumobots" });
const after = (await obs.call("GetSceneList")).scenes.map(s => s.sceneName);
if (after.includes("Scene")) {
  await obs.call("RemoveScene", { sceneName: "Scene" });
  console.log("removed default empty scene");
}

console.log("DONE — scenes:", (await obs.call("GetSceneList")).scenes.map(s => s.sceneName).join(", "));
await obs.disconnect();
