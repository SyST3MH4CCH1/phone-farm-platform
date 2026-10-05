# Acceso oficial para publicar — tarea externa pendiente

Estado: **PENDIENTE**, 2026-10-05. No se han conectado cuentas ni ejecutado publicaciones.

## TikTok

1. Registrar la aplicación en [TikTok for Developers](https://developers.tiktok.com/docs/en/getting-started-create-an-app), verificar dominio, redirect URI, política de privacidad y términos.
2. Solicitar Content Posting API y `video.upload` para subir borradores que el titular complete en TikTok. Solicitar `video.publish` solo si el producto necesita publicación directa, con la revisión exigida por TikTok [fuente](https://developers.tiktok.com/docs/en/content-posting-api-get-started).
3. Registrar una cuenta propia autorizada mediante OAuth y comprobar scopes concedidos. No copiar tokens al repositorio ni a mensajes.
4. Confirmar cuotas de publicación de esa cuenta; el límite de inicialización por token **no** sustituye la cuota diaria de posts.

## Meta / Instagram

1. Registrar app en Meta for Developers y obtener acceso oficial a la documentación de [Instagram Platform](https://developers.facebook.com/docs/instagram-platform/content-publishing/).
2. Confirmar tipo de cuenta admitido, método de login, scopes mínimos, revisión, cuotas de publicaciones/peticiones y respuestas de error vigentes. La documentación oficial devolvió HTTP 429 durante esta investigación.
3. Autorizar una cuenta propia por OAuth y almacenar tokens cifrados en la base de datos, con scopes mínimos y rotación/revocación comprobadas.

## Criterio para cerrar esta tarea

- App y permisos aprobados en ambas plataformas, cuentas propias autorizadas y cuotas confirmadas con URL/fecha en `WARMUP_SYSTEM.md`.
- Conector oficial implementado y probado en modo simulación, sin exponer tokens a UI/logs.
- Primera prueba real propuesta al titular y autorizada explícitamente antes de ejecutarla.
