export const LIVENESS_UI_HTML = `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="referrer" content="no-referrer" />
  <title>Verifikasi Wajah SIPANDU</title>
  <link rel="stylesheet" href="https://esm.sh/@aws-amplify/ui-react@6.15.7/styles.css" />
  <style>
    :root{color-scheme:light;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
    *{box-sizing:border-box}
    body{margin:0;background:transparent;color:#10243a}
    #root{min-height:300px}
    .live-shell{width:100%;max-width:720px;margin:0 auto;padding:10px}
    .live-note{margin:0 0 10px;padding:12px 14px;border:1px solid #cbd5e1;border-radius:12px;background:#f8fafc;color:#334155;font-size:13px;line-height:1.5}
    .live-error{padding:14px;border:1px solid #fca5a5;border-radius:12px;background:#fef2f2;color:#991b1b;font-size:13px}
    .live-loading{padding:28px 14px;text-align:center;border:1px solid #cbd5e1;border-radius:12px;background:#f8fafc;font-size:14px}
    .amplify-liveness-detector{width:100%}
  </style>
</head>
<body>
  <main id="root" aria-live="polite">
    <div class="live-loading">Menyiapkan kamera verifikasi…</div>
  </main>
  <script type="module" src="/liveness/ui.js"></script>
</body>
</html>`;

export const LIVENESS_UI_JS = `import React, { useEffect, useRef, useState } from "https://esm.sh/react@19.0.1";
import { createRoot } from "https://esm.sh/react-dom@19.0.1/client?deps=react@19.0.1";
import { FaceLivenessDetectorCore } from "https://esm.sh/@aws-amplify/ui-react-liveness@3.7.0?deps=react@19.0.1,react-dom@19.0.1,aws-amplify@6.15.9";

const allowedParents = new Set([
  "https://sipandu.aryprayoga139.workers.dev",
  "https://sipanduodhiv.my.id",
  "https://localhost",
  "http://localhost",
  "http://localhost:3000",
  "capacitor://localhost"
]);

function messageToParent(parentOrigin, payload) {
  window.parent.postMessage(payload, parentOrigin);
}

function App() {
  const [config, setConfig] = useState(null);
  const [error, setError] = useState("");
  const errorSent = useRef(false);

  useEffect(() => {
    const receive = (event) => {
      if (event.source !== window.parent || !allowedParents.has(event.origin)) return;
      const data = event.data;
      if (!data || data.type !== "sipandu:liveness:init"
        || typeof data.nonce !== "string" || data.nonce.length < 20
        || typeof data.challengeId !== "string" || typeof data.sessionId !== "string"
        || typeof data.idToken !== "string" || data.idToken.length < 100
        || typeof data.region !== "string" || data.region.length > 40) return;
      errorSent.current = false;
      setError("");
      setConfig({
        nonce: data.nonce,
        challengeId: data.challengeId,
        sessionId: data.sessionId,
        idToken: data.idToken,
        region: data.region,
        parentOrigin: event.origin
      });
    };
    window.addEventListener("message", receive);
    messageToParent("*", { type: "sipandu:liveness:ready" });
    return () => window.removeEventListener("message", receive);
  }, []);

  const reportError = (message) => {
    const safeMessage = typeof message === "string" && message.length <= 240
      ? message : "Pemeriksaan wajah terhenti. Silakan mulai sesi baru.";
    setError(safeMessage);
    if (config && !errorSent.current) {
      errorSent.current = true;
      messageToParent(config.parentOrigin, {
        type: "sipandu:liveness:error",
        nonce: config.nonce,
        message: safeMessage
      });
    }
  };

  const credentialProvider = async () => {
    if (!config) throw new Error("Sesi verifikasi belum siap.");
    const response = await fetch("/liveness/credentials", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + config.idToken
      },
      body: JSON.stringify({ challengeId: config.challengeId })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.credentials) {
      throw new Error(result.message || "Kredensial streaming sementara tidak dapat diterbitkan.");
    }
    const credentials = result.credentials;
    return {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
      expiration: new Date(credentials.expiration)
    };
  };

  const verifyResult = async () => {
    if (!config) throw new Error("Sesi verifikasi belum siap.");
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await fetch("/liveness/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + config.idToken
        },
        body: JSON.stringify({ challengeId: config.challengeId })
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 202 && result.status === "in_progress") {
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
        continue;
      }
      if (!response.ok || result.status !== "passed" || typeof result.proofToken !== "string") {
        throw new Error(result.message || "Verifikasi wajah belum berhasil.");
      }
      messageToParent(config.parentOrigin, {
        type: "sipandu:liveness:passed",
        nonce: config.nonce,
        proofToken: result.proofToken
      });
      return;
    }
    throw new Error("Analisis wajah masih berlangsung. Buat sesi verifikasi baru untuk mencoba kembali.");
  };

  if (!config) {
    return React.createElement("div", { className: "live-loading" },
      "Menghubungkan sesi verifikasi wajah SIPANDU…");
  }
  if (error) {
    return React.createElement("div", { className: "live-error", role: "alert" }, error);
  }

  const detector = React.createElement(FaceLivenessDetectorCore, {
    key: config.challengeId,
    sessionId: config.sessionId,
    region: config.region,
    config: { credentialProvider },
    onAnalysisComplete: verifyResult,
    onError: (livenessError) => {
      const detail = livenessError && livenessError.error && livenessError.error.message;
      reportError(detail || "Kamera atau sesi verifikasi mengalami kendala. Silakan ulangi.");
    },
    onUserCancel: () => reportError("Pemeriksaan dibatalkan. Mulai sesi baru untuk mencoba kembali.")
  });

  return React.createElement("div", { className: "live-shell" },
    React.createElement("p", { className: "live-note" },
      "Ikuti petunjuk gerakan wajah di layar. Pastikan wajah terlihat jelas, pencahayaan cukup, dan kamera tidak tertutup."),
    detector
  );
}

createRoot(document.getElementById("root")).render(React.createElement(App));
`;
