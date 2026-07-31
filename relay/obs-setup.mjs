// One-shot OBS scene-collection scaffold for the Sumobots stream.
// Creates the scenes + all overlay browser sources + MediaMTX media
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
// Only one ring scene now — the event runs a single physical ring (see
// MAX_RINGS in src/lib/schedule.ts); Ring 2-6 from the prelim-round,
// multi-ring setup no longer apply.
const SCENES = [
  "Ring 1", "Timeout",
  "Sumobots", "Intermission", "Bracket", "Finals", "Standings", "Leaderboard",
  "Results", "All Rings", "Vote", "Commentary", "Standby", "Blank",
  "Victor Cam", "Arjun Cam", "Nirvan Cam", "Dash Cam", "IT Cam",
];

// Operator phone cams: full-frame scene per phone, fed by the MediaMTX path
// of the owner's lowercase first name (paths declared in mediamtx.yml).
const PHONE_CAMS = ["Victor", "Arjun", "Nirvan", "Dash", "IT"];

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

// Ring 1: the lower-third auto-picks whichever finals match the admin has
// marked active/next (see /overlay/now-battling), so no division param or
// per-ring mapping is needed any more — one ring, one URL.
await browserSource("Ring 1", "overlay-nowbattling-ring1", `${BASE}/overlay/now-battling?ring=1`);

// Timeout: same physical camera as Ring 1 (added by reference, not duplicated)
// with the timeout lower-third banner on top — camera stays visible, same as
// Ring 1's now-battling overlay.
{
  const items = await obs.call("GetSceneItemList", { sceneName: "Timeout" }).catch(() => ({ sceneItems: [] }));
  if (!items.sceneItems.some(i => i.sourceName === "Capture Card Device")) {
    await obs.call("CreateSceneItem", { sceneName: "Timeout", sourceName: "Capture Card Device" }).catch(() => {});
  }
}
await browserSource("Timeout", "overlay-timeout", `${BASE}/overlay/timeout`);

// Screen scenes
await browserSource("Sumobots", "overlay-title", `${BASE}/overlay/title`);
await browserSource("Intermission", "overlay-upcoming", `${BASE}/overlay/upcoming?count=5`);
await browserSource("Bracket", "overlay-bracket", `${BASE}/overlay/bracket`);
await browserSource("Finals", "overlay-finals", `${BASE}/overlay/finals`);
await browserSource("Standings", "overlay-stats", `${BASE}/overlay/stats?top=8`);
await browserSource("Leaderboard", "overlay-leaderboard", `${BASE}/overlay/leaderboard?top=10`);
await browserSource("Results", "overlay-results", `${BASE}/overlay/results`);
await browserSource("Vote", "overlay-vote", `${BASE}/overlay/vote`);

for (const name of PHONE_CAMS) {
  await mediaSource(`${name} Cam`, `feed-${name.toLowerCase()}`, `rtmp://localhost:1935/${name.toLowerCase()}`);
}

// IT Cam gets a small corner badge identifying the feed (see /overlay/cam-label).
await browserSource("IT Cam", "overlay-camlabel-it", `${BASE}/overlay/cam-label?name=${encodeURIComponent("IT (The Goats)")}`);

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
