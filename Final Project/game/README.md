# Five Star Taxi

A 3D taxi game that runs in the browser. You take ride requests, drive riders across a small
low-poly city, talk to them on the way, and get rated out of five.

This is the game half of the final project. It is keyboard-controlled for now. The Raspberry Pi
controller (joystick, buttons, encoder, microphone, speaker) plugs in later through two small
seams described under [Connecting the Pi](#connecting-the-pi).

## Run it

```bash
cd "Final Project/game"
python3 serve.py
```

Open http://localhost:5173. No install or build step: Three.js is vendored in `vendor/`.
`serve.py` is a plain static server with browser caching turned off, so a reload always picks
up your edits.

Run the tests (Node 20 or newer):

```bash
node --test
```

## Controls

| Key | Action |
|---|---|
| W A S D or arrows | Drive and steer |
| Space | Handbrake |
| Shift | Nitro |
| E or Enter | Accept a ride request, continue |
| Q | Decline a ride request |
| Hold X | Cancel the ride you accepted |
| 1 2 3 | Reply to your rider |
| M | City map |
| V | Change camera |
| H | Horn |
| R | Put the car back on the road |
| P | Pause |
| 0 | Sound on or off |
| T | Skip three hours ahead |
| Y | Start or stop the rain |
| C | Show the controls |

## How a ride works

1. A request card appears with the rider, pickup, drop-off and fare. Accept or decline within 14 seconds.
2. Follow the green route on the minimap to the pickup and stop in the glowing ring.
3. The rider walks to the rear door on the kerb side, opens it, sits down and shuts it (about three
   seconds; getting out is the same in reverse). Then they start talking. Pick a reply with 1, 2 or 3 before the timer runs out.
4. Follow the pink route to the drop-off and stop in the ring.
5. The rider rates the trip and you are paid.

## Scoring

Each trip gets four ratings from 1 to 5 stars. The overall rating is their weighted average.

| Rating | Weight | What moves it |
|---|---|---|
| Speed | 25% | Trip time against the time the rider expected (4 stars at par, 5 at 80% of it). Riders allow up to 30% longer in rain and at night. |
| Safety | 30% | Crashes by how hard they were, pedestrians hit (3 stars each) or scared (0.6), street furniture knocked over (up to 0.4), curbs hit at speed (0.12 each), seconds spent skidding |
| Road rules | 20% | Red lights run (1.2 stars each), seconds on the wrong side of the road (0.2 per second) or on the pavement (0.25 per second) |
| Conversation | 25% | Average of your reply scores: kind 5, neutral 3, rude 1, no answer 2 |

Money is separate from stars and is charged whether or not a rider is on board:

- Fines: $5 for a red light, $40 for hitting a pedestrian, up to $8 for street furniture (cones are free).
- Repairs: billed at the end of each ride, by how damaged the taxi is.
- A wrecked taxi (health 0) is towed for $25 plus repairs, and any rider on board leaves a 1-star rating.
- A rating of 4 or more earns a tip.

All the numbers are in `src/scoring.js` and `src/props.js`.

## Surfaces and damage

- **Road:** full grip. In rain the tyres hold 55% as well, so fast corners slide.
- **Grass:** about two-thirds of the top speed and half the grip. The wheels throw up dirt.
- **Curbs:** driving up or down one faster than about 7 mph jolts the car, costs 1 to 4 health
  (more the faster you go) and 6% of your speed. At a crawl it is free.
- **Damage:** nothing changes until a fifth of the health is gone. After that the top speed drops
  (to 60% for a near wreck), the tyres hold less, and the steering pulls to one side, so you have
  to steer against it. The taxi shows it: scratches, a dented bonnet, a cracked windscreen, soot,
  a crooked then missing bumper, dead headlights, a sagging corner, smoke, then flames.
- Repairs happen at the end of each ride. The handling numbers are in `damageHandling()` in `src/car.js`.

## What is in the city

- A 6 by 6 block grid with 13 named places to pick up and drop off.
- Traffic lights at every junction, cycling green, yellow, red. Traffic obeys them.
- 22 other cars driving both ways. They brake for you and honk if you come at them in their lane.
- 46 pedestrians who walk the pavements and cross on the walk signal.
- Lamp posts, hydrants, mailboxes, bins, planters and cones that break off when hit fast enough.
- A boulevard with a palm-lined median, brick streets around Pixel Pizza, lane arrows, roadworks cones.
- A day that lasts about 16 minutes, with lit windows, street lamps and headlights at night.
- Rain that comes and goes. It cuts tyre grip to 55%.
- Worn tarmac with cracks, patches and oil stains.
- Paint, glass and water that reflect the sky, which is re-captured every few seconds so the
  reflections follow the time of day and the weather. A sun (and moon) in the sky, ripples on the sea.

## Files

| File | What it does |
|---|---|
| `index.html`, `style.css` | Page, HUD markup and styling |
| `src/main.js` | Builds everything and runs the frame loop |
| `src/layout.js` | City grid maths, named places, GPS routing |
| `src/world.js` | Builds the city: ground, roads, buildings, landmarks, sky |
| `src/roads.js` | Road variety: medians, brick streets, arrows, cones, palms |
| `src/car.js` | The taxi's driving physics and collisions |
| `src/vehicle.js` | The taxi's health and how damage looks |
| `src/models.js` | Car and person models, shared materials and textures |
| `src/traffic.js` | Other cars |
| `src/signals.js` | Traffic light timing, red-light and wrong-side detection |
| `src/signalView.js` | Draws the traffic lights |
| `src/pedestrians.js`, `src/pedestrianView.js` | People on foot: behaviour, and drawing |
| `src/props.js` | Breakable street furniture |
| `src/effects.js` | Particles, skid marks, falling debris |
| `src/weather.js` | Time of day and rain |
| `src/rides.js` | The ride flow, incident tallies, fines |
| `src/chat.js` | Rider conversations (scripted stand-in for voice) |
| `src/scoring.js` | Ratings, fares, fines, repair costs |
| `src/hud.js` | HUD panels, minimap, city map |
| `src/audio.js` | All sound, synthesised in the browser |
| `src/input.js` | Every control goes through here |
| `src/pi.js` | The link to the Pi controller |
| `test/` | Tests for layout, routing, scoring, driving, traffic, signals, pedestrians |

The files with no rendering code (`layout`, `scoring`, `car`, `traffic`, `signals`, `pedestrians`)
are the ones with tests. Everything visual was checked by eye in the browser.

## Connecting the Pi

The Pi reads the controller and streams it to the game over Wi-Fi. The keyboard keeps working
alongside it.

**On the Pi** (`Final Project/controller/bridge.py`, copied to `~/taxi-controller/` on the Pi):

```bash
cd ~/taxi-controller
~/Interactive-Lab-Hub/"Lab 4"/.venv/bin/python bridge.py
```

Leave the joystick untouched while it starts: it reads the resting position then. `--test` prints
what the controls read instead, for checking directions (`FLIP_X`, `FLIP_Y`, `SWAP_XY` at the top
of the file fix them). Standard library only, plus the SparkFun Qwiic packages in the Lab 4 venv.

**In the game:** open http://localhost:5173/?pi=10.56.129.250 (the Pi's address). It is remembered,
so later reloads reconnect by themselves; `?pi=off` forgets it. "Controller connected" shows on
screen, and if the Pi drops out the taxi lets go of the controls and the game keeps reconnecting.

| Part | Address | Does |
|---|---|---|
| Qwiic Joystick | 0x20 | Steer and drive. Click for nitro. |
| Green Qwiic Button | 0x6F | Accept a ride, continue past the rating card. Its LED pulses while a request waits and stays lit on the rating card. |
| Red Qwiic Button | 0x5B | Decline a request. Hold it for a second to cancel a ride. Its LED pulses while a request waits. |

With only one button connected, that button does both jobs: tap to accept, hold to decline or cancel.
Two Qwiic Buttons both ship at 0x6F, so the red one was moved to 0x5B (only it connected, then
`QwiicButton(0x6F).set_I2C_address(0x5B)`; the change is stored on the button).
Restart the bridge after changing the wiring: `bash ~/taxi-controller/restart.sh`.

Browsers only start sound after a click or key on the page, so if the Pi's button starts the
game, the sound comes on at the first click or key press.

**Adding controls.** Every control goes through two functions in `src/input.js`; the bridge's
messages call them via `src/pi.js`.

```js
input.axis('steer', v)        // -1 (full left) to 1 (full right): joystick X
input.axis('drive', v)        // -1 (brake, reverse) to 1 (accelerate): joystick Y
input.button('accept', true)  // then false on release. Names: accept, decline, cancel, nitro,
                              // handbrake, horn, reply1, reply2, reply3, map, camera, time, weather
```

**Voice.** `src/chat.js` is a scripted stand-in: the rider says a line and you pick a reply with
1, 2 or 3. The voice version (microphone, Qwen, Piper) replaces the `Chat` class and keeps its
four methods:

| Method | When the game calls it |
|---|---|
| `start(rider)` | The rider gets in |
| `update(dt)` | Every frame during the trip |
| `react(kind)` | The driver did something: `crash`, `bump`, `redLight`, `wrongSide`, `sidewalk`, `skid`, `pedestrianHit`, `pedestrianScare`, `prop`, `nitro` |
| `stop()` | The trip ends. Returns the list of reply scores, each 1 to 5 |

`react()` is how the game tells the rider what just happened, so Qwen can comment on it.

Browsers only start audio after a click or key press, so the first "Go online" has to come from
one of those, not from a network message.

## Not done yet

- Voice, as above. The rotary encoder, proximity sensor, microphone and speaker are not connected.
- The rotary encoder as a radio dial. There is no radio yet.
- The servo star gauge and the proximity sensor. Neither is connected.
- Roads are a square grid: no curves, hills or bridges.
- Pedestrians do not dodge. They rely on you to stop.
- Tested in one desktop browser on a Mac. Not tested on the Pi's browser or on a phone.
