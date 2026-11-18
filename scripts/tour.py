"""
The guided first days, played through and filmed scene by scene (for reviewing the flow away from a desk).

  npm run build && npx vite preview --port 4173 &
  python3 scripts/tour.py [out-dir] [scene-id ...]

Each scene starts from a save prepared for that moment (so a scene is short and can be filmed again on its own),
then plays it with real clicks and keys at 1280x800. What is being done is written at the foot of the picture.
Out come sceneNN-<id>.mp4, a still of each, tour.json (titles, what the scene is meant to show, the captions),
and index.html: the page they are read on.
Needs: Python Playwright with Chrome, and ffmpeg.
"""
import asyncio, json, os, subprocess, sys, time
from playwright.async_api import async_playwright

URL = 'http://localhost:4173/'
KEY = 'mycryptotrading.save.v4'
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/tour'
ONLY = sys.argv[2:]
CAT = json.load(open(os.path.join(os.path.dirname(__file__), '..', 'src', 'generated', 'catalog.json')))
ITEMS = {i['id']: i for i in CAT['items']}
ALL = ['sleep', 'mchc', 'shop', 'case', 'pot', 'loupe', 'hot', 'rent', 'phone', 'houses', 'quest']

OVERLAY = """
(() => {
  const cap = document.createElement('div'); cap.id = 'tour-cap';
  cap.style.cssText = 'position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:99999;max-width:86%;padding:10px 22px;background:rgba(0,0,0,.86);color:#fff;font:700 26px/1.45 sans-serif;border:3px solid #ffd23f;border-radius:10px;text-align:center;pointer-events:none;display:none';
  const dot = document.createElement('div');
  dot.style.cssText = 'position:fixed;z-index:99999;width:26px;height:26px;margin:-13px 0 0 -13px;border:4px solid #ffd23f;border-radius:50%;background:rgba(255,210,63,.35);pointer-events:none;left:-50px;top:-50px';
  const add = () => { document.body.appendChild(cap); document.body.appendChild(dot); };
  document.body ? add() : addEventListener('DOMContentLoaded', add);
  addEventListener('mousemove', (e) => { dot.style.left = e.clientX + 'px'; dot.style.top = e.clientY + 'px'; }, true);
  window.__cap = (t) => { cap.textContent = t; cap.style.display = t ? 'block' : 'none'; };
})();
"""


class Play:
    def __init__(self, pg, t0):
        self.pg, self.t0, self.caps, self.cut, self.still = pg, t0, [], 0.0, None

    def now(self):
        return time.time() - self.t0

    async def say(self, text, hold=None):
        self.caps.append(text)
        await self.pg.evaluate('t => window.__cap(t)', text)
        await self.pg.wait_for_timeout(int((hold if hold is not None else 1.3 + len(text) * 0.075) * 1000))

    async def click(self, sel, wait=0.7, **kw):
        loc = self.pg.locator(sel).first
        box = await loc.bounding_box()
        if box:
            await self.pg.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2, steps=8)
            await self.pg.wait_for_timeout(250)
        await loc.click(force=True, **kw)
        await self.pg.wait_for_timeout(int(wait * 1000))

    async def has(self, sel):
        return await self.pg.locator(sel).count() > 0

    async def key(self, k, wait=0.7):
        await self.pg.keyboard.press(k)
        await self.pg.wait_for_timeout(int(wait * 1000))

    async def until(self, sel, tries=24):
        """Sees callers off with the bell until something shows; the wait before it is cut from the film."""
        for _ in range(tries):
            await self.key('Space', 0.8)
            if await self.has(sel):
                self.cut = max(0.0, self.now() - 2.2)
                return True
            if await self.pg.evaluate("document.querySelector('#app')?.dataset.phase") != 'open':
                break
            await self.key('b', 2.5)
        return await self.has(sel)

    async def shot(self):
        self.still = await self.pg.screenshot(type='jpeg', quality=72)

    async def memo(self, line):
        # (the note is left on the counter: it is clicked, read, and filed in the binder)
        await self.pg.wait_for_timeout(900)
        if await self.has('#cameo'):
            # (while the shop is open he comes in and says it himself, then leaves the note)
            if await self.has('.cameo:not(.as-guest)'):
                await self.say('営業中は、福沢諭吉が店に来て、自分の口で話します')
            for _ in range(6):
                if not await self.has('#cameo'):
                    break
                await self.pg.wait_for_timeout(1700)
                await self.click('#cameo', 0.5)
            await self.pg.wait_for_timeout(700)
        await self.say(line)
        await self.click('#memo-note', 1.0)
        await self.shot()
        await self.pg.wait_for_timeout(1800)
        await self.click('[data-act=memo-ok]', 1.4)

    async def last_good(self):
        return await self.pg.evaluate("(() => { const a = [...document.querySelectorAll('#grid-shelf .inv-item:not(.special):not(.crate)')]; return a.length ? a[a.length - 1].id : '' })()")


def taught(*upto):
    return list(upto)


def base(st, day, phase, known, gum=600, mchc=20):
    st.update({'day': day, 'phase': phase, 'taught': known, 'gum': gum, 'mchc': mchc, 'wentOut': False, 'taughtAt': ''})
    if 'pot' in known:
        st['potGiven'] = False  # (the game hands the pot over on entering)


# ---------------------------------------------------------------- the scenes

async def s_intro(p):
    await p.say('新しいゲームを始めると、黒い画面に 2 行だけ出ます')
    await p.click('#intro', 1.6)
    await p.click('#intro', 1.2)
    await p.say('ここで福沢諭吉が登場。世界と、家賃のことを 3 言で')
    await p.shot()
    await p.click('#intro', 2.6)
    await p.click('#intro', 2.6)
    await p.click('#intro', 3.8)
    await p.say('朝の紙面は飛ばして、そのまま 1 日目が開店します')
    await p.key('Space', 1.0)
    await p.say('最初の客は、安い品を 1 つ売りに来ます。まだ壺もショーケースも電話もありません')
    if await p.has('[data-act=take-all]'):
        await p.click('[data-act=take-all]', 0.9)
    await p.say('品を手前に移して、買い取ります')
    await p.click('#win .btn.primary', 2.2)
    await p.key('b', 3.0)
    await p.key('Space', 1.0)
    await p.say('2 人目は、いま買った品を欲しがる客です')
    uid = await p.last_good()
    if uid:
        await p.click(f'#{uid} .inv-cell', 0.9, modifiers=['Alt'])
    await p.say('棚の品をカウンターに出して、売ります')
    if await p.has('[data-act=sell]'):
        await p.click('[data-act=sell]', 2.6)
    await p.say('買って、売る。ここまで説明の文は 5 行だけです')


async def s_sleep(p):
    await p.key('Space', 1.2)
    await p.say('1 日目の最後の客として、福沢諭吉が来ます')
    await p.memo('話しおえると、カウンターにメモを置いていきます')
    await p.say('読んだメモは、カウンターの右のバインダーにとじられます')
    await p.click('#binder', 1.2)
    await p.say('バインダーから、いつでも見返せます')
    await p.click('[data-act=modal-close]', 0.8)
    await p.key('b', 4.5)
    await p.say('見送ると閉店。寝床が光っています')
    await p.say('眠ると明かりが落ちて、ぱっと明るくなって次の日へ', hold=0.6)
    await p.click('#bed', 4.2)


async def s_mchc(p):
    await p.click('[data-act=open]', 2.8)
    if not await p.until('#cameo, #memo-note'):
        return await p.say('（この回は、サトシ・ナカモトまで進めませんでした）')
    await p.memo('2 日目は火曜。その日の客のあとに、サトシ・ナカモトが来ます')
    await p.say('GUM を MCHC に替えます。夜のショップは MCHC しか使えません')
    await p.click('[data-act=dex-add][data-arg="100"]', 0.6)
    await p.click('[data-act=dex-go]', 1.6)
    await p.say('左の壁の小さな板に、MCHC の残高が出ています')


async def s_shop(p):
    await p.key('Space', 1.2)
    await p.say('2 日目の最後に、福沢諭吉が仕入れの話をしに来ます')
    await p.memo('話しおえると、仕入れのメモを置いていきます')
    await p.key('b', 4.5)
    await p.say('ドアが光って、矢印が出ています')
    await p.click('#bed', 1.2)
    await p.say('先にショップへ行くまで、まだ眠れません')
    await p.click('#door', 1.0)
    await p.say('行き先は、まだ「ショップ」だけ。ダンジョンは後で教わります')
    await p.click('[data-act=go-shop]', 3.2)
    await p.say('夜のショップ。品は床に実寸で並び、値段は MCHC です')
    await p.shot()
    for _ in range(2):
        if await p.has('.sgood:not(.sold):not(.poor)'):
            await p.click('.sgood:not(.sold):not(.poor)', 1.4)
    await p.say('買った品は、右下のウォレット（4×3 マス）に入るぶんだけ持ち帰れます')


async def s_case(p):
    await p.click('[data-act=open]', 2.8)
    if not await p.until('#cameo, #memo-note'):
        return await p.say('（この回は、手ぶらで帰る買い客が来ませんでした）')
    await p.memo('3 日目。欲しい品がなくて、買い客が手ぶらで帰った直後です')
    await p.say('左の壁に、ショーケースと予測客のモニターが取りつけられました')
    await p.shot()


async def s_pot(p):
    await p.key('Space', 1.2)
    await p.say('似た品が売れ残った日は、最後に福沢諭吉が壺を持ってきます')
    await p.memo('話しおえると、メモを置いていきます')
    await p.key('b', 4.5)
    await p.say('棚に「合成の壺」が置かれました。クリックで開きます')
    if await p.has('#grid-shelf .inv-item.special:not(.crate)'):
        loc = p.pg.locator('#grid-shelf .inv-item.special')
        n = await loc.count()
        for i in range(n):
            # (the wallet is special too: the pot is the 3x3 one)
            box = await loc.nth(i).bounding_box()
            if box and box['width'] > 70:
                await p.pg.mouse.move(box['x'] + 20, box['y'] + 20, steps=8)
                await loc.nth(i).locator('.inv-cell').first.click(force=True)
                break
        await p.pg.wait_for_timeout(1400)
    await p.say('素材を入れると、上に候補が出ます')
    for _ in range(2):
        if await p.has('.pgood'):
            await p.click('.pgood', 0.8)
    await p.shot()
    await p.say('作りたい候補を選んで、配合します')


async def s_fake(p):
    await p.click('[data-act=open]', 3.0)
    await p.key('Space', 1.0)
    await p.say('5 日目の最初の客。相場の半値という、うますぎる話を持ってきます')
    await p.shot()
    if await p.has('[data-act=take-all]'):
        await p.click('[data-act=take-all]', 0.9)
    await p.say('ここでは、あえて買ってみます（ルーペは、まだ店にありません）')
    await p.click('#win .btn.primary', 2.2)
    await p.key('b', 3.0)
    await p.key('Space', 1.0)
    await p.say('次の客は、ちょうどその品を欲しがります')
    uid = await p.last_good()
    if uid:
        await p.click(f'#{uid} .inv-cell', 0.9, modifiers=['Alt'])
    if await p.has('[data-act=sell]'):
        await p.click('[data-act=sell]', 2.8)
    if await p.has('#cameo, #memo-note'):
        await p.memo('売ったとたんに見抜かれました。評判が 1 下がり、そこでメモが届きます')
        await p.say('一度だけの、小さな失敗。カウンターにルーペが置かれました')
    else:
        await p.say('（この回は、見抜かれるところまで進めませんでした）')


async def s_pass(p):
    await p.click('[data-act=open]', 3.0)
    await p.key('Space', 1.0)
    await p.say('同じ 5 日目。こんどは買わずに、ベルで見送ります')
    await p.key('b', 2.6)
    if await p.has('#cameo, #memo-note'):
        await p.memo('見送った場合は、その判断を認める言葉になります')
    await p.say('どちらの道でも、ルーペはここで手に入ります')


async def s_hot(p):
    await p.key('Space', 1.2)
    if not await p.has('#cameo, #memo-note'):
        return await p.say('（この回は、訳ありの品のメモが出ませんでした）')
    await p.memo('6 日目から。訳ありの品が、はじめてカウンターに置かれた時です')
    await p.say('安いけれど、見回りに見つかると棚から没収されます')


async def s_rent(p):
    await p.click('[data-act=open]', 2.8)
    if not await p.until('#cameo, #memo-note'):
        return await p.say('（この回は、引取の商人まで進めませんでした）')
    await p.memo('7 日目は家賃の日。客のあとに、まず引取の商人が来ます')
    await p.say('手持ちが足りなければ、ここで品を買い取ってもらえます')
    await p.key('b', 3.2)
    await p.key('Space', 1.2)
    await p.say('続いて大家の伊能忠敬。払うまで帰りません')
    await p.shot()
    if await p.has('[data-act=rent-pay]'):
        await p.click('[data-act=rent-pay]', 3.0)
    await p.say('家賃を払って、次の週へ')


async def s_phone(p):
    await p.memo('8 日目の朝。電話のメモが届きます')
    await p.click('[data-act=open]', 3.0)
    await p.say('カウンターの上に電話が置かれました。商人ギルドに頼みごとができます')
    if await p.has('#phone'):
        await p.click('#phone', 1.4)
        await p.shot()
        await p.say('取り寄せ、取り扱いの拡張、DEX などが並びます')


async def s_houses(p):
    await p.memo('どこかの勢力の評価が、はじめて 1 段動いたあとに届きます')
    await p.click('[data-act=open]', 3.0)
    await p.say('右の壁の「評判」から、勢力ごとの評価が見られます')
    if await p.has('#hud-rep'):
        await p.click('#hud-rep', 1.6)
        await p.shot()
        await p.say('5 本の縦のはしご。ここで初めて 5 つの勢力を見せます')


async def s_quest(p):
    await p.key('Space', 1.2)
    await p.say('MCHC が足りない日の最後に、もう 1 つの行き先を教わります')
    await p.memo('話しおえると、メモを置いていきます')
    await p.key('b', 4.5)
    await p.click('#door', 1.2)
    await p.shot()
    await p.say('ドアの行き先に「クエスト」が増えました')


def dup(st):
    """Two like common goods left on the shelf."""
    # (two goods of one shape, whatever shape the new game's stock has two of, made into the same cheap good)
    goods = [x for x in st['stock'] if not x.get('bag') and x['itemId'] in ITEMS and not ITEMS[x['itemId']].get('effect')]
    for shape in sorted({ITEMS[x['itemId']]['shape'] for x in goods}, key=lambda s: s != '2x2'):
        two = [x for x in goods if ITEMS[x['itemId']]['shape'] == shape][:2]
        cheap = next((i for i in CAT['items'] if i['rarity'] == 1 and i['shape'] == shape and not i.get('effect') and not i.get('wallet') and not i.get('limited')), None)
        if len(two) == 2 and cheap:
            for x in two:
                x['itemId'] = cheap['id']
            return


def bare(st):
    st['stock'] = [x for x in st['stock'] if x.get('bag')]


def hot_caller(st):
    """The caller at the counter has a hot good to sell (it comes by chance in play; here it is laid on)."""
    v = st['queue'][st['cursor']]
    cheap = next(i for i in CAT['items'] if i['rarity'] == 2 and i['shape'] == '2x2')
    v.update({'kind': 'sell', 'done': False, 'offers': [{'itemId': cheap['id'], 'cond': 1, 'ask': 9, 'hot': True}], 'line': 'わけは聞かないでくれ。安くしておくよ。'})
    v.pop('special', None)


def teacher_last(st):
    """The day's line is over and he has come as its last caller (the scene begins as he stands at the counter)."""
    v = st['queue'][st['cursor']]
    gone = dict(v, special='satoshi', done=True)
    here = dict(v, special='teacher', heroId=10004, kind='buy', offers=[], done=False, faction=None, budget=0, want={'type': 'rarity', 'min': 9}, line='店じまいの前に、ひとつ話しておこう。')
    st.update({'queue': [gone, here], 'cursor': 1, 'visitorsToday': 0, 'callers': 2})


MIDDAY = ['hot', 'sleep', 'shop', 'pot', 'quest']

SCENES = [
    ('intro', '導入と、最初の売買', '読ませるのは 5 行だけ。30 秒以内に自分の手で 1 回売り買いできるか。', lambda st: None, s_intro),
    ('sleep', '一日の終わり（1 日目の最後の客）', '福沢諭吉が最後の客として来て話し、メモを置いていく（読むとバインダーへ）。寝床に目が行くか。眠りと目覚めの演出。', lambda st: (base(st, 1, 'open', []), teacher_last(st)), s_sleep),
    ('mchc', '両替（2 日目・火曜）', 'サトシ・ナカモトの来店と、MCHC の初登場。', lambda st: base(st, 2, 'morning', ALL[:1]), s_mchc),
    ('shop', '仕入れ（2 日目の最後の客 → 夜）', 'ドアに目が行くか（行くまで眠れない）。夜のショップと、ウォレットの小ささ。', lambda st: (base(st, 2, 'open', ALL[:2], mchc=70), teacher_last(st)), s_shop),
    ('case', '飾る（3 日目）', '買い客が手ぶらで帰った直後に、ショーケースが届く。', lambda st: (base(st, 3, 'morning', ALL[:3]), bare(st)), s_case),
    ('pot', '合成（3 日目の最後の客）', '似た品が売れ残った時に、壺が届く。', lambda st: (base(st, 3, 'open', ALL[:4]), dup(st), teacher_last(st)), s_pot),
    ('fake', '見抜く：買ってしまった場合（5 日目）', '一度だけの失敗。損の小ささと、納得感。', lambda st: base(st, 5, 'morning', ALL[:5], gum=900), s_fake),
    ('pass', '見抜く：見送った場合（5 日目）', '買わなかった人にも、同じ所でルーペが届く。', lambda st: base(st, 5, 'morning', ALL[:5]), s_pass),
    ('hot', '危ない品（6 日目から）', '訳ありの品と、見回り。', lambda st: (base(st, 6, 'open', ALL[:6]), hot_caller(st)), s_hot),
    ('rent', '家賃の日（7 日目）', '引取の商人 → 伊能忠敬。当面の目標が伝わるか。', lambda st: base(st, 7, 'morning', ALL[:7], gum=2400), s_rent),
    ('phone', '人脈（8 日目の朝）', '電話が届く。', lambda st: base(st, 8, 'morning', ALL[:8], gum=1200), s_phone),
    ('houses', '5 つの勢力', '評価が動いたあとに、世界のようすを伝える。', lambda st: (base(st, 8, 'morning', ALL[:9]), st['favor'].update({'buyu': 45})), s_houses),
    ('quest', 'ダンジョン', 'MCHC が足りない夜に、もう 1 つの行き先。', lambda st: (base(st, 8, 'open', ALL[:10], mchc=2), teacher_last(st)), s_quest),
]


async def main():
    os.makedirs(OUT, exist_ok=True)
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        # a new game's save, to prepare each scene from
        pg = await browser.new_page(viewport={'width': 1280, 'height': 800})
        await pg.goto(URL)
        await pg.wait_for_timeout(800)
        await pg.click('[data-act=new]', force=True)
        await pg.wait_for_timeout(1500)
        fresh = await pg.evaluate(f"localStorage.getItem('{KEY}')")
        # (and the same game with its shop open and its first caller at the counter, for scenes that begin mid-day)
        await pg.click('.intro-skip', force=True)
        await pg.wait_for_timeout(3500)
        opened = await pg.evaluate(f"localStorage.getItem('{KEY}')")
        await pg.close()
        # (scenes filmed before are kept: a run of some scenes replaces only those)
        path = os.path.join(OUT, 'tour.json')
        tour = json.load(open(path)) if os.path.exists(path) else []
        for n, (sid, title, aim, setup, steps) in enumerate(SCENES, 1):
            if ONLY and sid not in ONLY:
                continue
            save = json.loads(opened if sid in MIDDAY else fresh)
            setup(save.get('state', save))
            ctx = await browser.new_context(viewport={'width': 1280, 'height': 800}, record_video_dir=OUT, record_video_size={'width': 1280, 'height': 800})
            await ctx.add_init_script(OVERLAY)
            await ctx.add_init_script(f"if (!sessionStorage.tour) {{ localStorage.setItem('{KEY}', {json.dumps(json.dumps(save))}); sessionStorage.tour = '1'; }}")
            pg = await ctx.new_page()
            t0 = time.time()
            errors = []
            pg.on('pageerror', lambda e: errors.append(str(e)))
            await pg.goto(URL)
            await pg.wait_for_timeout(900)
            await pg.click('[data-act=resume]', force=True)
            await pg.wait_for_timeout(1500)
            p = Play(pg, t0)
            p.cut = max(0.0, p.now() - 0.6)
            try:
                await steps(p)
            except Exception as e:  # (a scene that goes wrong is still kept, with what went wrong)
                errors.append(repr(e)[:200])
            await pg.wait_for_timeout(1200)
            if p.still is None:
                await p.shot()
            video = await pg.video.path()
            await ctx.close()
            name = f'scene{n:02d}-{sid}'
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', f'{p.cut:.2f}', '-i', video, '-vf', 'scale=960:-2', '-c:v', 'libx264', '-preset', 'slow', '-crf', '30', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', os.path.join(OUT, name + '.mp4')], check=True)
            os.remove(video)
            open(os.path.join(OUT, name + '.jpg'), 'wb').write(p.still)
            size = os.path.getsize(os.path.join(OUT, name + '.mp4'))
            tour = [t for t in tour if t['id'] != sid]
            tour.append({'id': sid, 'file': name, 'title': title, 'aim': aim, 'captions': p.caps, 'errors': errors})
            print(name, f'{size / 1e6:.2f}MB', 'caps', len(p.caps), 'errors', errors)
        order = [x[0] for x in SCENES]
        tour.sort(key=lambda t: order.index(t['id']))
        json.dump(tour, open(os.path.join(OUT, 'tour.json'), 'w'), ensure_ascii=False, indent=1)
        await browser.close()
    write_page(tour)


# What was noticed while filming, to be read with the scene (kept by hand: take out what no longer holds).
NOTES = {
    'intro': ['別の回の撮影では、1 日目の最初の客が大家の伊能忠敬でした（この動画では別の客です）。ふつうの客として来るのは世界観と合わないので、客の抽選から外すかどうかを決めたいところです。'],
    'shop': ['12 品を並べても、床の下半分は空いています。品数を増やすか、床を小さくするかの判断材料に。'],
    'hot': ['この場面だけ、訳ありの品を持つ客をこちらで用意しています（実際の遊びでは、6 日目以降に確率で来ます）。'],
}


def write_page(tour):
    """The page the films are read on (a phone in mind): index.html beside them, from scripts/tour_page.html."""
    import datetime, html
    esc = html.escape
    cards = []
    for n, t in enumerate(tour, 1):
        caps = ''.join(f'<li>{esc(c)}</li>' for c in t['captions'])
        notes = ''.join(f'<p class="note"><b>気づいた点</b>{esc(x)}</p>' for x in NOTES.get(t['id'], []))
        cards.append(f'''<section class="scene" id="s-{t['id']}">
  <header><span class="num">{n:02d}</span><h2>{esc(t['title'])}</h2></header>
  <p class="aim"><b>見どころ</b>{esc(t['aim'])}</p>
  <video controls playsinline preload="none" poster="{t['file']}.jpg" src="{t['file']}.mp4"></video>
  <details><summary>字幕を文字で読む（{len(t['captions'])} 行）</summary><ol>{caps}</ol></details>
  {notes}
</section>''')
    nav = ''.join(f'<a href="#s-{t["id"]}"><i>{n:02d}</i>{esc(t["title"].split("（")[0])}</a>' for n, t in enumerate(tour, 1))
    page = open(os.path.join(os.path.dirname(__file__), 'tour_page.html'), encoding='utf8').read()
    page = page.replace('{{NAV}}', nav).replace('{{SCENES}}', ''.join(cards)).replace('{{DATE}}', datetime.date.today().isoformat()).replace('{{COUNT}}', str(len(tour)))
    open(os.path.join(OUT, 'index.html'), 'w', encoding='utf8').write(page)


asyncio.run(main())
