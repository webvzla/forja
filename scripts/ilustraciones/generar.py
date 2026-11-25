# © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
# Ilustraciones propias de FORJA Academy: figura humana de perfil con proporciones antropométricas
# (adulto de 175 cm, tablas de Winter) y movimiento calculado con cinemática:
#  - las articulaciones se mueven por ángulos, así que los segmentos nunca cambian de longitud;
#  - los apoyos (pies, manos, antebrazos) quedan fijos y los brazos se resuelven con cinemática inversa;
#  - cada fotograma pasa comprobaciones biomecánicas (rangos articulares, apoyos, longitudes).
# Uso (solo en desarrollo, necesita rsvg-convert y Pillow):
#   python3 scripts/ilustraciones/generar.py            → public/academia/<id>-1..N.webp
#   python3 scripts/ilustraciones/generar.py --hoja     → además /tmp/forja-hoja.png para revisarlas
import io, math, subprocess, sys
from PIL import Image

H = 175
L = dict(  # longitudes en cm
    shin=0.246 * H, thigh=0.245 * H, torso=50.0, uarm=0.186 * H, farm=0.146 * H,
    neck=20.0, head=11.0, foot=21.0, ankle=8.0,
)
ANCHO, ALTO = 520, 416
NEAR, FAR, PROP, SUELO, GUIA = '#2B2F36', '#9AA0A8', '#C9CDD3', '#B9BEC6', '#1E9E57'
N = 9  # fotogramas por movimiento (1 = inicio, N = final)
# En las flexiones las manos van algo más abiertas que los hombros: vistos de perfil, los brazos se ven
# más cortos (proyección). Se usa ese largo aparente para el dibujo y para las comprobaciones.
PROY = 0.86


def v(a, d):  # vector de longitud d con ángulo a (grados, 0 = derecha, 90 = arriba)
    r = math.radians(a)
    return (d * math.cos(r), d * math.sin(r))


def add(p, q):
    return (p[0] + q[0], p[1] + q[1])


def dist(p, q):
    return math.hypot(p[0] - q[0], p[1] - q[1])


def ang(p, q):
    return math.degrees(math.atan2(q[1] - p[1], q[0] - p[0]))


def ik(a, b, l1, l2, lado):
    """Codo/rodilla entre a y b. lado=+1/-1 elige hacia qué lado se dobla."""
    d = min(dist(a, b), l1 + l2 - 1e-6)
    base = ang(a, b)
    cosx = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)
    x = math.degrees(math.acos(max(-1, min(1, cosx))))
    return add(a, v(base + lado * x, l1))


def codo_atras(sh, mano, k=PROY):
    """En las flexiones el codo apunta hacia los pies (detrás de la mano), nunca hacia delante."""
    a = ik(sh, mano, L['uarm'] * k, L['farm'] * k, 1)
    b = ik(sh, mano, L['uarm'] * k, L['farm'] * k, -1)
    atras = [q for q in (a, b) if q[0] <= mano[0] + 2] or [a, b]
    return max(atras, key=lambda q: q[1])  # hacia atrás y, de las opciones, la más alta


def angulo_interior(a, b, c):  # ángulo en b (180 = recto)
    a1, a2 = ang(b, a), ang(b, c)
    d = abs((a1 - a2 + 180) % 360 - 180)
    return d


def suave(t):  # ida y vuelta natural
    return 0.5 - 0.5 * math.cos(math.pi * t)


def lerp(a, b, t):
    return a + (b - a) * t


# ---------------------------------------------------------------- ejercicios
# Cada función devuelve, para t en [0, 1], un dict con puntos y elementos de atrezo.

def sentadilla(t, goblet=False):
    ankle = (0.0, L['ankle'])
    shin_a = lerp(88, 55 if goblet else 60, t)        # inclinación de la tibia (dorsiflexión 2°→35°/30°)
    thigh_a = lerp(92, 190 if goblet else 180, t)      # dirección rodilla→cadera
    torso_a = lerp(90, 65 if goblet else 45, t)        # tronco: vertical → 25°/45° de inclinación
    knee = add(ankle, v(shin_a, L['shin']))
    hip = add(knee, v(thigh_a, L['thigh']))
    sh = add(hip, v(torso_a, L['torso']))
    head = add(sh, v(torso_a + lerp(0, 18, t) * (0.6 if goblet else 1), L['neck']))
    p = dict(ankle=ankle, knee=knee, hip=hip, sh=sh, head=head, toe=(21, 0), heel=(-6, 0))
    if goblet:
        down = torso_a + 180
        elbow = add(sh, v(down + lerp(15, 30, t), L['uarm']))
        hand = add(elbow, v(down + lerp(15, 30, t) + 130, L['farm']))
        p.update(elbow=elbow, hand=hand, mancuerna=hand)
    else:
        elbow = add(sh, v(0, L['uarm']))
        hand = add(elbow, v(0, L['farm']))
        p.update(elbow=elbow, hand=hand)
    p['far'] = dict(p)  # pierna y brazo del otro lado coinciden de perfil
    return p


def flexion_inclinada(t):
    P = (0.0, 45.0)  # manos en el borde de un banco de 45 cm
    largo = L['shin'] + L['thigh'] + L['torso']
    brazo = (L['uarm'] + L['farm']) * PROY - 0.5
    PIE = 105  # el pie forma ~105° con la línea del cuerpo (apoyado en las puntas)

    def cuerpo(theta, toe):  # cuerpo rígido (talón-cabeza recto) que pivota sobre las puntas
        ankle = add(toe, v(theta + PIE, 13))
        hip = add(ankle, v(theta, L['shin'] + L['thigh']))
        sh = add(hip, v(theta, L['torso']))
        return ankle, hip, sh

    # Abajo (definido por anatomía): antebrazo casi vertical (75° sobre el banco, hacia atrás) y codo a 90°,
    # con el brazo hacia atrás, pegado unos 45° al cuerpo.
    elbow1 = add(P, v(105, L['farm'] * PROY))
    sh1 = add(elbow1, v(105 + 90, -L['uarm']) if False else v(105 - 180 + 90 + 180, L['uarm']))
    # elige el hombro detrás y por encima del codo
    cand = [add(elbow1, v(105 + 90, L['uarm'] * PROY)), add(elbow1, v(105 - 90, L['uarm'] * PROY))]
    sh1 = min(cand, key=lambda q: q[0]) if cand[0][1] > elbow1[1] or cand[1][1] > elbow1[1] else cand[0]
    sh1 = max([q for q in cand if q[0] < elbow1[0]] or cand, key=lambda q: q[1])

    def pie_desde(theta, sh):
        ankle = add(sh, v(theta, -largo))
        return add(ankle, v(theta + PIE, -13))

    th1 = min((abs(pie_desde(5 + k * 0.01, sh1)[1]), 5 + k * 0.01) for k in range(4000))[1]
    T = (pie_desde(th1, sh1)[0], 0.0)
    # Arriba: el cuerpo gira sobre las puntas hasta estirar el brazo
    th0 = next(th1 + k * 0.01 for k in range(5000) if dist(cuerpo(th1 + k * 0.01, T)[2], P) >= brazo)
    th = lerp(th0, th1, t)
    ankle, hip, sh = cuerpo(th, T)
    elbow = codo_atras(sh, P)
    head = add(sh, v(th, L['neck']))
    knee = add(ankle, v(th, L['shin']))
    p = dict(toe=T, ankle=ankle, knee=knee, hip=hip, sh=sh, elbow=elbow, hand=P, head=head,
             banco=(P[0] - 40, P[0] + 2, P[1]))
    p['far'] = dict(p)
    p['proy'] = PROY
    return p


def flexion_pica(t):
    P = (0.0, 3.0)                      # manos en el suelo
    brazo = (L['uarm'] + L['farm']) * PROY - 0.5
    piernas = L['shin'] + L['thigh']
    # Abajo: la cabeza baja por delante de las manos formando un triángulo con ellas (coronilla a ~15 cm
    # del suelo), codo a 90°, antebrazo a ~45° del suelo hacia atrás y cadera abierta ≥ 60° arriba.
    to1 = -39.0
    head1 = (20.0, 26.0)
    sh1 = add(head1, v(to1, -L['neck']))
    hip1 = add(sh1, v(to1, -L['torso']))
    dy = hip1[1] - 9.0                   # tobillo en puntas, a 9 cm
    A = (hip1[0] - math.sqrt(piernas ** 2 - dy ** 2), 9.0)
    leg1 = ang(A, hip1)
    # Arriba: brazos estirados y en línea con el tronco (V invertida); pies y manos no se mueven
    r = brazo + L['torso']
    d = dist(P, A)
    a = (r * r - piernas * piernas + d * d) / (2 * d)
    h = math.sqrt(max(0, r * r - a * a))
    base = add(P, ((A[0] - P[0]) * a / d, (A[1] - P[1]) * a / d))
    sols = [(base[0] - h * (A[1] - P[1]) / d, base[1] + h * (A[0] - P[0]) / d),
            (base[0] + h * (A[1] - P[1]) / d, base[1] - h * (A[0] - P[0]) / d)]
    hip0 = max(sols, key=lambda q: q[1])
    leg0 = ang(A, hip0)
    to0 = ang(hip0, P)
    # el tronco se inclina antes que la cadera avanza: así el antebrazo no se tumba a mitad del recorrido
    leg = lerp(leg0, leg1, t ** 2)
    to = lerp(to0, to1, t ** 0.6)
    hip = add(A, v(leg, piernas))
    knee = add(A, v(leg, L['shin']))
    sh = add(hip, v(to, L['torso']))
    head = add(sh, v(to, L['neck']))
    elbow = codo_atras(sh, P)
    toe = add(A, (6, -A[1]))
    p = dict(toe=toe, ankle=A, knee=knee, hip=hip, sh=sh, elbow=elbow, hand=P, head=head)
    p['far'] = dict(p)
    p['proy'] = PROY
    p['cadera'] = angulo_interior(sh, hip, A)
    return p


def plancha(t):
    elbow = (0.0, 4.0)
    hand = (L['farm'], 4.0)
    sh = (0.0, 4.0 + L['uarm'])
    ankle_y = 9.0
    th = math.degrees(math.asin((sh[1] - ankle_y) / (L['shin'] + L['thigh'] + L['torso'])))
    ankle = add(sh, v(180 + th, L['shin'] + L['thigh'] + L['torso']))
    hip = add(ankle, v(th, L['shin'] + L['thigh']))
    knee = add(ankle, v(th, L['shin']))
    head = add(sh, v(th + 8, L['neck']))
    toe = (ankle[0] + 7, 0.0)
    p = dict(toe=toe, ankle=ankle, knee=knee, hip=hip, sh=sh, elbow=elbow, hand=hand, head=head,
             guia=(ankle, add(head, v(th, 4))))
    p['far'] = dict(p)
    return p


def dead_bug(t):
    sh = (0.0, 11.0)
    hip = (-L['torso'], 11.0)
    head = (18.0, 12.0)
    # lado lejano: brazo vertical y pierna que se estira; lado cercano: brazo que va atrás y pierna en mesa
    arm_near = lerp(90, 172, t)
    elbow_n = add(sh, v(arm_near, L['uarm']))
    hand_n = add(elbow_n, v(arm_near, L['farm']))
    elbow_f = add(sh, v(90, L['uarm']))
    hand_f = add(elbow_f, v(90, L['farm']))
    knee_n = add(hip, v(90, L['thigh']))
    ankle_n = add(knee_n, v(180, L['shin']))
    thigh_f = lerp(90, 168, t)
    knee_f = add(hip, v(thigh_f, L['thigh']))
    ankle_f = add(knee_f, v(lerp(180, 168, t), L['shin']))
    # nota: en el lado cercano el brazo va hacia atrás (por encima de la cabeza = derecha)
    elbow_n = add(sh, v(180 - arm_near, L['uarm']))
    hand_n = add(elbow_n, v(180 - arm_near, L['farm']))
    p = dict(sh=sh, hip=hip, head=head, elbow=elbow_n, hand=hand_n, knee=knee_n, ankle=ankle_n,
             toe=add(ankle_n, (0, 8)), tumbado=True)
    p['far'] = dict(p, elbow=elbow_f, hand=hand_f, knee=knee_f, ankle=ankle_f, toe=add(ankle_f, (-6, 6)))
    return p


EJERCICIOS = {
    'sentadilla-peso-corporal': (lambda t: sentadilla(t), N),
    'sentadilla-goblet': (lambda t: sentadilla(t, goblet=True), N),
    'flexiones-inclinadas': (flexion_inclinada, N),
    'flexiones-pica': (flexion_pica, N),
    'plancha': (plancha, 1),
    'dead-bug': (dead_bug, N),
}

# ---------------------------------------------------------------- comprobaciones


def comprobar(nombre, frames):
    errores = []
    for k, p in enumerate(frames):
        for lado in (p, p['far']):
            k_ = p.get('proy', 1)
            pares = [('hip', 'knee', L['thigh']), ('sh', 'elbow', L['uarm'] * k_), ('elbow', 'hand', L['farm'] * k_)]
            if 'ankle' in lado and not lado.get('tumbado'):
                pares.append(('knee', 'ankle', L['shin']))
            for a, b, l in pares:
                if a in lado and b in lado and abs(dist(lado[a], lado[b]) - l) > 0.6:
                    errores.append(f'{nombre} f{k + 1}: {a}-{b} mide {dist(lado[a], lado[b]):.1f} (debe {l:.1f})')
            if 'knee' in lado and 'ankle' in lado and 'hip' in lado:
                rod = angulo_interior(lado['hip'], lado['knee'], lado['ankle'])
                if rod < 40:
                    errores.append(f'{nombre} f{k + 1}: rodilla demasiado doblada ({rod:.0f}°)')
            codo = angulo_interior(lado['sh'], lado['elbow'], lado['hand'])
            if codo < 25:
                errores.append(f'{nombre} f{k + 1}: codo imposible ({codo:.0f}°)')
        if 'hip' in p and abs(dist(p['hip'], p['sh']) - L['torso']) > 0.6:
            errores.append(f'{nombre} f{k + 1}: tronco deformado')
        for punto in ('ankle', 'knee', 'hip', 'sh', 'head', 'elbow'):
            if punto in p and p[punto][1] < -0.5:
                errores.append(f'{nombre} f{k + 1}: {punto} por debajo del suelo')
    for k, p in enumerate(frames):
        if 'cadera' in p and p['cadera'] < 55:
            errores.append(f'{nombre} f{k + 1}: cadera demasiado cerrada ({p["cadera"]:.0f}°), exige mucha flexibilidad')
    if nombre.startswith('flexiones'):
        for k, p in enumerate(frames):
            if p['elbow'][1] < p['hand'][1] - 0.5:
                errores.append(f'{nombre} f{k + 1}: el codo atraviesa el apoyo')
            fa = abs(math.degrees(math.atan2(p['elbow'][1] - p['hand'][1], p['elbow'][0] - p['hand'][0])))
            if fa > 140 or fa < 40:
                errores.append(f'{nombre} f{k + 1}: antebrazo demasiado tumbado ({fa:.0f}°)')
            if p['elbow'][0] > p['hand'][0] + 2:
                errores.append(f'{nombre} f{k + 1}: el codo apunta hacia delante')
    # apoyos fijos durante el movimiento
    for punto in ('hand', 'toe') if nombre.startswith('flexiones') else ('ankle',) if nombre.startswith('sentadilla') else ():
        xs = [f[punto] for f in frames]
        if max(dist(a, xs[0]) for a in xs) > 0.8:
            errores.append(f'{nombre}: el apoyo {punto} se mueve')
    return errores


# ---------------------------------------------------------------- dibujo


def svg(frames_all, p):
    pts = []
    for f in frames_all:
        for lado in (f, f['far']):
            pts += [q for k, q in lado.items() if isinstance(q, tuple) and len(q) == 2 and isinstance(q[0], (int, float))]
        if 'banco' in f:
            pts += [(f['banco'][0], 0), (f['banco'][1], f['banco'][2])]
    xs = [q[0] for q in pts]
    ys = [q[1] for q in pts]
    minx, maxx = min(xs) - 22, max(xs) + 22
    miny, maxy = min(0, min(ys)) - 6, max(ys) + 22
    esc = min(ANCHO / (maxx - minx), (ALTO - 30) / (maxy - miny))
    ox = (ANCHO - (maxx - minx) * esc) / 2 - minx * esc
    base = ALTO - 26

    def X(q):
        return ox + q[0] * esc

    def Y(q):
        return base - q[1] * esc

    w = lambda cm: cm * esc
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{ANCHO}" height="{ALTO}" viewBox="0 0 {ANCHO} {ALTO}">',
           f'<rect width="100%" height="100%" fill="#FFFFFF"/>',
           f'<line x1="10" y1="{base:.1f}" x2="{ANCHO - 10}" y2="{base:.1f}" stroke="{SUELO}" stroke-width="3" stroke-linecap="round"/>']
    if 'banco' in p:
        x0, x1, h = p['banco']
        out.append(f'<rect x="{X((x0, 0)):.1f}" y="{Y((0, h)):.1f}" width="{w(x1 - x0):.1f}" height="{w(4):.1f}" rx="{w(1.5):.1f}" fill="{PROP}"/>')
        for xx in (x0 + 4, x1 - 4):
            out.append(f'<line x1="{X((xx, 0)):.1f}" y1="{base:.1f}" x2="{X((xx, 0)):.1f}" y2="{Y((0, h)):.1f}" stroke="{PROP}" stroke-width="{w(3):.1f}" stroke-linecap="round"/>')

    def linea(a, b, color, grosor):
        return f'<line x1="{X(a):.1f}" y1="{Y(a):.1f}" x2="{X(b):.1f}" y2="{Y(b):.1f}" stroke="{color}" stroke-width="{w(grosor):.1f}" stroke-linecap="round"/>'

    def extremidades(lado, color):
        s = []
        if 'ankle' in lado:
            s.append(linea(lado['knee'], lado['ankle'], color, 9))
            if 'toe' in lado:
                s.append(linea(lado['ankle'], lado['toe'], color, 6))
            if 'heel' in lado:
                s.append(linea(lado['ankle'], lado['heel'], color, 6))
            s.append(linea(lado['hip'], lado['knee'], color, 12))
        s.append(linea(lado['sh'], lado['elbow'], color, 8))
        s.append(linea(lado['elbow'], lado['hand'], color, 7))
        s.append(f'<circle cx="{X(lado["hand"]):.1f}" cy="{Y(lado["hand"]):.1f}" r="{w(4.2):.1f}" fill="{color}"/>')
        return s

    far = p['far']
    if far is not p:
        out += extremidades(far, FAR)
    # tronco y cabeza
    out.append(linea(p['hip'], p['sh'], NEAR, 22))
    out.append(linea(p['sh'], add(p['sh'], v(ang(p['sh'], p['head']), L['neck'] - L['head'])), NEAR, 9))
    out.append(f'<circle cx="{X(p["head"]):.1f}" cy="{Y(p["head"]):.1f}" r="{w(L["head"]):.1f}" fill="{NEAR}"/>')
    out += extremidades(p, NEAR)
    if 'mancuerna' in p:
        m = p['mancuerna']
        out.append(linea(add(m, (0, -9)), add(m, (0, 9)), '#55606E', 3.2))
        for dy in (-9, 9):
            out.append(f'<rect x="{X(m) - w(6):.1f}" y="{Y(add(m, (0, dy))) - w(3):.1f}" width="{w(12):.1f}" height="{w(6):.1f}" rx="{w(1.5):.1f}" fill="#55606E"/>')
    if 'guia' in p:
        a, b = p['guia']
        out.append(f'<line x1="{X(a):.1f}" y1="{Y(a):.1f}" x2="{X(b):.1f}" y2="{Y(b):.1f}" stroke="{GUIA}" stroke-width="3" stroke-dasharray="10 8" stroke-linecap="round"/>')
    out.append('</svg>')
    return '\n'.join(out)


def webp(svg_texto, ruta, color=False):
    png = subprocess.run(['rsvg-convert', '-w', str(ANCHO)], input=svg_texto.encode(), capture_output=True, check=True).stdout
    Image.open(io.BytesIO(png)).convert('RGB' if color else 'L').save(ruta, 'WEBP', quality=82, method=6)


def main():
    hoja = []
    fallos = []
    for nombre, (f, n) in EJERCICIOS.items():
        ts = [suave(i / (n - 1)) if n > 1 else 0 for i in range(n)]
        frames = [f(t) for t in ts]
        fallos += comprobar(nombre, frames)
        for i, p in enumerate(frames):
            texto = svg(frames, p)
            ruta = f'public/academia/{nombre}-{i + 1}.webp'
            webp(texto, ruta, color='guia' in p)
            if i in (0, n // 2, n - 1):
                hoja.append(ruta)
    if fallos:
        print('✗ Comprobaciones biomecánicas:\n  ' + '\n  '.join(fallos))
        sys.exit(1)
    print(f'✓ {len(EJERCICIOS)} ejercicios generados y comprobados')
    if '--hoja' in sys.argv:
        ims = [Image.open(r) for r in hoja]
        cols = 3
        filas = math.ceil(len(ims) / cols)
        ims = [im.convert('L') for im in ims]
        hojaim = Image.new('L', (ANCHO * cols, ALTO * filas), 255)
        for k, im in enumerate(ims):
            hojaim.paste(im, ((k % cols) * ANCHO, (k // cols) * ALTO))
        hojaim.save('/tmp/forja-hoja.png')


if __name__ == '__main__':
    main()
