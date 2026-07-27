# Room 2 Mac Mini — Camera Feed Setup

Your job on stream day: the Mac Mini captures the two cameras in Room 2
(NEX-7 + Z7) and pushes them as **one continuous video feed** to the main
streaming PC in Room 1. No scene switching, no overlays, nothing fancy —
plug in, start the feed, confirm it's arriving, done.

## One-time setup (do this before event day)

### 1. Tailscale (how the Mini reaches the main PC)

The uni wifi blocks devices from talking to each other directly, so we tunnel
with Tailscale.

1. Install: https://tailscale.com/download/mac
2. Log in with the **event account** (whoever runs the tailnet will send you
   the login or an invite link).
3. In the menu-bar icon, confirm it says **Connected**.
4. Ask for the device to be named `mac-mini-room2` in the Tailscale admin.

### 2. OBS Studio

1. Install: https://obsproject.com
2. Plug both UGREEN capture cards into the Mini (cameras on via HDMI). They
   show up as normal webcams — no drivers.
3. In OBS, in the single default scene, add two **Video Capture Device**
   sources, one per card. Arrange them side by side (or one big + one corner
   picture-in-picture — your call, this layout is exactly what the stream
   sees when Room 2 is on screen).
4. **Settings → Stream**:
   - Service: **Custom**
   - Server: `rtmp://main-obs-pc.<TAILNET>.ts.net:1935/room2`
     *(get the exact `<TAILNET>` name from whoever set up the main PC)*
   - Stream key: leave **blank**
5. **Settings → Output** (Output Mode: Advanced → Streaming tab):
   - Bitrate: **3000 Kbps** (we may tell you a different number after the
     venue bandwidth test — don't go higher than what you're given)
   - Keyframe interval: **2 s**
   - Resolution 1280×720 unless told otherwise
6. **Settings → General**: tick "Automatically start streaming when OBS
   starts" — then on event day the Mini just needs to be powered on.

## Event day checklist

1. Power on cameras first, then the Mini.
2. Tailscale menu-bar icon says **Connected**.
3. OBS is open and the bottom-right status bar shows **green** with a kbps
   number ticking (that means the push is running).
4. Ask the stream desk (or check the control panel if you have admin) that
   the **room2 feed light is green** — that's the real confirmation the feed
   is arriving in Room 1.
5. Leave OBS running all day. That's it.

## If something breaks

| Symptom | Fix |
|---|---|
| OBS says "Failed to connect to server" | Tailscale disconnected, or the main PC / MediaMTX isn't up yet — check the menu-bar icon, then ask Room 1 |
| Feed light green but picture frozen | Camera or capture card asleep — check the camera screen is live, unplug/replug the card's USB |
| Dropped frames climbing in OBS's status bar | Wifi is struggling — drop the bitrate to 2000 Kbps (Settings → Output) and tell the stream desk |
| Camera shuts itself off | Disable auto power-off in the camera menu; NEX-7 especially (and mind its battery — swap at lunch) |

Questions on the day → whoever is at the stream desk in Room 1.
