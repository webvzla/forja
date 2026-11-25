// Cargador para las pruebas: ejecuta los .ts de src/ con Node, sin instalar nada más.
// - Resuelve imports sin extensión ('./datos' → './datos.ts').
// - Transpila TypeScript con el `typescript` del proyecto (elimina los imports de solo tipos).
// - Sustituye AsyncStorage (solo existe en el móvil) por una memoria falsa.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const STUB_ASYNCSTORAGE = 'data:text/javascript,const m=new Map();export default {getItem:async k=>m.get(k)??null,setItem:async(k,v)=>{m.set(k,v)},removeItem:async k=>{m.delete(k)}};';

export async function resolve(specifier, context, next) {
  if (specifier === '@react-native-async-storage/async-storage') return { url: STUB_ASYNCSTORAGE, shortCircuit: true };
  if (/^\.\.?\//.test(specifier) && !/\.[cm]?[jt]sx?$/.test(specifier)) {
    try {
      return await next(`${specifier}.ts`, context);
    } catch {
      /* se prueba tal cual */
    }
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (url.startsWith('file:') && url.endsWith('.ts')) {
    const fuente = readFileSync(fileURLToPath(url), 'utf8');
    const { outputText } = ts.transpileModule(fuente, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: false },
      fileName: fileURLToPath(url),
    });
    return { format: 'module', source: outputText, shortCircuit: true };
  }
  return next(url, context);
}
