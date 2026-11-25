# Prueba de extremo a extremo: la app web real (build) contra el Supabase simulado (PGlite + RLS).
# Requisitos: servidor-simulado.mjs en :54321 y la web compilada servida en :8840.
# Uso: python3 supabase/pruebas/e2e.py
import json, sys, time, urllib.request
from playwright.sync_api import sync_playwright

API = 'http://127.0.0.1:54321'
WEB = 'http://127.0.0.1:8840/'
ok, fallos = 0, 0


def prueba(nombre, cond, detalle=''):
    global ok, fallos
    if cond:
        ok += 1; print('  ✓', nombre)
    else:
        fallos += 1; print('  ✗', nombre, detalle)


def http(ruta, cuerpo=None, token=None, metodo=None):
    h = {'content-type': 'application/json'}
    if token: h['authorization'] = 'Bearer ' + token
    if ruta.startswith('/__prueba'): h['x-prueba'] = 'si'
    r = urllib.request.Request(API + ruta, data=json.dumps(cuerpo).encode() if cuerpo is not None else None, headers=h, method=metodo or ('POST' if cuerpo is not None else 'GET'))
    try:
        with urllib.request.urlopen(r) as x:
            t = x.read().decode(); return x.status, (json.loads(t) if t else None)
    except urllib.error.HTTPError as e:
        t = e.read().decode(); return e.code, (json.loads(t) if t else None)


sql = lambda q, p=None: http('/__prueba/sql', {'sql': q, 'params': p or []})[1]

# Amiga ficticia "Bea" creada directamente en el servidor, con entrenos de hoy.
_, b = http('/auth/v1/signup', {'email': 'bea@prueba.test', 'password': 'secreto1'})
bea = b['access_token']; bea_id = b['user']['id']
http('/rest/v1/rpc/actualizar_perfil', {'p_apodo': 'Bea', 'p_dias_objetivo': 3}, bea)
hoy = time.strftime('%Y-%m-%d')
for i in range(2):
    http('/rest/v1/rpc/registrar_entreno', {'p_id': f'bea{i}', 'p_dia': hoy, 'p_minutos': 45, 'p_series': 14}, bea)

datos = json.load(open('/tmp/datos_demo.json'))

with sync_playwright() as pw:
    nav = pw.chromium.launch()
    ctx = nav.new_context(viewport={'width': 400, 'height': 860})
    pag = ctx.new_page()
    errores = []
    pag.on('pageerror', lambda e: errores.append(str(e)))
    pag.goto(WEB)
    pag.evaluate("d => localStorage.setItem('mi-gym:v1', d)", json.dumps(datos))
    pag.reload()

    print('Registro e inicio de sesión')
    pag.get_by_text('Crear cuenta', exact=True).first.click()
    pag.get_by_label('Email').fill('ana@prueba.test')
    pag.get_by_label('Contraseña').fill('secreto1')
    pag.get_by_text('Crear cuenta', exact=True).last.click()
    pag.wait_for_timeout(3000)
    ana_id = sql("select id from auth.users where email = 'ana@prueba.test'")[0]['id']
    perfil = sql('select apodo, codigo from public.perfiles where id = $1', [ana_id])
    prueba('al registrarse se crea su perfil con código', bool(perfil) and perfil[0]['codigo'].startswith('FORJA-'), perfil)
    prueba('los datos del móvil se suben a su fila', sql('select count(*)::int n from public.datos_usuario where user_id = $1', [ana_id])[0]['n'] == 1)

    print('Sincronización de entrenos (validada en servidor)')
    pag.wait_for_timeout(4000)  # espera de 2 s + envío de la cola
    n = sql('select count(*)::int n from public.actividad where user_id = $1', [ana_id])[0]['n']
    recientes = sum(1 for s in datos['sesiones'] if s['fecha'] >= (time.time() - 7 * 86400) * 1000)
    prueba(f'se registran solo los entrenos de los últimos 7 días ({recientes})', n == recientes, f'servidor={n}')
    prueba('preferencias y objetivo enviados', sql('select dias_objetivo from public.perfiles where id = $1', [ana_id])[0]['dias_objetivo'] == 4)

    print('Arena · amigos')
    pag.get_by_text('Arena', exact=True).last.click()
    pag.get_by_text('👥 Amigos').click()
    pag.wait_for_timeout(1500)
    codigo_ana = perfil[0]['codigo']
    prueba('muestra su código real', pag.get_by_text(codigo_ana).count() > 0)
    # Bea pide amistad con el código de Ana
    http('/rest/v1/rpc/solicitar_amistad', {'p_codigo': codigo_ana}, bea)
    pag.get_by_text('🏆 Top').click(); pag.get_by_text('👥 Amigos').click()
    pag.wait_for_timeout(1500)
    prueba('aparece la solicitud de Bea', pag.get_by_text('Quiere ser tu amigo').count() == 1)
    pag.get_by_text('Aceptar', exact=True).first.click()
    pag.wait_for_timeout(1500)
    prueba('Bea pasa a ser amiga', sql("select estado from public.amistades where de = $1", [bea_id])[0]['estado'] == 'aceptada')

    print('Arena · ranking calculado en servidor')
    pag.get_by_text('🏆 Top').click()
    pag.wait_for_timeout(2000)
    texto = pag.inner_text('body')
    prueba('el ranking incluye a Bea y a Ana', 'Bea' in texto and '(tú)' in texto, texto[:300])
    pts = http('/rest/v1/rpc/ranking', {}, bea)[1]
    prueba('los puntos que ve Bea coinciden con el servidor', any(f['apodo'] == 'Bea' and f['puntos'] == 10 for f in pts), pts)  # 2 entrenos el mismo día = 1 (máx. 1 por día)

    print('Arena · retos')
    pag.get_by_text('🎯 Retos').click()
    pag.wait_for_timeout(1000)
    pag.get_by_text('＋ Crear reto').click()
    pag.get_by_label('Nombre del reto').fill('Semana con Bea')
    pag.get_by_text('Bea', exact=True).click()
    pag.get_by_text('Crear reto', exact=True).click()
    pag.wait_for_timeout(2000)
    retos = http('/rest/v1/rpc/mis_retos', {}, bea)[1]
    prueba('Bea recibe la invitación al reto', len(retos) == 1 and retos[0]['mi_estado'] == 'invitado', retos)
    prueba('el reto aparece en la app con progreso del servidor', pag.get_by_text('Semana con Bea').count() == 1)

    print('Privacidad')
    pag.get_by_text('👥 Amigos').click()
    pag.wait_for_timeout(1200)
    campo = pag.get_by_label('Tu apodo en Arena')
    campo.fill('Ana Prueba'); campo.blur()
    pag.wait_for_timeout(3500)
    prueba('el apodo se guarda en el servidor', sql('select apodo from public.perfiles where id = $1', [ana_id])[0]['apodo'] == 'Ana Prueba')
    ficha = http('/rest/v1/rpc/perfil_amigo', {'p_id': ana_id}, bea)[1]
    prueba('la ficha que ve Bea no incluye email ni peso', 'email' not in json.dumps(ficha) and 'peso' not in json.dumps(ficha), ficha)
    st, otros = http(f'/rest/v1/datos_usuario?user_id=eq.{ana_id}', token=bea)
    prueba('Bea no puede leer los datos privados de Ana', st == 200 and otros == [], otros)
    st, _ = http('/rest/v1/rpc/ranking', {})
    prueba('sin sesión no se puede consultar nada', st in (401, 403), st)
    st, r = http('/rest/v1/rpc/registrar_entreno', {'p_id': 'trampa', 'p_dia': '2030-01-01', 'p_minutos': 60, 'p_series': 20}, bea)
    prueba('no se aceptan entrenos con fecha futura', st == 400, r)

    print('Modo sin conexión')
    ctx.set_offline(True)
    campo.fill('Ana Offline'); campo.blur()
    pag.wait_for_timeout(3500)
    prueba('sin red el cambio queda en la cola', sql('select apodo from public.perfiles where id = $1', [ana_id])[0]['apodo'] == 'Ana Prueba')
    pag.get_by_text('🎯 Retos').click(); pag.wait_for_timeout(800)
    prueba('la app avisa de cambios pendientes o de la falta de conexión', 'pendiente' in pag.inner_text('body') or 'conexión' in pag.inner_text('body'))
    pag.get_by_text('Rutinas', exact=True).last.click()
    pag.wait_for_timeout(800)
    prueba('el resto de la app sigue funcionando offline', datos['rutinas'][0]['nombre'] in pag.inner_text('body'))
    ctx.set_offline(False)
    pag.evaluate("window.dispatchEvent(new Event('online'))")
    pag.wait_for_timeout(3000)
    prueba('al volver la red la cola se envía sola', sql('select apodo from public.perfiles where id = $1', [ana_id])[0]['apodo'] == 'Ana Offline')

    nube = sql('select datos #>> \'{ajustes,arena,apodo}\' as a from public.datos_usuario where user_id = $1', [ana_id])[0]['a']
    prueba('los datos sincronizados también se reenvían al volver la red', nube == 'Ana Offline', nube)

    print('Invitación por enlace')
    codigo_bea = sql('select codigo from public.perfiles where id = $1', [bea_id])[0]['codigo']
    ctx2 = nav.new_context(viewport={'width': 400, 'height': 860}); p2 = ctx2.new_page()
    p2.on('pageerror', lambda e: errores.append(str(e)))
    p2.goto(WEB + '?amigo=' + codigo_bea); p2.wait_for_timeout(2000)
    prueba('el enlace abre el registro con el aviso de invitación', codigo_bea in p2.inner_text('body') and p2.get_by_label('Email').count() == 1, p2.inner_text('body')[:200])
    prueba('el código se retira de la dirección', '?amigo' not in p2.url, p2.url)
    p2.get_by_label('Email').fill('carla@prueba.test'); p2.get_by_label('Contraseña').fill('secreto1')
    p2.get_by_text('Crear cuenta', exact=True).last.click(); p2.wait_for_timeout(3500)
    p2.get_by_text('👥 Amigos').click(); p2.wait_for_timeout(1500)
    prueba('Arena muestra «Te han invitado»', 'Te han invitado' in p2.inner_text('body'))
    p2.get_by_text('Enviar solicitud', exact=True).click(); p2.wait_for_timeout(1500)
    carla_id = sql("select id from auth.users where email = 'carla@prueba.test'")[0]['id']
    am = sql('select estado from public.amistades where de = $1 and para = $2', [carla_id, bea_id])
    prueba('la solicitud a Bea queda pendiente en el servidor', am == [{'estado': 'pendiente'}], am)
    p2.reload(); p2.wait_for_timeout(1500)
    prueba('la invitación no se repite tras usarla', 'Te han invitado' not in p2.inner_text('body'))
    ctx2.close()

    print('Sesión')
    pag.reload(); pag.wait_for_timeout(2500)
    prueba('la sesión se mantiene al recargar', pag.get_by_text('Entra en tu cuenta').count() == 0)
    prueba('sin errores de JavaScript', not errores, errores)
    pag.screenshot(path='/tmp/e2e_final.png')
    nav.close()

print(f'\n{ok} pruebas correctas, {fallos} fallidas')
sys.exit(1 if fallos else 0)
