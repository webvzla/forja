# FORJA Academy en el navegador: abre «Cómo se hace» durante un entreno, comprueba la ficha,
# los controles de la demostración, la ampliación, las alternativas y que no se pierden los datos.
# Uso: sirve la web compilada en :8850 y ejecuta python3 scripts/pruebas/academia.e2e.py
import json, sys
from playwright.sync_api import sync_playwright

WEB = 'http://127.0.0.1:8850/'
datos = json.load(open('/tmp/datos_demo.json'))
datos['activo'] = None
ok = fallos = 0


def prueba(nombre, cond, detalle=''):
    global ok, fallos
    if cond: ok += 1; print('  ✓', nombre)
    else: fallos += 1; print('  ✗', nombre, detalle)


def entrar_en_entreno(pag):
    pag.get_by_text('Rutinas', exact=True).last.click()
    pag.get_by_text('Empezar', exact=True).first.click()
    pag.wait_for_timeout(500)
    if pag.get_by_text('¿Cómo estás hoy?').count():
        pag.get_by_text('Empezar', exact=True).last.click()
    pag.wait_for_timeout(800)


with sync_playwright() as pw:
    nav = pw.chromium.launch()
    for modo in ['oscuro', 'claro']:
        print(f'Tema {modo}')
        ctx = nav.new_context(viewport={'width': 390, 'height': 844})
        pag = ctx.new_page()
        errores = []
        pag.on('pageerror', lambda e: errores.append(str(e)))
        rotas = []
        pag.on('response', lambda r: rotas.append(r.url) if r.status >= 400 and 'academia' in r.url else None)
        pag.goto(WEB)
        pag.evaluate("([d, m]) => { localStorage.setItem('mi-gym:v1', d); localStorage.setItem('forja:apariencia', JSON.stringify({tema: m === 'claro' ? 'azul' : 'verde', personal: null, modo: m, texto: 1})); }", [json.dumps(datos), modo])
        pag.reload(); pag.wait_for_timeout(1500)
        entrar_en_entreno(pag)
        primero = pag.locator('[aria-label$=", serie 1, kilos"]').first
        nombre = primero.get_attribute('aria-label').split(', serie')[0]
        primero.fill('62.5')
        pag.locator(f'[aria-label="{nombre}, serie 1, repeticiones"]').fill('9')
        pag.get_by_label(f'Cómo se hace {nombre}').click()
        pag.wait_for_timeout(1200)
        texto = pag.inner_text('body')
        prueba(f'se abre la ficha de «{nombre}»', 'FORJA ACADEMY' in texto and 'Paso a paso' in texto)
        for s in ['Músculos que trabajas', 'Respiración', 'Errores frecuentes', 'Si estás empezando']:
            prueba(f'incluye «{s}»', s in texto)
        hay_visual = pag.locator('img[src*="academia/"]').count() >= 2
        prueba('muestra la demostración (2 fotogramas) o avisa de que falta', hay_visual or 'Falta contenido visual' in texto)
        if hay_visual:
            pag.wait_for_timeout(1500)
            cargadas = pag.evaluate("[...document.querySelectorAll('img[src*=\"academia/\"]')].every(i => i.complete && i.naturalWidth > 0)")
            prueba('las ilustraciones cargan', cargadas and not rotas, rotas)
            prueba('crédito y licencia visibles', 'CC BY-SA 4.0' in texto)
            pag.get_by_label('❚❚ Pausa').click(); pag.wait_for_timeout(300)
            prueba('se puede pausar', pag.get_by_label('▶ Reproducir').count() == 1)
            pag.get_by_label('Final del recorrido', exact=True).click(); pag.wait_for_timeout(500)
            prueba('se puede elegir la posición final', pag.locator('[aria-label^="Final del recorrido de"]').count() == 1)
            pag.get_by_label('↺ Repetir').click(); pag.wait_for_timeout(300)
            prueba('repetir vuelve a la posición inicial y reproduce', pag.locator('[aria-label^="Posición inicial de"]').count() == 1 and pag.get_by_label('❚❚ Pausa').count() == 1)
            pag.get_by_label('Cambiar velocidad').click()
            prueba('cambia la velocidad', 'Normal' in pag.inner_text('body'))
            pag.locator('[aria-label*="Toca para ampliar"]').click(); pag.wait_for_timeout(600)
            prueba('se puede ampliar', pag.get_by_text('✕ Cerrar').count() == 1)
            pag.screenshot(path=f'/tmp/acad_ampliada_{modo}.png')
            pag.get_by_text('✕ Cerrar').click(); pag.wait_for_timeout(400)
        pag.screenshot(path=f'/tmp/acad_ficha_{modo}.png', full_page=True)
        alt = pag.locator('[aria-label^="Ver ficha de "]').first
        if alt.count():
            destino = alt.get_attribute('aria-label').replace('Ver ficha de ', '')
            alt.click(); pag.wait_for_timeout(600)
            prueba(f'abre la alternativa «{destino}» dentro de Academy', destino in pag.inner_text('body') and pag.get_by_label(f'Volver a {nombre}').count() == 1)
            pag.get_by_label(f'Volver a {nombre}').click(); pag.wait_for_timeout(300)
        pag.get_by_label('Cerrar y volver al entreno').click(); pag.wait_for_timeout(600)
        prueba('al cerrar siguen los kilos y repeticiones escritos', primero.input_value() == '62.5' and pag.locator(f'[aria-label="{nombre}, serie 1, repeticiones"]').input_value() == '9')
        pag.screenshot(path=f'/tmp/acad_entreno_{modo}.png')
        prueba('sin errores de JavaScript', not errores, errores)
        ctx.close()

    print('Todas las fichas')
    ctx = nav.new_context(viewport={'width': 390, 'height': 844}); pag = ctx.new_page()
    errores = []; pag.on('pageerror', lambda e: errores.append(str(e)))
    pag.goto(WEB); pag.evaluate("d => localStorage.setItem('mi-gym:v1', d)", json.dumps(datos)); pag.reload(); pag.wait_for_timeout(1200)
    entrar_en_entreno(pag)
    nombres = sorted(set(a.split(', serie')[0] for a in pag.locator('[aria-label*=", serie 1, kilos"]').evaluate_all('l => l.map(x => x.getAttribute("aria-label"))')))
    for n in nombres:
        pag.get_by_label(f'Cómo se hace {n}').click(); pag.wait_for_timeout(700)
        t = pag.inner_text('body')
        prueba(f'ficha completa: {n}', 'Paso a paso' in t and 'Errores frecuentes' in t and 'no está en la biblioteca' not in t)
        pag.get_by_label('Cerrar y volver al entreno').click(); pag.wait_for_timeout(300)
    prueba('sin errores de JavaScript', not errores, errores)

    print('Ilustraciones propias animadas')
    propios = json.dumps(datos)
    for viejo, nuevo_n in [('"Press de banca"', '"Flexiones inclinadas"'), ('"Sentadilla"', '"Sentadilla goblet"'), ('"Press militar"', '"Flexiones pica"'), ('"Remo con barra"', '"Dead bug"')]:
        propios = propios.replace(viejo, nuevo_n)
    pag.evaluate("d => localStorage.setItem('mi-gym:v1', d)", propios); pag.reload(); pag.wait_for_timeout(1200)
    entrar_en_entreno(pag)
    actuales = set(a.split(', serie')[0] for a in pag.locator('[aria-label*=", serie 1, kilos"]').evaluate_all('l => l.map(x => x.getAttribute("aria-label"))'))
    objetivo = next((n for n in ['Flexiones inclinadas', 'Sentadilla goblet', 'Flexiones pica', 'Dead bug'] if n in actuales), None)
    prueba('el entreno incluye un ejercicio con ilustración propia', objetivo is not None, actuales)
    if objetivo:
        pag.get_by_label(f'Cómo se hace {objetivo}').click(); pag.wait_for_timeout(800)
        imgs = pag.locator('img[src*="academia/"]').evaluate_all('l => l.map(x => x.getAttribute("src"))')
        prueba(f'la ficha propia de {objetivo} carga 9 fotogramas', len(imgs) == 9, len(imgs))
        vistos = set()
        for _ in range(16):
            lab = pag.locator('[aria-label*="Toca para ampliar"]').first.get_attribute('aria-label')
            vistos.add(lab.split(' de ')[0]); pag.wait_for_timeout(200)
        prueba('la animación recorre inicio, movimiento y final', {'Posición inicial', 'Movimiento', 'Final del recorrido'} <= vistos, vistos)
        prueba('crédito de ilustración propia', 'FORJA (ilustración propia)' in pag.inner_text('body'))
        pag.get_by_label('Movimiento', exact=True).click(); pag.wait_for_timeout(300)
        prueba('se puede detener en mitad del movimiento', pag.locator('[aria-label^="Movimiento de"]').count() == 1)
        pag.screenshot(path='/tmp/acad_propia.png')
        pag.get_by_label('Cerrar y volver al entreno').click(); pag.wait_for_timeout(300)
    prueba('sin errores de JavaScript (propias)', not errores, errores)
    pag.evaluate("d => localStorage.setItem('mi-gym:v1', d)", json.dumps(datos)); pag.reload(); pag.wait_for_timeout(800)

    print('Sin conexión')
    ctx2 = nav.new_context(viewport={'width': 390, 'height': 844}); p2 = ctx2.new_page()
    p2.goto(WEB); p2.evaluate("d => localStorage.setItem('mi-gym:v1', d)", json.dumps(datos))
    p2.evaluate("navigator.serviceWorker && navigator.serviceWorker.register('sw.js')"); p2.wait_for_timeout(500)
    p2.evaluate("navigator.serviceWorker.ready.then(() => 1)"); p2.wait_for_timeout(4000)
    en_cache = p2.evaluate("caches.keys().then(ks => Promise.all(ks.map(k => caches.open(k).then(c => c.keys())))).then(l => l.flat().filter(r => r.url.includes('academia/')).length)")
    prueba('las 118 ilustraciones (72 + 46 fotogramas propios) quedan guardadas sin conexión', en_cache >= 118, en_cache)
    p2.reload(); p2.wait_for_timeout(1500)
    ctx2.set_offline(True)
    p2.reload(); p2.wait_for_timeout(2000)
    entrar_en_entreno(p2)
    n = p2.locator('[aria-label$=", serie 1, kilos"]').first.get_attribute('aria-label').split(', serie')[0]
    p2.get_by_label(f'Cómo se hace {n}').click(); p2.wait_for_timeout(1500)
    ok_off = p2.evaluate("[...document.querySelectorAll('img[src*=\"academia/\"]')].every(i => i.complete && i.naturalWidth > 0)") if p2.locator('img[src*="academia/"]').count() else 'Falta contenido visual' in p2.inner_text('body')
    prueba('la ficha y sus imágenes funcionan sin conexión', ok_off and 'Paso a paso' in p2.inner_text('body'))
    nav.close()

print(f'\n{ok} pruebas correctas, {fallos} fallidas')
sys.exit(1 if fallos else 0)
