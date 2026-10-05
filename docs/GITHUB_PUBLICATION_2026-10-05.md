# Preparación para GitHub — 2026-10-05

## Estado comprobado

- Remoto: `SyST3MH4CCH1/phone-farm-platform`, **público**, rama principal `main` (consulta de GitHub CLI el 2026-10-05).
- Rama local de trabajo: `feat/ui-ops-control-hub-v2`. Este informe no implica que los cambios locales estén publicados.
- Se retiró `estructura.txt`, un volcado de 2 MB y más de 45 000 líneas con el listado de archivos de una máquina local; se agregó al `.gitignore`.
- Se retiraron las capturas PNG antiguas situadas directamente en `docs/`. Dos de ellas mostraban identificadores de dispositivos y nombres de cuentas; una mostraba configuración de proxies. No estaban referenciadas por el código ni por los documentos vigentes.
- Se sustituyó el nombre de usuario local en once documentos Markdown por `%USERPROFILE%`.
- Se detectó un ZIP de exportación local de 1,7 GB en la raíz. Se conserva en la máquina y el patrón `*.zip` impide que entre en Git.
- Cuatro notas/prompts de ejecución que no usa el producto permanecen en el equipo, ignorados por Git.
- `.gitignore` protege `.env`, bases de datos, claves privadas, copias de seguridad, datos de ejecución, artefactos de prueba y `SECRETS-LOCAL.md`. Los ejemplos `.env.example` siguen versionados sin valores operativos.
- La lista de exclusiones de Gitleaks quedó limitada a fixtures de pruebas; ya no excluye componentes de producción completos.
- CI ahora se ejecuta también al subir ramas `feat/**` y `codex/**`, y bloquea ante hallazgos de Gitleaks en historial y árbol actual.

## Evidencia local

| Verificación | Resultado |
| --- | --- |
| Gitleaks 8.30.1, historial con reglas estrictas sin exclusiones | 110 commits; cinco coincidencias en cadenas ficticias de `test/redact-secrets.test.ts`; ningún otro hallazgo |
| Gitleaks 8.30.1, historial con allowlist limitada | 110 commits; cero hallazgos |
| Gitleaks, copia de los 237 archivos candidatos del árbol de trabajo | Cero hallazgos con allowlist limitada; con reglas estrictas, únicamente las mismas cinco cadenas ficticias del test |
| `npm run typecheck` | Pasa |
| `npm test` | 15 archivos, 200 pruebas pasan |
| `npm run build` | Pasa; aviso de bundle principal de 865 kB |
| `platform/.venv/Scripts/python.exe -m pytest platform/tests -q` | 75 pruebas pasan; tres avisos de dependencias |
| `git diff --check` | Pasa; solo avisos de conversión de finales de línea |

Las primeras ejecuciones de Vite y pytest dentro del aislamiento local fallaron por permisos de lectura y escritura de archivos temporales. Las mismas suites pasaron al ejecutarlas con acceso normal al repositorio. No hay ejecución de CI en GitHub para estos cambios hasta que se suba una rama.

## Riesgo histórico que sigue abierto

El remoto ya era público cuando comenzó esta preparación. Retirar capturas y rutas del árbol actual **no las borra de commits anteriores, forks, clones ni cachés**. Algunas capturas antiguas incluían nombres de cuenta e identificadores de dispositivos. No se ha comprobado si esos identificadores pertenecen a cuentas o dispositivos operativos actuales. Los informes de seguridad de agosto y septiembre también mencionan claves de terceros expuestas y no permiten confirmar su rotación actual. La revisión local de Gitleaks no sustituye la rotación de claves ni detecta texto sensible dentro de imágenes.

Antes de considerar saneado el historial público, el propietario debe decidir y coordinar una reescritura del historial, revisar copias/forks y confirmar la rotación de las claves Pexels, MiniMax y cualquier otra clave antigua. No se ha hecho `force push`, borrado de ramas remotas ni cambio de visibilidad del repositorio.

## Publicación y lanzamiento

Este árbol puede prepararse como cambio revisable y subirse a una rama para ejecutar CI. **No se debe describir el repositorio público como libre de datos históricos** hasta cerrar el punto anterior. Tampoco debe confundirse la publicación del código con el lanzamiento del servicio: [LAUNCH_READINESS_2026-10-05.md](LAUNCH_READINESS_2026-10-05.md) mantiene `NO_GO` para el MVP público por el flujo real de generación y publicación aún no verificado.
