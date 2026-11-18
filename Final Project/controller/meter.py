"""The controller's screen: a taxi meter drawn on the Mini PiTFT (240 x 135).

draw(state, address) returns a Pillow image and needs no hardware, so it can be previewed:
    python meter.py           writes preview-<mode>.png for every screen
"""
from PIL import Image, ImageDraw, ImageFont

W, H = 240, 135
BG = (8, 8, 8)
AMBER = (255, 176, 0)
DIM = (130, 92, 18)
WHITE = (238, 238, 238)
GREEN = (61, 220, 132)
RED = (255, 77, 77)
FONTS = '/usr/share/fonts/truetype/dejavu/'
_cache = {}


def font(size, bold=True, mono=False):
    name = 'DejaVuSans' + ('Mono' if mono else '') + ('-Bold' if bold else '') + '.ttf'
    if (name, size) not in _cache:
        try:
            _cache[name, size] = ImageFont.truetype(FONTS + name, size)
        except OSError:                                  # no DejaVu (e.g. previewing on a Mac)
            _cache[name, size] = ImageFont.load_default(size)
    return _cache[name, size]


def fit(d, text, size, width, **kw):
    """The largest font up to `size` that fits `text` in `width` pixels."""
    while size > 8 and d.textlength(text, font=font(size, **kw)) > width:
        size -= 1
    return font(size, **kw)


def centre(d, y, text, size, fill, **kw):
    f = fit(d, text, size, W - 12, **kw)
    d.text((W / 2, y), text, font=f, fill=fill, anchor='mt')


def money(v):
    return ('-' if v < 0 else '') + f'${abs(v):.2f}'


def clock(seconds):
    s = max(0, int(seconds))
    return f'{s // 60}:{s % 60:02d}'


def header(d, s):
    """Earnings, rating and rides on top, like the game's top-left panel."""
    d.text((6, 4), money(s.get('earned', 0)), font=font(17), fill=AMBER)
    rating = s.get('rating')
    stars = f"★ {rating:.1f}" if rating is not None else '★ –'
    d.text((W / 2 + 6, 5), stars, font=font(15), fill=AMBER, anchor='mt')
    d.text((W - 6, 6), s.get('clock', ''), font=font(13, bold=False), fill=DIM, anchor='rt')
    d.line((0, 26, W, 26), fill=DIM)


def footer(d, left, right=None):
    """Button hints along the bottom: [(colour, label)], drawn as a dot and a word."""
    y = H - 15
    for hint, x in zip([left, right], [8, W / 2 + 8]):
        if not hint:
            continue
        colour, label = hint
        d.ellipse((x, y - 5, x + 10, y + 5), fill=colour)
        d.text((x + 15, y), label, font=font(13), fill=colour, anchor='lm')


def stars_row(d, y, rating):
    """Five stars, filled to the nearest half."""
    f = font(28, bold=False)
    for k in range(5):
        x = W / 2 + (k - 2) * 30
        d.text((x, y), '★', font=f, fill=DIM, anchor='mt')
        filled = max(0, min(1, rating - k))
        if filled >= 0.25:
            star = Image.new('L', (30, 34), 0)
            ImageDraw.Draw(star).text((15, 0), '★', font=f, fill=255, anchor='mt')
            if filled < 0.75:                             # half a star: keep the left half
                star.paste(0, (15, 0, 30, 34))
            d._image.paste(AMBER, (int(x - 15), int(y)), star)


def draw(s, address=''):
    """@param s the state the game sent, or None when no game is connected"""
    img = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(img)

    if not s:
        centre(d, 10, 'FIVE STAR TAXI', 22, AMBER)
        centre(d, 46, 'Open the game at', 14, DIM, bold=False)
        centre(d, 66, 'localhost:5173/?pi=', 16, WHITE)
        centre(d, 88, address or 'no network', 22, AMBER, mono=True)
        centre(d, 118, 'waiting for the game...', 12, DIM, bold=False)
        return img

    mode = s.get('mode')
    if mode == 'menu':
        centre(d, 14, 'FIVE STAR', 34, AMBER)
        centre(d, 54, 'TAXI', 34, AMBER)
        footer(d, (GREEN, 'go online'))
        return img

    header(d, s)
    rider, here, there = s.get('rider', ''), s.get('pickup', ''), s.get('dropoff', '')

    if mode == 'paused':
        centre(d, 56, 'PAUSED', 34, AMBER)
    elif mode == 'idle':
        centre(d, 44, 'FOR HIRE', 38, AMBER)
        centre(d, 96, 'waiting for a ride...', 13, DIM, bold=False)
    elif mode == 'request':
        d.text((8, 32), 'NEW RIDE', font=font(13), fill=DIM)
        d.text((W - 8, 30), money(s.get('fare', 0)), font=font(20), fill=GREEN, anchor='rt')
        d.text((8, 50), rider, font=fit(d, rider, 22, W - 16), fill=WHITE)
        route = f'{here} → {there}'
        d.text((8, 78), route, font=fit(d, route, 15, W - 16, bold=False), fill=AMBER)
        left = s.get('left', 0)                           # share of the time to answer that is left
        d.rectangle((8, 100, W - 8, 104), fill=(40, 40, 40))
        d.rectangle((8, 100, 8 + (W - 16) * left, 104), fill=AMBER)
        footer(d, (GREEN, 'accept'), (RED, 'decline'))
    elif mode == 'toPickup':
        d.text((8, 32), 'PICK UP', font=font(13), fill=DIM)
        d.text((W - 8, 32), clock(s.get('seconds', 0)), font=font(14, mono=True), fill=DIM, anchor='rt')
        d.text((8, 52), rider, font=fit(d, rider, 26, W - 16), fill=WHITE)
        d.text((8, 86), f'at {here}', font=fit(d, f'at {here}', 17, W - 16, bold=False), fill=AMBER)
        footer(d, (RED, 'hold to cancel'))
    elif mode in ('boarding', 'alighting'):
        centre(d, 44, rider, 26, WHITE)
        centre(d, 80, 'is getting in' if mode == 'boarding' else 'is getting out', 16, AMBER, bold=False)
        centre(d, 104, 'hold still', 13, DIM, bold=False)
    elif mode == 'inRide':
        d.text((8, 32), 'HIRED', font=font(13), fill=AMBER)
        dest = f'to {there}'
        d.text((W - 8, 32), dest, font=fit(d, dest, 13, W - 76, bold=False), fill=WHITE, anchor='rt')
        late = s.get('seconds', 0) > s.get('par', 1e9)
        d.text((8, 50), clock(s.get('seconds', 0)), font=font(44, mono=True), fill=RED if late else AMBER)
        d.text((W - 8, 56), money(s.get('fare', 0)), font=font(20), fill=GREEN, anchor='rt')
        d.text((W - 8, 82), f"par {clock(s.get('par', 0))}", font=font(13, bold=False), fill=DIM, anchor='rt')
        comfort = s.get('comfort', 1)
        d.text((8, 104), 'comfort', font=font(11, bold=False), fill=DIM)
        d.rectangle((62, 107, W - 8, 112), fill=(40, 40, 40))
        d.rectangle((62, 107, 62 + (W - 70) * comfort, 112), fill=GREEN if comfort > 0.6 else AMBER if comfort > 0.3 else RED)
    elif mode == 'rating':
        overall = s.get('overall', 0)
        centre(d, 30, f'{rider} rated you {overall:.1f}', 15, WHITE)
        stars_row(d, 52, overall)
        pay = s.get('pay', 0)
        centre(d, 90, ('+' if pay >= 0 else '') + money(pay), 18, GREEN if pay >= 0 else RED)
        footer(d, (GREEN, 'continue'))
    return img


SAMPLES = {
    'offline': None,
    'menu': {'mode': 'menu'},
    'idle': {'mode': 'idle', 'earned': 12.4, 'rating': 4.62, 'rides': 3, 'clock': '9:05 AM'},
    'request': {'mode': 'request', 'earned': 12.4, 'rating': 4.62, 'rides': 3, 'clock': '9:05 AM', 'rider': 'Mr. Okafor',
                'pickup': 'Pixel Pizza', 'dropoff': 'Union Station', 'fare': 9.2, 'left': 0.6},
    'toPickup': {'mode': 'toPickup', 'earned': 12.4, 'rating': 4.62, 'rides': 3, 'clock': '9:07 AM', 'rider': 'Mr. Okafor',
                 'pickup': 'Pixel Pizza', 'seconds': 23},
    'boarding': {'mode': 'boarding', 'earned': 12.4, 'rating': 4.62, 'rides': 3, 'clock': '9:08 AM', 'rider': 'Mr. Okafor'},
    'inRide': {'mode': 'inRide', 'earned': 12.4, 'rating': 4.62, 'rides': 3, 'clock': '9:10 AM', 'rider': 'Mr. Okafor',
               'dropoff': 'Union Station', 'fare': 9.2, 'seconds': 47, 'par': 80, 'comfort': 0.7},
    'rating': {'mode': 'rating', 'earned': 20.6, 'rating': 4.6, 'rides': 4, 'clock': '9:12 AM', 'rider': 'Mr. Okafor',
               'overall': 4.5, 'pay': 8.2},
}

if __name__ == '__main__':
    for name, state in SAMPLES.items():
        draw(state, '10.56.129.250').save(f'preview-{name}.png')
    print('wrote', len(SAMPLES), 'previews')
