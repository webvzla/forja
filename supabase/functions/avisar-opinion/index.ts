// @ts-nocheck
/* eslint-disable */
// © 2026 FORJA · Licencia: ver LICENSE y NOTICE.md.
// Edge Function `avisar-opinion` (Deno, Supabase). La llama el disparador de `beta_opiniones` (migración 9) con pg_net y manda UN correo
// al titular. Se despliega con verify_jwt = false porque quien llama es la base de datos, no una persona: la protege un SECRETO
// COMPARTIDO en la cabecera `x-forja-aviso` (el mismo que está en Vault, `aviso_opiniones_secreto`).
//
// Secretos de la función (Supabase → Edge Functions → Secrets; NUNCA en este archivo ni en Git):
//   AVISO_SECRETO       secreto compartido (≥ 32 caracteres), copiado de Vault
//   AVISO_SMTP_USUARIO  cuenta de Gmail que envía (la dedicada de FORJA)
//   AVISO_SMTP_CLAVE    contraseña de APLICACIÓN de esa cuenta (nunca la contraseña normal)
//   AVISO_DESTINO       (opcional) a quién avisar; por defecto, la misma cuenta
// Gmail por el puerto 465 (TLS implícito): las Edge Functions bloquean salidas a los puertos 25 y 587.
import nodemailer from 'npm:nodemailer@6.9.16';

import { construirCorreo, secretoValido, validarAviso } from './correo.ts';

const json = (status: number, cuerpo: unknown) => new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'método no permitido' });
  if (!secretoValido(req.headers.get('x-forja-aviso'), Deno.env.get('AVISO_SECRETO'))) return json(401, { error: 'no autorizado' });

  const bruto = await req.text();
  if (bruto.length > 2048) return json(413, { error: 'demasiado grande' });
  let aviso;
  try {
    aviso = validarAviso(JSON.parse(bruto));
  } catch {
    aviso = null;
  }
  if (!aviso) return json(400, { error: 'aviso no válido' });

  const usuario = Deno.env.get('AVISO_SMTP_USUARIO');
  const clave = Deno.env.get('AVISO_SMTP_CLAVE');
  if (!usuario || !clave) return json(500, { error: 'faltan los datos del correo' });
  const destino = Deno.env.get('AVISO_DESTINO') || usuario;
  const ref = new URL(Deno.env.get('SUPABASE_URL') ?? 'https://x.invalid').hostname.split('.')[0];
  const { asunto, texto, html } = construirCorreo(aviso, ref);

  try {
    const transporte = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: usuario, pass: clave } });
    await transporte.sendMail({ from: `FORJA BETA <${usuario}>`, to: destino, subject: asunto, text: texto, html });
    return json(200, { ok: true });
  } catch (e) {
    console.error('no se pudo enviar el aviso:', e instanceof Error ? e.message : 'error');
    return json(502, { error: 'no se pudo enviar' });
  }
});
