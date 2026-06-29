const fs = require("fs");
const http = require("http");
const path = require("path");

const root = __dirname;
const port = Number(process.env.PORT || 5500);
const host = "127.0.0.1";

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

function send(response, statusCode, body, contentType) {
  response.writeHead(statusCode, {
    "Content-Type": contentType || "text/plain; charset=utf-8"
  });
  response.end(body);
}

function resolveRequestPath(url) {
  const requestUrl = new URL(url, `http://${host}:${port}`);
  const pathname = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;

  if (pathname.startsWith("/data/")) {
    return null;
  }

  const filePath = path.resolve(root, `.${decodeURIComponent(pathname)}`);

  if (!filePath.startsWith(root)) {
    return null;
  }

  return filePath;
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;

      if (body.length > 1024 * 1024) {
        request.destroy();
        reject(new Error("PAYLOAD_TOO_LARGE"));
      }
    });

    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

async function saveAccessLog(request, response) {
  try {
    const body = await readRequestBody(request);
    const input = JSON.parse(body || "{}");
    const phone = String(input.phone || "").replace(/\D/g, "");

    if (phone.length < 10 || phone.length > 15) {
      send(response, 400, JSON.stringify({ ok: false, error: "INVALID_PHONE" }), "application/json; charset=utf-8");
      return;
    }

    const directory = path.join(root, "data");
    const file = path.join(directory, "accesos.json");
    fs.mkdirSync(directory, { recursive: true });

    let records = [];

    if (fs.existsSync(file)) {
      const current = fs.readFileSync(file, "utf8");
      records = JSON.parse(current || "[]");
    }

    if (!Array.isArray(records)) {
      records = [];
    }

    const entry = {
      phone,
      phoneDisplay: `+${phone}`,
      authorizedAt: new Date().toISOString(),
      source: String(input.source || "unknown").replace(/[^a-z0-9_-]/gi, "")
    };

    records.push(entry);
    fs.writeFileSync(file, `${JSON.stringify(records, null, 2)}\n`);
    send(response, 200, JSON.stringify({ ok: true, entry }), "application/json; charset=utf-8");
  } catch (error) {
    send(response, 500, JSON.stringify({ ok: false, error: "SAVE_FAILED" }), "application/json; charset=utf-8");
  }
}

const server = http.createServer((request, response) => {
  if (request.method === "POST" && new URL(request.url, `http://${host}:${port}`).pathname === "/guardar-acceso.php") {
    saveAccessLog(request, response);
    return;
  }

  const filePath = resolveRequestPath(request.url);

  if (!filePath) {
    send(response, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      send(response, 404, "Not found");
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    send(response, 200, content, mimeTypes[extension] || "application/octet-stream");
  });
});

server.listen(port, host, () => {
  console.log(`Servidor listo en http://${host}:${port}`);
});
