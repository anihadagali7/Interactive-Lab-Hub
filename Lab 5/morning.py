"""
Part I, the smallest possible version: turn night_log.jsonl into a three-sentence
morning report. Use it to check your thirty-second fake nights, then replace it with your
own reveal (a display, a voice, a plot, a servo...).

    python morning.py                          # print the report
    python morning.py --model qwen3:0.6b
    python morning.py --log some_other.jsonl
    python morning.py --story some/state.json  # where photo_story.py saved the story and song

If photo_story.py has written a story and song, they are shown first.
"""
import argparse
import collections
import json
import os

import requests

parser = argparse.ArgumentParser()
parser.add_argument("--log", default="night_log.jsonl")
parser.add_argument("--model", default="qwen3.5:0.8b")
parser.add_argument("--story", default="photo_story/state.json")
args = parser.parse_args()

if os.path.exists(args.story):
    saved = json.load(open(args.story))
    if saved.get("story"):
        print("=== Last night's story ===\n" + saved["story"] + "\n")
    if saved.get("song"):
        print("=== Your song ===\n" + saved["song"] + "\n")
if not os.path.exists(args.log):               # no night was recorded: the story and song are the whole morning
    raise SystemExit

entries = [json.loads(line) for line in open(args.log) if line.strip()]
readings = [e for e in entries if "reading" in e]
seen = [e for e in readings if e["reading"] != "nobody"]
beats = sum(1 for e in entries if e.get("alive"))
per_hour = dict(sorted(collections.Counter(e["t"][11:13] + ":00" for e in seen).items()))
digest = "\n".join(f'{e["t"][11:19]} {e["reading"]}' for e in seen[-200:])   # keep the prompt small

span = f"{entries[0]['t'][11:16]} to {entries[-1]['t'][11:16]}" if entries else "no entries"
print(f"{len(readings)} changes, {len(seen)} with something in view, {beats} heartbeats, {span}")
print("changes per hour:", per_hour)

if not seen:                                   # nothing to summarize: say so, do not ask the model
    print(f"\nQuiet night. The camera watched from {span} and saw nobody.")
    raise SystemExit

prompt = f"""You are a bedside night-watch device. The camera watched from {span}. Below is what it saw,
one line per change (time reading). Changes per hour: {per_hour}.

{digest}

Write a warm three-sentence morning report. Mention the most unusual moment and when it happened.
Only use facts from the log."""

r = requests.post("http://localhost:11434/api/generate", json={
    "model": args.model,
    "prompt": prompt,
    "think": False,
    "stream": False,
    "options": {"num_ctx": 4096, "temperature": 0.3},
}, timeout=600)
r.raise_for_status()
print("\n" + r.json()["response"])
