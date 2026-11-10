const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// Simple .env loader for local development
function loadEnv() {
  const envFiles = ['.env', '.env.local', '.env.development.local'];
  for (const envFile of envFiles) {
    const envPath = path.join(__dirname, envFile);
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.substring(0, eqIdx).trim();
          let val = trimmed.substring(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.substring(1, val.length - 1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      });
    }
  }
}
loadEnv();

const PORT = process.env.PORT || 3000;
const BASE_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
};

// Helper to mock Vercel serverless request/response methods locally
function augmentRes(res) {
  res.status = function (code) {
    res.statusCode = code;
    return res;
  };
  res.json = function (data) {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(data));
    return res;
  };
  res.send = function (data) {
    res.end(data);
    return res;
  };
  return res;
}

const server = http.createServer(async (req, res) => {
  augmentRes(res);
  const parsedUrl = url.parse(req.url, true);
  let reqPath = decodeURI(parsedUrl.pathname);

  // Security: block direct HTTP access to /private
  if (reqPath.startsWith('/private')) {
    return res.status(403).send('403 Forbidden');
  }

  // Handle API serverless routes locally
  if (reqPath === '/api/create-checkout-session') {
    const handler = require('./api/create-checkout-session');
    let bodyData = '';
    req.on('data', (c) => (bodyData += c));
    req.on('end', async () => {
      try {
        req.body = bodyData ? JSON.parse(bodyData) : {};
      } catch (e) {
        req.body = {};
      }
      req.query = parsedUrl.query;
      try {
        await handler(req, res);
      } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
      }
    });
    return;
  }

  if (reqPath === '/api/verify-session') {
    const handler = require('./api/verify-session');
    req.query = parsedUrl.query;
    try {
      await handler(req, res);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
    return;
  }

  if (reqPath === '/api/download') {
    const handler = require('./api/download');
    req.query = parsedUrl.query;
    try {
      await handler(req, res);
    } catch (e) {
      console.error(e);
      res.status(500).send(e.message);
    }
    return;
  }

  if (reqPath === '/api/webhook' || reqPath === '/api/stripe/webhook') {
    const handler = require('./api/webhook');
    req.query = parsedUrl.query;
    try {
      await handler(req, res);
    } catch (e) {
      console.error(e);
      res.status(500).send(e.message);
    }
    return;
  }

  // Route clean URLs
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  } else if (reqPath === '/uspeh') {
    reqPath = '/uspeh.html';
  } else if (reqPath === '/preklic') {
    reqPath = '/preklic.html';
  }

  const safePath = path.normalize(path.join(BASE_DIR, reqPath));
  if (!safePath.startsWith(BASE_DIR)) {
    return res.status(403).send('403 Forbidden');
  }

  fs.stat(safePath, (err, stats) => {
    if (err || !stats.isFile()) {
      return res.status(404).send('404 Not Found');
    }

    const ext = path.extname(safePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(safePath).pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});
