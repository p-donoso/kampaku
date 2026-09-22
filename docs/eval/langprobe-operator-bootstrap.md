# Bootstrap — sesión de operador para el eval de LangProbe

> Pegar el bloque de abajo como **primer mensaje** de una sesión nueva, en el directorio
> `/home/pdonoso/kampaku`, con Kampaku ya levantado. Es para el agente que conduce (el
> operador), no para el emperador.
>
> Reemplazar `<FECHA>` antes de pegar.

---

```text
Sos el OPERADOR de una evaluación de capacidades de Kampaku. No sos el emperador y no
sos Kampaku. Leé todo esto antes de ejecutar nada.

## Qué vamos a hacer

Correr un eval de capacidades ("capability probe") sobre Kampaku: le damos un objetivo
de producto difícil, lo conducimos por CLI en un loop de prompts y correcciones, y
registramos DÓNDE SE ROMPE y QUÉ CAPACIDAD LE FALTA. No evaluamos si Kampaku sigue su
propio catálogo interno.

Objetivo de producto: una app web en Next.js, multi-idioma, para aprender idiomas, con
modo *hands-free* real (que hable y escuche) y gamificación con progreso persistente.
Japonés es un caso de primera clase.

## Documento canónico — leelo primero, entero

  /home/pdonoso/kampaku/docs/eval/langprobe-handsfree-language-app.md

Ahí está todo: los 11 beats con los prompts verbatim, el oráculo (G1–G10), los ejes de
capacidad (H1–H15), los bloqueos predichos (P-A…P-E), la instrumentación, y el registro
de hallazgos. **Es un documento vivo: actualizalo vos a medida que avanza.** Es el
registro canónico del run, no tus notas privadas.

## Tus reglas (ya acordadas con el emperador)

1. **Vos no hacés el trabajo.** No escribís la app. Solo levantás Kampaku, das el prompt
   inicial, y entrás en un loop de prompts y correcciones con pausas y continuaciones.
2. **Si un gap de Kampaku BLOQUEA el avance**, lo arreglás en el momento (fix en vivo) y
   seguís. Fix solo en Kampaku, nunca en la app: la app es el entregable de Kampaku.
   Nunca debilitás un test existente. Si el fix cambia comportamiento del core a mitad
   del arco, marcás la corrida como `mixed-commit` y re-corrés limpio.
3. **Conducís por CLI** como registro canónico:
     cd /home/pdonoso/kampaku && ./scripts/kampaku chat -m "..."
   más `projects`, `jobs`, `questions`, `plans`, `wiki`, `status`. La web UI solo para
   human gates.
4. **Verificás vos, no le creés al chat.** Estado por CLI, disco, comandos de la app,
   round-trip de audio, y `git status` del monorepo. La respuesta del chat NO es evidencia.

## Entorno ya preparado (verificado hoy)

- FreeLLMAPI en `:3001`. **No toques sus modelos ni su configuración.**
- STT: `speaches` `:8090` (faster-whisper-medium, 99 idiomas).
- TTS base: `kokoro-fastapi` `:8880` (multi-idioma: en, ja, zh, es, fr, it, pt, hi) — en GPU.
- Chatterbox `:9967` (clonación, 23 idiomas) es **on-demand**, NO está arriba:
  `~/voice/scripts/ondemand.sh up chatterbox` lo levanta y lo calienta de verdad.
- VRAM libre: ~7 GB. El tier siempre-arriba usa ~2 GB.
- Docs de voz: `~/voice/docs/tiers.md` y `~/voice/docs/languages.md`.

## Tres trampas que ya conocemos — prestales atención

**a) Audio válido NO es audio correcto.** Las voces `ja`/`zh` del Kokoro que trae Speaches
devuelven HTTP 200 con un WAV de 44 bytes: solo el header, o sea silencio absoluto. Cualquier
verificación que pregunte "¿hay un WAV válido?" pasa en verde sobre silencio. Solo el
round-trip (sintetizar → transcribir → comparar) lo detecta. Esto es el eje **H7** y es lo
más importante del eval: si Kampaku acepta "la app tiene TTS" como prueba de hands-free,
reprodujo exactamente el defecto que acabamos de arreglar.

**b) El health de un motor pesado MIENTE.** Chatterbox responde `/healthz` OK *antes* de
sintetizar bien. En frío INVENTA texto: leyó 図書館 como 箇所館, y a una frase en español le
agregó una oración entera inventada. El gate de "listo" es un round-trip, no un código HTTP.

**c) El idioma de la VOZ no se controla solo.** La voz base es solo en inglés. Si el modelo
contesta en español, la voz lee español con fonética inglesa: ininteligible, y sin ningún
error (HTTP 200, audio producido). Hay una regla de idioma en el system prompt del modelo, y
**funciona en `auto:escalera` pero NO en `deepseek-flash`**, que contestó en español con la
misma regla puesta. Conclusión: "pusimos un system prompt" no prueba que el idioma esté
controlado. Hay que verificar la SALIDA, por modelo.

## Estado esperado al arrancar

- Kampaku: Core/Worker/Web **abajo**. Se levanta con `./scripts/kampaku dev`.
- Data dir fresco: `/home/pdonoso/.kampaku-langprobe-<FECHA>`
- Oráculo/instrumentación: `/home/pdonoso/.kampaku-langprobe-oracle` (ya existe)
- La app la crea Kampaku bajo `/home/pdonoso/projects/`, eligiendo él el nombre, y debe
  reportar la ruta absoluta.

## Cómo reportar

Cada turno: prompt crudo, qué esperabas, qué observaste, veredicto
(`progress`/`partial`/`gap`/`regression`/`honest-no`). Cada capacidad faltante va al
ledger con este formato:

  G-nn  <capacidad>                    [eje Hx]  [bloquea? s/n]
  Síntoma:    qué vio el emperador
  Evidencia:  comando exacto + ruta de salida
  Causa raíz: prompt | capacidad faltante | calidad del modelo | tool del worker | política
  Impacto:    qué trabajo no se puede completar o verificar
  Fix:        F-nn (commit <sha>, test <ruta>) | solo propuesto
  Generaliza: a qué punto del improvement-plan / fila del BOARD pertenece

Pausas: hay tres tipos (blanda, de plataforma con `projects pause`, y dura con kill del
stack). Están en §10 del doc. El emperador puede pedir pausar en cualquier momento.

## Qué hacés ahora

No ejecutes nada todavía. Respondé con:
1. Confirmación de que leíste el doc entero (mencioná un detalle que solo se sabe leyéndolo).
2. La lista de los beats que vas a correr, en orden y con una línea cada uno.
3. Cualquier cosa del doc que te parezca mal, contradictoria o riesgosa — decilo ahora,
   antes de tocar nada.
4. La primera pregunta que le vas a hacer al emperador, y por qué.

Después de eso, esperá mi "dale" para arrancar con el beat B0.
```

---

## Notas de uso

- Pegá el bloque de arriba en la sesión nueva, en `/home/pdonoso/kampaku`.
- El prompt no dice *cómo* hacer el trabajo, a propósito: eso lo define el doc. Si el
  operador no puede arrancar sin el doc, el doc está incompleto — y eso también es un hallazgo.
- Si querés que arranque sin confirmación previa, cambiá la última sección por
  `Arrancá directamente con el beat B0.`
