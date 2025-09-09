import express from "express";
import fetch from "node-fetch";
import { JWT } from "google-auth-library";

const PORT = process.env.PORT || 3000;

/**
 * CONFIG POR AMBIENTE (NO SUBAS CREDENCIALES AL REPO)
 * - GOOGLE_SERVICE_ACCOUNT_JSON: Pega aquí (en Render → Environment) el JSON COMPLETO de la cuenta de servicio.
 * - PROJECT_ID: el Project ID de Firebase (ej: my-firebase-app)
 * - API_KEY_SIMPLE: clave simple para proteger el endpoint (ej: cris123)
 */
const svc = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "{}");
const PROJECT_ID = process.env.PROJECT_ID || "";
const API_KEY_SIMPLE = process.env.API_KEY_SIMPLE || "cris123";

if (!svc.client_email || !svc.private_key || !PROJECT_ID) {
  console.error("Falta configuración: GOOGLE_SERVICE_ACCOUNT_JSON o PROJECT_ID");
  process.exit(1);
}

// OAuth2 con cuenta de servicio (scope de FCM)
const client = new JWT({
  email: svc.client_email,
  key: svc.private_key,
  scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
});

async function getAccessToken() {
  const { token } = await client.authorize();
  return token;
}

const app = express();

// Aceptar texto sin formato y x-www-form-urlencoded
app.use(express.text({ type: ["text/plain", "text/*"], limit: "100kb" }));
app.use(express.urlencoded({ extended: false, limit: "100kb" })); // token=...&title=...&body=...

// Salud
app.get("/", (_req, res) => res.json({ ok: true, service: "fcm-bridge-v1" }));

/**
 * POST /send
 * Seguridad simple: header x-api-key debe coincidir con API_KEY_SIMPLE
 *
 * ACEPTA DOS FORMATOS (ambos son TEXTO):
 * 1) application/x-www-form-urlencoded
 *    token=AAA&title=Hola&body=Mensaje
 *
 * 2) text/plain (líneas)
 *    <token>\n
 *    <title>\n
 *    <body>
 */
app.post("/send", async (req, res) => {
  try {
    // Auth simple
    if ((req.header("x-api-key") || "") !== API_KEY_SIMPLE) {
      return res.status(401).json({ error: "unauthorized" });
    }

    let token = "";
    let title = "";
    let body = "";

    const ct = (req.header("content-type") || "").toLowerCase();

    if (ct.includes("application/x-www-form-urlencoded")) {
      token = (req.body.token || "").trim();
      title = (req.body.title || "").trim();
      body  = (req.body.body  || "").trim();
    } else {
      // text/plain por líneas
      const text = String(req.body || "");
      const parts = text.split(/\r?\n/);
      token = (parts[0] || "").trim();
      title = (parts[1] || "").trim();
      body  = (parts.slice(2).join("\n") || "").trim(); // permite multi-línea en el cuerpo
    }

    if (!token || !title || !body) {
      return res.status(400).json({ error: "faltan_campos", detail: "token, title y body son obligatorios" });
    }

    // Construir payload v1 (igual a la consola)
    const message = {
      message: {
        token,
        notification: { title, body },
        data: {} // opcional: puedes agregar pares clave-valor aquí si algún día lo necesitas
      }
    };

    // Token OAuth y llamada a FCM v1
    const accessToken = await getAccessToken();
    const url = `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`;

    const r = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8"
      },
      body: JSON.stringify(message)
    });

    const text = await r.text();
    res.status(r.status).type("application/json").send(text);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

app.listen(PORT, () => console.log("FCM bridge listening on", PORT));
