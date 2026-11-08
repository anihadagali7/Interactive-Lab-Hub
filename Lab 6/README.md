# Distributed Interaction

**NAMES OF COLLABORATORS HERE**
Anirudha Hadagali
Jonathan Tumalle
Achilles Emnace

## Part A: MQTT Messaging

**💡 Brainstorm 5 ideas for messaging between devices**

- A notification alert system when my cat approaches her water bowl
- Walkie talkie system between Pi devices
- "Thinking of you" lamp: tapping a button on one Pi lights up a friend's Pi in your chosen color
- Shared room status: each roommate's Pi publishes busy/free/asleep (based on a button or the light sensor), and every Pi's screen shows everyone's status
- plant watering monitor: soil moisture sensors on several Pis publish readings, and a central Pi plays a sound or sends a reminder when a plant needs water


## Part B: Collaborative Pixel Grid

Each Pi = one pixel, controlled by RGB sensor, displayed in real-time grid.

**Architecture:** `Pi (sensor) → MQTT → Server → Web Browser`

**Setup:**

1. **Sensor**

#### Light/Proximity/Gesture sensor (APDS-9960)
We use this sensor [Adafruit APDS-9960](https://www.adafruit.com/product/3595) for this exmaple to detect light (also RGB)
 
<img src="https://cdn-shop.adafruit.com/970x728/3595-06.jpg" width=200>

Connect it to your pi with Qwiic connector


<img src="imgs/IMG_0270.jpg" height="200" />
We need to use the screen to display the color detection, so we need to stop the running piscreen.service to make your screen available again

```bash
# stop the screen service
sudo systemctl stop piscreen.service
```

if you want to restart the screen service
```bash
# start the screen service
sudo systemctl start piscreen.service
```
 
2. **Server** (one person on laptop):
```bash
cd "Lab 6"
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-server.txt
python app.py
```

2. **View in browser:**
   - Grid: `http://farlab.infosci.cornell.edu:5000`
   - Controller: `http://farlab.infosci.cornell.edu:5000/controller`

3. **Pi publisher** (everyone on their Pi):
```bash
# First time setup - create virtual environment
cd "Lab 6"
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-pi.txt

# Run the publisher
python pixel_grid_publisher.py
```

Hold colored objects near sensor to change your pixel!

![Pixel grid with two devices](imgs/two-devices-grid.png)

**📸 Include: Screenshot of grid + photo of your Pi setup**

![Grid](grid.png)

![Pi set up](pixel-grid-pi-setup.png)

---

## Part C: Make Your Own

### Deliverables

Replace this README with your documentation:

**1. Project Description**

**Look Away**: a 4-player networked game across four Pis ([look-away/](look-away/)). One solo player plays against three teammates. Each round, everyone secretly picks a direction on a Qwiic joystick. Every teammate who matches the solo player's direction is eliminated. The solo player wins by eliminating everyone; the team wins if anyone survives 5 rounds. Empty seats are filled by AI bots, and the solo role rotates on replay.

**2. Architecture Diagram**

```mermaid
flowchart LR
    J[Qwiic joysticks] --> P[4 Pis]
    P <-->|MQTT| B[Course broker]
    B <--> H[Host Pi: rules]
    P --> O[MiniPiTFT + speaker]
```

The host Pi runs the rules (rounds, eliminations, wins). Every Pi reads its own joystick and draws its own screen and sound. Topics live under `IDD/look-away/<room-code>/`:

| Topic | Purpose |
| --- | --- |
| `hello` / `pong` | Join, heartbeat, clock sync |
| `reject` | Join refused (room full, etc.) |
| `choice` | Player's locked direction for the round |
| `state` | Host broadcasts game state every 100 ms |

**3. Build Documentation**

- Hardware: Pi + MiniPiTFT (Lab 2 wiring) + Qwiic joystick + speaker
- Run: `cd look-away && pip install -r requirements.txt && sudo systemctl stop piscreen.service && python play.py`
- The host gets a 4-digit room code; the other players enter it to join.
- Solo test with bots: `python play.py --simulate`

<!-- TODO: add photos of each Pi setup -->

**4. User Testing**

<!-- TODO: fill in after testing with 2+ non-team members -->
- Photos/video:
- Expectations before playing:
- What surprised them:
- What they'd change:

**5. Reflection**

<!-- TODO: what worked, network/timing issues, what we'd improve -->


---

## Code Files

**Server files:**
- `app.py` - Pixel grid server (Flask + WebSocket + MQTT)
- `mqtt_viewer.py` - MQTT message viewer for debugging
- `mqtt_bridge.py` - MQTT → WebSocket bridge
- `requirements-server.txt` - Server dependencies

**Pi files:**
- `pixel_grid_publisher.py` - Example (RGB sensor → MQTT)
- `requirements-pi.txt` - Pi dependencies

**Web interface:**
- `templates/grid.html` - Pixel grid display
- `templates/controller.html` - Color picker
- `templates/mqtt_viewer.html` - Message viewer

---

## Submission Checklist

Before submitting:
- [ ] Delete prep/instructions above
- [ ] Add YOUR project documentation
- [ ] Include photos/videos/diagrams  
- [ ] Document user testing with non-team members
- [ ] Add reflection on learnings
- [ ] List team names at top

**Your README = story of what YOU built!**

---

Resources: [MQTT Guide](https://www.hivemq.com/mqtt-essentials/) | [Paho Python](https://www.eclipse.org/paho/index.php?page=clients/python/docs/index.php) | [Flask-SocketIO](https://flask-socketio.readthedocs.io/)
