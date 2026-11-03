"""
Part 2: photos -> captions (you approve or edit) -> story -> song lyrics, all from your phone.

    python photo_story.py                 # then open http://<pi-ip>:5000 on your phone (same wifi)
    python photo_story.py --model qwen3.5:0.8b --port 5000

Upload photos, Qwen captions each one in the background. Edit a caption if it is wrong and
press Approve. When every photo is approved, write the story; edit it if you like, then write the song.
Everything is saved in photo_story/ (photos + state.json), so a restart picks up where you left off.
Delete that folder to start over.
"""
import argparse
import base64
import json
import os
import socket
import threading
import time

import cv2
import numpy as np
import requests
from flask import Flask, redirect, render_template_string, request, send_from_directory

parser = argparse.ArgumentParser()
parser.add_argument("--model", default="qwen3.5:0.8b")
parser.add_argument("--port", type=int, default=5000)
args = parser.parse_args()

DIR = "photo_story"
STATE = os.path.join(DIR, "state.json")
os.makedirs(DIR, exist_ok=True)
state = json.load(open(STATE)) if os.path.exists(STATE) else {"photos": [], "story": "", "song": "", "busy": ""}
for p in state["photos"]:
    if p["status"] == "captioning":      # interrupted by a restart: try again
        p["status"] = "pending"
state["busy"] = ""
ollama = threading.Lock()                # the Pi runs one model call at a time

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 300 * 1024 * 1024


def save():
    with open(STATE + ".tmp", "w") as f:
        json.dump(state, f, indent=2)
    os.replace(STATE + ".tmp", STATE)     # never leave a half-written state.json


def qwen(prompt, max_tokens, image=None):
    req = {"model": args.model, "prompt": prompt, "think": False, "stream": False, "keep_alive": "10m",
           "options": {"temperature": 0.7, "num_predict": max_tokens}}
    if image:
        with open(os.path.join(DIR, image), "rb") as f:
            req["images"] = [base64.b64encode(f.read()).decode()]
    r = requests.post("http://localhost:11434/api/generate", json=req, timeout=900)
    r.raise_for_status()
    return r.json()["response"].strip()


def caption_worker():
    with ollama:
        while True:
            p = next((p for p in state["photos"] if p["status"] == "pending"), None)
            if not p:
                return
            p["status"] = "captioning"
            save()
            t0 = time.time()
            try:
                p["caption"] = qwen("Describe what is happening in this photo in one or two sentences: "
                                    "who is there, what they are doing, and where.", 100, image=p["file"])
                p["status"] = "ready"
                print(f"captioned {p['file']} in {time.time() - t0:.0f} s", flush=True)
            except Exception as e:
                p["caption"], p["status"] = f"(Qwen failed: {e}) Write the caption yourself.", "ready"
            save()


def story_worker():
    with ollama:
        captions = "\n".join(f"Photo {i + 1}: {p['caption']}" for i, p in enumerate(state["photos"]))
        try:
            state["story"] = qwen(f"""Here are descriptions of photos, in order:

{captions}

Write a short story (three short paragraphs) that connects these moments in this order.
Only use people, places and events from the descriptions.""", 500)
        except Exception as e:
            state["story"] = f"(Qwen failed: {e})"
        state["busy"] = ""
        save()


def song_worker():
    with ollama:
        try:
            state["song"] = qwen(f"""Write song lyrics based on this story:

{state['story']}

Format: a title, then Verse 1, Chorus, Verse 2, Chorus, Bridge, Chorus. Short lines that rhyme.""", 500)
        except Exception as e:
            state["song"] = f"(Qwen failed: {e})"
        state["busy"] = ""
        save()


def start(worker):
    threading.Thread(target=worker, daemon=True).start()


def find(name):
    return next(p for p in state["photos"] if p["file"] == name)


@app.get("/")
def home():
    working = state["busy"] or any(p["status"] in ("pending", "captioning") for p in state["photos"])
    all_ok = state["photos"] and all(p["status"] == "approved" for p in state["photos"])
    return render_template_string(PAGE, s=state, working=working, all_ok=all_ok)


@app.post("/upload")
def upload():
    for f in request.files.getlist("photos"):
        img = cv2.imdecode(np.frombuffer(f.read(), np.uint8), cv2.IMREAD_COLOR)
        if img is None:                   # not an image cv2 can read (e.g. HEIC): skip it
            continue
        scale = 1024 / max(img.shape[:2])  # a phone photo is 12 MP; Qwen on a Pi needs far less
        if scale < 1:
            img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        name = f"{time.time_ns()}.jpg"
        cv2.imwrite(os.path.join(DIR, name), img)
        state["photos"].append({"file": name, "caption": "", "status": "pending"})
    save()
    start(caption_worker)
    return redirect("/")


@app.post("/photo/<name>")
def photo(name):
    p, action = find(name), request.form["action"]
    if action == "approve":
        p["caption"], p["status"] = request.form["caption"].strip(), "approved"
    elif action == "redo":
        p["status"] = "pending"
        start(caption_worker)
    elif action == "delete" and p["status"] != "captioning":
        state["photos"].remove(p)
        os.remove(os.path.join(DIR, name))
    save()
    return redirect(f"/#{name}" if action != "delete" else "/")


@app.post("/story")
def story():
    if not state["busy"]:
        state["busy"], state["song"] = "story", ""
        save()
        start(story_worker)
    return redirect("/#story")


@app.post("/song")
def song():
    if not state["busy"]:
        state["story"], state["busy"] = request.form["story"].strip(), "song"
        save()
        start(song_worker)
    return redirect("/#song")


@app.get("/img/<name>")
def img(name):
    return send_from_directory(DIR, name)


PAGE = """<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Photo story</title><style>
body{font-family:system-ui;max-width:640px;margin:auto;padding:12px;background:#111;color:#eee}
.card{background:#222;border-radius:12px;padding:10px;margin:12px 0}
img{width:100%;border-radius:8px}
textarea{width:100%;box-sizing:border-box;font-size:16px;background:#000;color:#eee;border-radius:6px;padding:6px}
button{font-size:16px;padding:10px 14px;margin:4px 4px 0 0;border-radius:8px;border:0}
.ok{background:#2a7}.tag{float:right;font-size:13px;opacity:.8}pre{white-space:pre-wrap;font-family:inherit}
</style></head><body>
<h2>Photo → story → song</h2>
<form class="card" action="/upload" method="post" enctype="multipart/form-data">
  <input type="file" name="photos" accept="image/jpeg,image/png" multiple required>
  <button>Upload</button>
</form>
{% for p in s.photos %}
<form class="card" id="{{p.file}}" action="/photo/{{p.file}}" method="post">
  <b>Photo {{loop.index}}</b><span class="tag">{{p.status}}</span>
  <img src="/img/{{p.file}}">
  {% if p.status in ("pending", "captioning") %}<p>Qwen is looking at this photo…</p>
  {% else %}<textarea name="caption" rows="3">{{p.caption}}</textarea>
  <button class="ok" name="action" value="approve">{{"Save" if p.status == "approved" else "Approve"}}</button>
  <button name="action" value="redo">Redo caption</button>{% endif %}
  {% if p.status != "captioning" %}<button name="action" value="delete">Delete</button>{% endif %}
</form>
{% endfor %}
{% if all_ok %}
<form class="card" id="story" action="/story" method="post">
  <button class="ok" {{"disabled" if s.busy}}>{{"Rewrite" if s.story else "Write"}} the story</button>
</form>
{% endif %}
{% if s.busy == "story" %}<p class="card">Writing the story…</p>{% endif %}
{% if s.story and s.busy != "story" %}
<form class="card" action="/song" method="post">
  <b>Story</b> (edit it if you like)<textarea name="story" rows="14">{{s.story}}</textarea>
  <button class="ok" {{"disabled" if s.busy}}>{{"Rewrite" if s.song else "Write"}} the song</button>
</form>
{% endif %}
{% if s.busy == "song" %}<p class="card">Writing the song…</p>{% endif %}
{% if s.song and s.busy != "song" %}<div class="card" id="song"><b>Song</b><pre>{{s.song}}</pre></div>{% endif %}
{% if working %}<script>
// reload while Qwen works, but never while you are typing in a box
setInterval(() => { if (document.activeElement.tagName !== "TEXTAREA") location.reload() }, 5000)
</script>{% endif %}
</body></html>"""

if __name__ == "__main__":
    start(caption_worker)                 # finish anything left pending from last time
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.connect(("8.8.8.8", 80))            # no packet is sent; this just picks the wifi address
    print(f"open http://{s.getsockname()[0]}:{args.port} on your phone", flush=True)
    app.run(host="0.0.0.0", port=args.port, threaded=True)
