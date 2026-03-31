import fs from "fs";
import handler from "./api/pncp-search.js";

function loadEnvFile(path = ".env") {
  if (!fs.existsSync(path)) return;
  const content = fs.readFileSync(path, "utf-8");
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
    const idx = line.indexOf("=");
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function createMockRes() {
  const res = {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.payload = data;
      return this;
    }
  };
  return res;
}

async function run() {
  loadEnvFile(".env");

  const req = {
    method: "POST",
    body: {
      fullSync: true
    }
  };

  const res = createMockRes();
  await handler(req, res);

  if (res.statusCode !== 200) {
    console.error("SYNC_ERROR", JSON.stringify(res.payload || {}, null, 2));
    process.exit(1);
  }

  const validated = Array.isArray(res.payload?.validated) ? res.payload.validated : [];

  console.log(`SYNC_OK inserted=${res.payload?.inserted ?? 0} validated=${validated.length}`);
  for (const item of validated) {
    console.log(
      [
        item.pncp_id || "sem-pncp-id",
        item.status || "sem-status",
        item.organization_name || "orgao-nao-informado",
        item.municipio_orgao || "municipio-nao-informado",
        item.title || "sem-titulo"
      ].join(" | ")
    );
  }
}

run().catch((err) => {
  console.error("SYNC_FATAL", err?.message || err);
  process.exit(1);
});
