# FCM Bridge v1 (Render)

Bridge HTTP para enviar notificaciones **FCM HTTP v1** por **token** sin exponer credenciales en clientes.

## Configuración (Render → Environment)
- `GOOGLE_SERVICE_ACCOUNT_JSON`: **contenido completo** del JSON de la cuenta de servicio (copiar/pegar).
- `PROJECT_ID`: ID del proyecto Firebase (ej: my-firebase-app).
- `API_KEY_SIMPLE`: clave simple (ej: `cris123`).

## Endpoints
- `GET /` → salud: `{ ok: true }`
- `POST /send` (requiere header `x-api-key`)

### Formatos aceptados (solo texto)

1) **application/x-www-form-urlencoded**
