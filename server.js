// server.js
import express from "express";
import { JWT } from "google-auth-library";

// Si la plataforma ya trae fetch (Node 18+), úsalo.
// Si no, descomenta la siguiente línea e instala node-fetch:
// import fetch from "node-fetch";

const PORT = process.env.PORT || 3000;

/**
 * ENV esperadas (configúralas en Render):
 *  - GOOGLE_SERVICE_ACCOUNT_JSON  -> JSON COMPLETO de la cuenta de servicio
 *  - PROJECT_ID                   -> project_id de Firebase (ej: my-project-123)
 *  - API_KEY_SIMPLE               -> clave simple para proteger el endpoint (ej: cris123)
 */
const rawSvc = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "{}";
let svc;
try {
  svc = JSON.parse(rawSvc);
} catch {
  console.error("GOOGLE_SERVICE_ACCOUNT_JSON no es un JSON válido");
  process.exit(1);
}
const PROJECT_ID = process.env.PROJECT_ID || "";
const API_KEY_SIMPLE = process.env.API_KEY_SIMPLE || "cris123";

if (!svc?.client_email || !svc?.private_key || !PROJECT_ID) {
  console.error("Falta configuración: GOOGLE_SERVICE_ACCOUNT_JSON o PROJECT_ID");
  process.exit(1);
}

// Normaliza saltos de línea en la clave privada
const normalizedKey = svc.private_key.replace(/\\n/g, "\n");

// Cliente OAuth2 con el scope de FCM
const client = new JWT({
  email: svc.client_email,
  key: normalizedKey,
  scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
});

async function getAccessToken() {
  const { access_token } = await client.authorize();
  return access_token;
}

const app = express();

// Parsers: aceptamos JSON, x-www-form-urlencoded y texto plano (líneas)
app.use(express.json({ limit: "200kb" }));
app.use(express.urlencoded({ extended: false, limit: "200kb" }));
app.use(express.text({ type: ["text/plain", "text/*"], limit: "200kb" }));

// Salud
app.get("/", (_req, res) => res.json({ ok: true, service: "fcm-bridge-v1" }));

/**
 * POST /send
 * Header obligatorio:  x-api-key: <API_KEY_SIMPLE>
 *
 * Body admitido:
 *  - JSON: { "token":"...", "title":"...", "body":"..." }
 *  - x-www-form-urlencoded: token=...&title=...&body=...
 *  - text/plain (3 líneas): <token>\n<title>\n<body...>
 */
app.post("/send", async (req, res) => {
  try {
    if ((req.header("x-api-key") || "") !== API_KEY_SIMPLE) {
      return res.status(401).json({ error: "unauthorized" });
    }

    let token = "";
    let title = "";
    let body = "";

    const ct = (req.header("content-type") || "").toLowerCase();

    if (ct.includes("application/json")) {
      token = (req.body?.token || "").trim();
      title = (req.body?.title || "").trim();
      body  = (req.body?.body  || "").trim();
    } else if (ct.includes("application/x-www-form-urlencoded")) {
      token = (req.body.token || "").trim();
      title = (req.body.title || "").trim();
      body  = (req.body.body  || "").trim();
    } else {
      // text/plain por líneas
      const text = String(req.body || "");
      const parts = text.split(/\r?\n/);
      token = (parts[0] || "").trim();
      title = (parts[1] || "").trim();
      body  = (parts.slice(2).join("\n") || "").trim();
    }

    if (!token || !title || !body) {
      return res
        .status(400)
        .json({ error: "faltan_campos", detail: "token, title y body son obligatorios" });
    }

    // Payload FCM v1 (como la consola)
    const message = {
      message: {
        token,
        notification: { title, body },
        data: {} // opcional
      }
    };

    const accessToken = await getAccessToken();

    const url = `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`;
    const r = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify(message),
    });

    const text = await r.text();
    // FCM responde JSON; lo pasamos tal cual con el status original
    res.status(r.status).type("application/json").send(text);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

app.listen(PORT, () => {
  console.log("FCM bridge listening on", PORT);
});
