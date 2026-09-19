"""Daylight Clock: shows how much daylight (and night) is left instead of the time.

Views (button A cycles):
  0  Sun & Moon  - two circles that drain as the day / night runs out
  1  Day ring    - a 24h ring; the yellow day arc is long in summer, short in winter
  2  Year        - daylight length for every day of the year, with today marked
Button B toggles extra detail (sunrise / sunset / minutes gained or lost).
Hold A + B together to turn the backlight off.

Run on the Pi:      python daylight_clock.py
Render on a laptop: python daylight_clock.py --preview out.png --view 1 --at "2026-06-21 15:00"
"""
import argparse
import math
import time
from datetime import datetime, timedelta, date
from zoneinfo import ZoneInfo

from astral import LocationInfo
from astral.sun import sun
from PIL import Image, ImageDraw, ImageFont

# ---- Location (change these to wherever the clock lives) ----
CITY = LocationInfo("Ithaca", "USA", "America/New_York", 42.4440, -76.5019)
TZ = ZoneInfo(CITY.timezone)

W, H = 240, 135
SS = 3  # supersampling factor for smooth shapes

BG = (8, 10, 22)
SUN = (255, 196, 47)
SUN_DIM = (58, 46, 20)
MOON = (170, 190, 255)
MOON_DIM = (28, 32, 58)
NIGHT_ARC = (36, 44, 92)
WHITE = (240, 240, 245)
GREY = (140, 145, 165)

NUM_VIEWS = 3

_FONT_DIRS = [
    "/usr/share/fonts/truetype/dejavu/",  # Raspberry Pi OS
    "/System/Library/Fonts/Supplemental/",  # macOS (preview only)
]


def font(size, bold=False):
    names = ["DejaVuSans-Bold.ttf", "Arial Bold.ttf"] if bold else ["DejaVuSans.ttf", "Arial.ttf"]
    for d in _FONT_DIRS:
        for n in names:
            try:
                return ImageFont.truetype(d + n, size)
            except OSError:
                pass
    return ImageFont.load_default()


# ---------------------------------------------------------------- astronomy

def sun_times(d):
    s = sun(CITY.observer, date=d, tzinfo=TZ)
    return s["sunrise"], s["sunset"]


def body_state(now):
    """(sun_left, moon_left, sun_active, until_handoff).

    Only one body is ever draining: the sun between sunrise and sunset, the moon
    otherwise. The waiting one stays full. `until_handoff` is the time until the
    active body runs out (sunset for the sun, the next sunrise for the moon).
    """
    rise, sset = sun_times(now.date())
    if now < rise:  # pre-dawn: night is ending, day is untouched
        prev_set = sun_times(now.date() - timedelta(days=1))[1]
        return 1.0, (rise - now) / (rise - prev_set), False, rise - now
    if now > sset:  # after dark: day is spent, night is running
        next_rise = sun_times(now.date() + timedelta(days=1))[0]
        return 0.0, (next_rise - now) / (next_rise - sset), False, next_rise - now
    return (sset - now) / (sset - rise), 1.0, True, sset - now


def day_length(d):
    rise, sset = sun_times(d)
    return sset - rise


_year_cache = {}


def year_lengths(year):
    """Daylight hours for each day of the year (computed once, ~365 calls)."""
    if year not in _year_cache:
        start = date(year, 1, 1)
        n = 366 if (date(year + 1, 1, 1) - start).days == 366 else 365
        _year_cache[year] = [day_length(start + timedelta(days=i)).total_seconds() / 3600 for i in range(n)]
    return _year_cache[year]


def hm(td):
    m = int(round(td.total_seconds() / 60))
    return f"{m // 60}h {m % 60:02d}m"


def short(td):
    m = int(round(td.total_seconds() / 60))
    return f"{m // 60}h {m % 60:02d}m" if m >= 60 else f"{m}m"


def delta_str(now):
    secs = int((day_length(now.date()) - day_length(now.date() - timedelta(days=1))).total_seconds())
    sign = "+" if secs >= 0 else "-"
    secs = abs(secs)
    return f"{sign}{secs // 60}m {secs % 60:02d}s"


def clock(dt):
    return dt.strftime("%-I:%M%p").lower()


# ------------------------------------------------------------------ drawing

def mix(color, k):
    """Blend a color toward the background; k=1 keeps it, k=0 hides it."""
    return tuple(int(bg + (c - bg) * k) for c, bg in zip(color, BG))


def _canvas():
    big = Image.new("RGB", (W * SS, H * SS), BG)
    return big, ImageDraw.Draw(big)


def _finish(big):
    return big.resize((W, H), Image.LANCZOS)


def _box(cx, cy, r):
    return [(cx - r) * SS, (cy - r) * SS, (cx + r) * SS, (cy + r) * SS]


def level_circle(big, cx, cy, r, frac, color, dim):
    """A circle that is `frac` full, filled from the bottom like a draining tank."""
    d = ImageDraw.Draw(big)
    d.ellipse(_box(cx, cy, r), fill=dim)
    mask = Image.new("L", big.size, 0)
    md = ImageDraw.Draw(mask)
    md.ellipse(_box(cx, cy, r), fill=255)
    top = cy + r - 2 * r * frac
    md.rectangle([0, 0, big.width, top * SS], fill=0)
    big.paste(color, (0, 0, big.width, big.height), mask)
    d.ellipse(_box(cx, cy, r), outline=color, width=2 * SS)


def centered(t, text, cx, y, fnt, fill):
    l, _, r, _ = t.textbbox((0, 0), text, font=fnt)
    t.text((cx - (r - l) / 2 - l, y), text, font=fnt, fill=fill)


def view_circles(now, detail):
    sun_left, moon_left, sun_active, until = body_state(now)
    big, _ = _canvas()
    cy, r = 40, 36
    # the active body is bright; the one waiting its turn is muted
    sun_c, moon_c = (SUN, mix(MOON, 0.55)) if sun_active else (mix(SUN, 0.55), MOON)
    level_circle(big, 62, cy, r, sun_left, sun_c, SUN_DIM)
    level_circle(big, 178, cy, r, moon_left, moon_c, MOON_DIM)
    img = _finish(big)
    t = ImageDraw.Draw(img)
    rise, sset = sun_times(now.date())
    if detail:
        for cx, c, lines in (
            (62, sun_c, ("rise " + clock(rise), "set " + clock(sset))),
            (178, moon_c, ("day " + hm(sset - rise), "night " + hm(timedelta(hours=24) - (sset - rise)))),
        ):
            centered(t, lines[0], cx, 84, font(13), c)
            centered(t, lines[1], cx, 102, font(13), c)
    else:
        centered(t, f"{round(sun_left * 100)}%", 62, 80, font(22, True), sun_c)
        centered(t, f"{round(moon_left * 100)}%", 178, 80, font(22, True), moon_c)
        if sun_active:
            centered(t, "sets in " + short(until), 62, 110, font(12), SUN)
            centered(t, "up next", 178, 110, font(12), GREY)
        else:
            centered(t, "sun up in " + short(until), 178, 110, font(12), MOON)
            centered(t, "up next", 62, 110, font(12), GREY)
    return img


def _ring_angle(hour):
    # midnight at the bottom, noon at the top, sun travels left -> right over the top
    return 90 + hour * 15


def _hours(dt):
    return dt.hour + dt.minute / 60 + dt.second / 3600


def view_ring(now, detail):
    rise, sset = sun_times(now.date())
    big, d = _canvas()
    cx, cy, r, w = 120, 67, 60, 11
    box = _box(cx, cy, r)
    d.arc(box, 0, 360, fill=NIGHT_ARC, width=w * SS)
    a0, a1 = _ring_angle(_hours(rise)), _ring_angle(_hours(sset))
    now_a = _ring_angle(_hours(now))
    # elapsed daylight dim, remaining daylight bright
    if rise <= now <= sset:
        d.arc(box, a0, now_a, fill=(120, 96, 30), width=w * SS)
        d.arc(box, now_a, a1, fill=SUN, width=w * SS)
    else:
        d.arc(box, a0, a1, fill=(120, 96, 30) if now > sset else SUN, width=w * SS)
    # marker for "now"
    rad = math.radians(now_a)
    mr = r - w / 2
    mx, my = cx + mr * math.cos(rad), cy + mr * math.sin(rad)
    d.ellipse([(mx - 6) * SS, (my - 6) * SS, (mx + 6) * SS, (my + 6) * SS], fill=WHITE, outline=BG, width=2 * SS)
    img = _finish(big)
    t = ImageDraw.Draw(img)
    if detail:
        centered(t, "rise " + clock(rise), cx, cy - 26, font(14), SUN)
        centered(t, "set " + clock(sset), cx, cy - 6, font(14), SUN)
        centered(t, delta_str(now), cx, cy + 16, font(14), WHITE)
    else:
        centered(t, hm(sset - rise), cx, cy - 20, font(22, True), SUN)
        centered(t, "of daylight", cx, cy + 8, font(12), GREY)
    return img


def view_year(now, detail):
    hrs = year_lengths(now.year)
    lo, hi = min(hrs) - 0.5, max(hrs) + 0.5
    x0, x1, y0, y1 = 10, 230, 42, 112
    pts = [(x0 + (x1 - x0) * i / (len(hrs) - 1), y1 - (y1 - y0) * (h - lo) / (hi - lo)) for i, h in enumerate(hrs)]
    big, d = _canvas()
    area = [(x * SS, y * SS) for x, y in pts] + [(x1 * SS, y1 * SS), (x0 * SS, y1 * SS)]
    d.polygon(area, fill=SUN_DIM)
    d.line([(x * SS, y * SS) for x, y in pts], fill=SUN, width=2 * SS)
    i = now.timetuple().tm_yday - 1
    px, py = pts[i]
    d.line([px * SS, y0 * SS, px * SS, y1 * SS], fill=WHITE, width=SS)
    d.ellipse([(px - 4) * SS, (py - 4) * SS, (px + 4) * SS, (py + 4) * SS], fill=WHITE)
    img = _finish(big)
    t = ImageDraw.Draw(img)
    for m in range(12):
        mi = date(now.year, m + 1, 15).timetuple().tm_yday - 1
        t.text((pts[mi][0] - 3, 116), "JFMAMJJASOND"[m], font=font(10), fill=GREY)
    t.text((10, 4), hm(day_length(now.date())), font=font(20, True), fill=SUN)
    rise, sset = sun_times(now.date())
    if detail:
        t.text((10, 27), f"rise {clock(rise)}  set {clock(sset)}", font=font(11), fill=GREY)
        t.text((230, 8), delta_str(now), font=font(14), fill=WHITE, anchor="ra")
    else:
        t.text((230, 8), now.strftime("%b %-d"), font=font(14), fill=GREY, anchor="ra")
        t.text((10, 27), f"{delta_str(now)} vs yesterday", font=font(11), fill=WHITE)
    return img


VIEWS = [view_circles, view_ring, view_year]


def render(now, view=0, detail=False):
    return VIEWS[view % NUM_VIEWS](now, detail)


# ----------------------------------------------------------------- hardware

def run_display():
    import digitalio
    import board
    import adafruit_rgb_display.st7789 as st7789

    disp = st7789.ST7789(
        board.SPI(),
        cs=digitalio.DigitalInOut(board.D5),
        dc=digitalio.DigitalInOut(board.D25),
        rst=None,
        baudrate=64000000,
        width=135,
        height=240,
        x_offset=53,
        y_offset=40,
    )
    backlight = digitalio.DigitalInOut(board.D22)
    backlight.switch_to_output(value=True)

    button_a = digitalio.DigitalInOut(board.D23)
    button_b = digitalio.DigitalInOut(board.D24)
    for b in (button_a, button_b):
        b.switch_to_input(pull=digitalio.Pull.UP)  # pressed reads LOW

    view, detail = 0, False
    dirty, last_draw = True, 0.0
    a_was = b_was = False
    chord = False
    while True:
        a, b = not button_a.value, not button_b.value
        if a and b:
            chord = True
        backlight.value = not chord
        # act on release so an A+B chord never also triggers the single-button actions
        if a_was and not a and not chord:
            view, dirty = (view + 1) % NUM_VIEWS, True
        if b_was and not b and not chord:
            detail, dirty = not detail, True
        if not a and not b:
            chord = False
        a_was, b_was = a, b

        if dirty or time.time() - last_draw > 10:
            disp.image(render(datetime.now(TZ), view, detail), 90)
            dirty, last_draw = False, time.time()
        time.sleep(0.02)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--preview", metavar="PNG", help="render one frame to a PNG instead of using the display")
    p.add_argument("--view", type=int, default=0)
    p.add_argument("--detail", action="store_true")
    p.add_argument("--at", help='local time to render, e.g. "2026-06-21 15:00" (default: now)')
    args = p.parse_args()
    if args.preview:
        at = datetime.strptime(args.at, "%Y-%m-%d %H:%M").replace(tzinfo=TZ) if args.at else datetime.now(TZ)
        render(at, args.view, args.detail).resize((W * 3, H * 3), Image.NEAREST).save(args.preview)
    else:
        run_display()
