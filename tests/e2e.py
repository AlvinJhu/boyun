# 瀏覽器端對端測試（Playwright）。需要 Chrome；CI 預設不跑，本機或交付前跑：python3 tests/e2e.py
import json, re, sys, os
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGE = 'file://' + os.path.join(ROOT, 'public', 'index.html')
NM = os.path.join(ROOT, 'node_modules') + '/'
CHROME = os.environ.get('CHROME', '/usr/bin/google-chrome')
bodies = []; errors = []
BAD = "你一定會成功，這是注定的。[T-SAT-TRI-VEN]"
READ = {"palm": None, "pishi": "x", "overview": "x", "career": BAD, "wealth": "x", "love": "x", "health": "x",
        "western": {"big3": "x", "planets": "x", "aspects": "x", "transit": "x", "blend": "x"}, "name": "姓名學測試段落", "answer": "", "actions": ["a", "b", "c"]}
DEEP = {"summary": BAD, "topics": [], "months": [], "actions": []}
PAIR = {"summary": BAD, "mode": "m", "strength": "s", "friction": "f", "communication": "c", "actions": ["a", "b", "c"]}
def route(r):
    u = r.request.url
    if 'lunar-javascript' in u: return r.fulfill(path=NM + 'lunar-javascript/lunar.js', content_type='application/javascript')
    if 'astronomy-engine' in u: return r.fulfill(path=NM + 'astronomy-engine/astronomy.browser.min.js', content_type='application/javascript')
    if u.endswith('/api/reading'):
        b = json.loads(r.request.post_data); bodies.append(b)
        return r.fulfill(status=200, content_type='application/json', body=json.dumps({'deep': DEEP, 'pair': PAIR}.get(b.get('kind'), READ)))
    if u.startswith('file://'): return r.continue_()
    return r.abort()
ok = True
def check(c, m):
    global ok
    print(('PASS ' if c else 'FAIL ') + m)
    if not c: ok = False
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CHROME, args=['--no-sandbox'])
    pg = br.new_page(viewport={'width': 1100, 'height': 900})
    pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: errors.append('console.' + m.type + ': ' + m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    pg.route('**/*', route)
    pg.goto(PAGE); pg.wait_for_timeout(800)
    nav = pg.inner_text('nav')
    check('雙人合盤' in nav and '使用說明' in nav, '導覽列保留 11/14 版的雙人合盤、使用說明')
    pg.fill('#birth', '1990-06-15'); pg.dispatch_event('#birth', 'change')
    pg.select_option('#hour', '12'); pg.dispatch_event('#hour', 'change')
    pg.click('#go'); pg.wait_for_timeout(1800)
    w = pg.inner_text('#western')
    check('年行運：五顆外行星' in w and '行運時間窗' in w, '星盤：五顆外行星與行運時間窗')
    check(all(x in w for x in ['木星', '土星', '天王星', '海王星', '冥王星']), '星盤：五顆行星都出現')
    check(re.search(r'T-[A-Z]{3}-[A-Z]{3}-[A-Z]{3}', w) is not None, '星盤：顯示規則編號')
    check('NaN' not in w and 'undefined' not in w, '星盤：沒有 NaN/undefined')
    nm = pg.inner_text('#nameOut')
    check(all(x in nm for x in ['天格', '人格', '地格', '外格', '總格', '三才']), '姓名學：五格與三才（預設姓名）')
    # 單次解讀
    p1 = bodies[0]['prompt'] if bodies else ''
    check(bodies and bodies[0].get('kind', 'read') == 'read', '單次解讀送出 kind=read')
    check('推理流程（先在心中完成，再輸出 JSON）' in p1 and '【交叉線索】' in p1 and '｜詮釋：' in p1, '單次解讀 prompt 含推理守則、交叉線索、知識庫詮釋')
    check('【姓名學】姓名「' in p1 and 'T-' in p1, '單次解讀 prompt 含姓名學與行運編號')
    ai = pg.inner_text('#aiOut')
    check('一定會' not in ai and '注定' not in ai and 'T-SAT-TRI-VEN' not in ai, '稽核：AI 回覆中的禁用字眼與編造編號不會顯示')
    check('可能會成功' in ai, '稽核：禁用字眼被改寫成中性說法')
    check('姓名學（' in ai, 'AI 結果有姓名學段落')
    # 深度報告
    pg.click('#deepBtn'); pg.wait_for_timeout(1500)
    p2 = bodies[1]['prompt'] if len(bodies) > 1 else ''
    check(len(bodies) > 1 and bodies[1].get('kind') == 'deep', '深度報告送出 kind=deep')
    check('推理流程' in p2 and '【交叉線索】' in p2 and '行運時間窗：' in p2, '深度報告 prompt 含推理守則、交叉線索、行運')
    rep = pg.inner_text('#reportOut')
    check('一定會' not in rep and 'T-SAT-TRI-VEN' not in rep, '稽核：深度報告同樣被過濾')
    # 雙人合盤
    left0 = pg.inner_text('b.q-left[data-k="pair"]')
    pg.click('#pairBtn'); pg.wait_for_timeout(1800)
    pp = [b for b in bodies if b.get('kind') == 'pair']
    check(len(pp) == 1, '雙人合盤送出 kind=pair')
    check(pp and '推理流程' in pp[0]['prompt'] and '【規則分析】' in pp[0]['prompt'], '合盤 prompt 含推理守則與規則分析')
    pa = pg.inner_text('#pairAI')
    check('一定會' not in pa and 'T-SAT-TRI-VEN' not in pa, '稽核：合盤結果同樣被過濾')
    left1 = pg.inner_text('b.q-left[data-k="pair"]')
    check(left0 == '2' and left1 == '1', f'合盤額度獨立計算（{left0}→{left1}）')
    check(pg.inner_text('b.q-left[data-k="read"]') == '1', '解讀額度只被單次解讀扣 1')
    print('PROMPT LENGTHS single=', len(p1), 'deep=', len(p2), 'pair=', len(pp[0]['prompt']) if pp else None)
    check(max(len(p1), len(p2)) < 12000, 'prompt 長度低於後端 12000 上限')
    # 使用說明與隱私權政策
    pg.goto(PAGE + '#guide'); pg.wait_for_timeout(500)
    check('使用說明' in pg.inner_text('#guide'), '使用說明頁可開啟')
    pg.goto(PAGE + '#privacy'); pg.wait_for_timeout(500)
    check('隱私權政策' in pg.inner_text('#privacy'), '隱私權政策頁可開啟')
    pg.goto(PAGE); pg.wait_for_timeout(600)
    # 時辰不詳
    pg.fill('#birth', '1990-06-15'); pg.dispatch_event('#birth', 'change')
    pg.select_option('#hour', '-1'); pg.dispatch_event('#hour', 'change'); pg.click('#go'); pg.wait_for_timeout(1800)
    w3 = pg.inner_text('#western')
    check('已略過月亮與上升' in w3 and '（約略）' in w3, '時辰不詳：略過月亮與上升並標示月亮約略')
    # 手機寬度
    pg.set_viewport_size({'width': 390, 'height': 800}); pg.wait_for_timeout(400)
    sw = pg.evaluate('document.documentElement.scrollWidth')
    check(sw <= 392, f'手機寬度無橫向溢出（scrollWidth={sw}）')
    check(not errors, 'console/page 沒有錯誤' + ('' if not errors else ' ' + '; '.join(errors[:3])))
    br.close()
print('ALL OK' if ok else 'SOME FAILED'); sys.exit(0 if ok else 1)
