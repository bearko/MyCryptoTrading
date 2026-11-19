#!/usr/bin/env python3
"""
Promotional pictures for the portal listing, taken from the game itself so they can be retaken whenever the
screens change.

  npm run build && npx vite preview --port 4173 &
  python3 scripts/promo.py <out-dir>

Writes (1200x630): thumb-a (the shop, with the logo over it), thumb-b (a key visual: logo, cast and goods),
and shot-1..3 (PC screens in a 9:16 frame, for the portal's detail sheet).
Needs Python Playwright, Pillow, and Chrome at /usr/bin/google-chrome.
"""
import asyncio, json, pathlib, subprocess, sys
from PIL import Image
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = 'http://localhost:4173/'
KEY = 'mycryptotrading.save.v4'
W, H = 1200, 630
CAST = [1005, 4008, 10004, 5001, 2025]  # the landlord, the keeper, the mentor, a grand customer, the exchanger
COPY = '値切って、目利きして、店を買い取れ。'

LOGO = """<h1 class="logo" style="position:static;animation:none">
  <span class="logo-top" style="animation:none">MY CRYPTO</span>
  <span class="logo-main">TRADING</span>
  <span class="logo-sub" style="animation:none">マイクリプトトレーディング</span></h1>"""


def staged(hero):
    """A busy shop well into the game (scripts/promo-save.ts builds it with the game's own rules)."""
    js = subprocess.run(['npx', '--yes', 'esbuild', 'scripts/promo-save.ts', '--bundle', '--platform=node', '--format=esm',
                         '--loader:.json=json', '--log-level=error'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    return subprocess.run(['node', '--input-type=module', '-', str(hero)], cwd=ROOT, input=js, capture_output=True, text=True, check=True).stdout


async def shop(pg, save):
    await pg.goto(URL)
    await pg.evaluate('([k, s]) => localStorage.setItem(k, s)', [KEY, save])
    await pg.reload()
    await pg.wait_for_timeout(1500)
    await pg.locator('[data-act=resume]').click(force=True)
    await pg.wait_for_timeout(6000)


async def main(out):
    out.mkdir(parents=True, exist_ok=True)
    cat = json.loads((ROOT / 'src/generated/catalog.json').read_text())
    heroes = {h['id']: h['img'] for h in cat['heroes']}
    save = staged(5001)
    goods = [next(i['img'] for i in cat['items'] if i['id'] == x['itemId']) for x in json.loads(save)['stock'][:9]]
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        c = await b.new_context(viewport={'width': W, 'height': H}, device_scale_factor=2)
        pg = await c.new_page()

        # A: the shop itself, the logo over the left wall
        await shop(pg, save)
        await pg.evaluate("""([logo, copy]) => {
          const d = document.createElement('div');
          d.style.cssText = 'position:fixed;inset:0;z-index:99999;pointer-events:none;background:linear-gradient(100deg,rgba(15,13,22,.96) 0,rgba(15,13,22,.9) 24%,rgba(15,13,22,0) 46%)';
          d.innerHTML = `<div style="position:absolute;left:14px;top:150px;width:400px;transform:scale(.86);transform-origin:0 0">${logo}</div>
            <p style="position:absolute;left:34px;top:430px;margin:0;padding:6px 14px;background:var(--gum);color:var(--ink);font:400 20px var(--f-display);transform:rotate(-5deg)">${copy}</p>`;
          document.body.appendChild(d);
        }""", [LOGO, COPY])
        await pg.wait_for_timeout(400)
        await pg.screenshot(path=str(out / 'thumb-a.png'))

        # B: a key visual on the title's backdrop: logo, the cast in a row, goods along the band
        await pg.evaluate('k => localStorage.removeItem(k)', KEY)
        await pg.goto(URL)
        await pg.wait_for_timeout(2500)
        await pg.evaluate("""([cast, goods, copy]) => {
          for (const q of ['.title-acts', '.credit', '.parade']) document.querySelector(q)?.remove();
          const t = document.querySelector('#title');
          const outline = 'drop-shadow(3px 0 0 var(--ink)) drop-shadow(-3px 0 0 var(--ink)) drop-shadow(0 -3px 0 var(--ink)) drop-shadow(0 3px 0 var(--ink))';
          const row = cast.map((src, i) => `<img src="${src}" style="width:${i === 3 ? 228 : 168}px;margin:0 -26px;image-rendering:pixelated;filter:${outline};z-index:${i === 3 ? 3 : 1};position:relative" />`).join('');
          const tiles = goods.map((src, i) => `<span style="display:grid;place-items:center;width:74px;height:74px;background:var(--paper);border:3px solid var(--ink);box-shadow:4px 4px 0 var(--ink);transform:rotate(${(i % 3 - 1) * 5}deg)"><img src="${src}" style="width:60px;height:60px;image-rendering:pixelated" /></span>`).join('');
          t.insertAdjacentHTML('beforeend', `<div style="position:absolute;left:0;right:0;bottom:6px;display:flex;justify-content:flex-end;align-items:flex-end;padding-right:44px">${row}</div>
            <div style="position:absolute;right:36px;top:34px;width:270px;display:flex;flex-wrap:wrap;gap:14px;justify-content:flex-end">${tiles}</div>
            <p style="position:absolute;left:44px;bottom:52px;margin:0;padding:8px 18px;background:var(--ink);color:var(--paper);font:400 26px var(--f-display);transform:rotate(-5deg)">${copy}</p>`);
        }""", [[heroes[h] for h in CAST], goods, COPY])
        await pg.wait_for_timeout(1200)
        await pg.screenshot(path=str(out / 'thumb-b.png'))
        # the app icon: the coin on the shop's ink, a band of the logo's yellow behind it
        ic = await b.new_context(viewport={'width': 512, 'height': 512}, device_scale_factor=1)
        ig = await ic.new_page()
        await ig.goto(URL)
        await ig.wait_for_timeout(1500)
        for name, share in [('icon', 0.74), ('maskable', 0.54)]:
            await ig.evaluate("""([src, share]) => {
              document.body.innerHTML = `<div style="position:fixed;inset:0;display:grid;place-items:center;overflow:hidden;background:var(--ink)">
                <i style="position:absolute;inset:0;background-image:radial-gradient(var(--hot) 22%, transparent 24%);background-size:22px 22px;opacity:.28"></i>
                <i style="position:absolute;left:-20%;right:-20%;top:38%;height:24%;background:var(--hot);transform:rotate(-8deg);border-block:8px solid #000"></i>
                <img src="${src}" style="position:relative;width:${share * 100}%;image-rendering:pixelated;filter:drop-shadow(10px 10px 0 #000)" /></div>`;
            }""", [cat['icons']['gum'], share])
            await ig.wait_for_timeout(500)
            await ig.screenshot(path=str(out / f'{name}-512.png'))
        await b.close()
    icon = Image.open(out / 'icon-512.png').convert('RGB')
    icon.resize((192, 192), Image.LANCZOS).save(out / 'icon-192.png')
    icon.resize((180, 180), Image.LANCZOS).save(out / 'apple-touch-icon.png')
    for name in ['thumb-a', 'thumb-b']:
        im = Image.open(out / f'{name}.png').convert('RGB').resize((W, H), Image.LANCZOS)
        im.save(out / f'{name}.webp', quality=86)
        im.save(out / f'{name}.jpg', quality=88)
        (out / f'{name}.png').unlink()
        print(name, (out / f'{name}.webp').stat().st_size // 1024, 'KB')


if __name__ == '__main__':
    asyncio.run(main(pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'promo')))
