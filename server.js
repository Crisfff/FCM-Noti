import express from "express";
import fetch from "node-fetch";
import { JWT } from "google-auth-library";

const PORT = process.env.PORT || 3000;

/**
 * Env vars en Render:
 *  - GOOGLE_SERVICE_ACCOUNT_JSON  (pega el JSON completo de la cuenta de servicio)
 *  - PROJECT_ID                   (project_id de Firebase)
 *  - API_KEY_SIMPLE               (por ej. cris123)
 */
const rawSvc = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "{}";
const svc = JSON.parse(rawSvc);
const PROJECT_ID = process.env.PROJECT_ID || "";
const API_KEY_SIMPLE = process.env.API_KEY_SIMPLE || "cris123";

if (!svc.client_email || !svc.private_key || !PROJECT_ID) {
  console.error("Falta configuración: GOOGLE_SERVICE_ACCOUNT_JSON o PROJECT_ID");
  process.exit(1);
}

// Normaliza saltos de línea de la clave privada si vienen escapados
const normalizedKey = svc.private_key.replace(/\\n/g, "\n");

const client = new JWT({
  email: svc.client_email,
  key: normalizedKey,
  scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
});

async function getAccessToken() {
  const { access_token } = await client.authorize();  // <-- propiedad correcta
  return access_token;
}

const app = express();

// Parsers para texto y x-www-form-urlencoded
app.use(express.text({ type: ["text/plain", "text/*"], limit: "100kb" }));
app.use(express.urlencoded({ extended: false, limit: "100kb" }));

app.get("/", (_req, res) => res.json({ ok: true, service: "fcm-bridge-v1" }));

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
      body  = (parts.slice(2).join("\n") || "").trim();
    }

    if (!token || !title || !body) {
      return res.status(400).json({ error: "faltan_campos", detail: "token, title y body son obligatorios" });
    }

    // Payload FCM v1
    const message = {
      message: {
        token,
        notification: { title, body },
        data: {}
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
    res.status(r.status).type("application/json").send(text);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
});

app.listen(PORT, () => console.log("FCM bridge listening on", PORT));
