import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ─── LICENSE SYSTEM ───────────────────────────────────────────────────────────
const VALID_KEYS = ["IPTV-PRO-LIFETIME-2024", "IPTV-EDITOR-FOREVER", "PROX-LIFE-9999", "DEMO-ACTIVATE-NOW"];
const LICENSE_STORAGE_KEY = "iptv_editor_license";

function checkLicense() {
  try {
    const stored = localStorage.getItem(LICENSE_STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      return data.activated && VALID_KEYS.includes(data.key);
    }
  } catch {}
  return false;
}

function activateLicense(key) {
  if (VALID_KEYS.includes(key.trim().toUpperCase())) {
    localStorage.setItem(LICENSE_STORAGE_KEY, JSON.stringify({ activated: true, key: key.trim().toUpperCase(), date: new Date().toISOString() }));
    return true;
  }
  return false;
}

// ─── M3U PARSER ───────────────────────────────────────────────────────────────
function parseM3U(text) {
  const lines = text.split(/\r?\n/);
  const channels = [];
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("#EXTINF:")) {
      current = { id: crypto.randomUUID(), name: "", group: "", logo: "", tvgId: "", tvgName: "", url: "" };
      const nameMatch = line.match(/,(.+)$/);
      if (nameMatch) current.name = nameMatch[1].trim();
      const groupMatch = line.match(/group-title="([^"]*)"/);
      if (groupMatch) current.group = groupMatch[1];
      const logoMatch = line.match(/tvg-logo="([^"]*)"/);
      if (logoMatch) current.logo = logoMatch[1];
      const idMatch = line.match(/tvg-id="([^"]*)"/);
      if (idMatch) current.tvgId = idMatch[1];
    } else if (current && line && !line.startsWith("#")) {
      current.url = line;
      channels.push(current);
      current = null;
    }
  }
  return channels;
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function IPTVEditor() {
  const [licensed, setLicensed] = useState(checkLicense());
  const [licenseKey, setLicenseKey] = useState("");
  const [urlInput, setUrlInput] = useState(""); // Estado para la URL
  const [playlists, setPlaylists] = useState([{ id: "pl1", name: "Playlist 1", channels: [] }]);
  const [activePlaylist, setActivePlaylist] = useState("pl1");
  const playlist = useMemo(() => playlists.find(p => p.id === activePlaylist), [playlists, activePlaylist]);

  async function loadFromURL() {
    if (!urlInput.trim()) return;
    try {
      const response = await fetch(urlInput);
      const text = await response.text();
      const channels = parseM3U(text);
      setPlaylists(ps => ps.map(p => p.id === activePlaylist ? { ...p, channels } : p));
      alert(`Cargados ${channels.length} canales`);
    } catch (err) {
      alert("Error: Asegúrate de que la URL sea pública y permita acceso (CORS).");
    }
  }

  if (!licensed) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0e1a", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
        <div style={{ padding: 40, background: "#060a14", border: "1px solid #00c8ff" }}>
          <input value={licenseKey} onChange={e => setLicenseKey(e.target.value)} placeholder="Clave..." />
          <button onClick={() => activateLicense(licenseKey) && setLicensed(true)}>ACTIVAR</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0a0e1a", color: "#fff", padding: 20 }}>
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <input 
          value={urlInput} 
          onChange={e => setUrlInput(e.target.value)} 
          placeholder="https://tu-lista.m3u" 
          style={{ flex: 1, padding: 8 }}
        />
        <button onClick={loadFromURL} style={{ padding: "8px 16px", background: "#00c8ff", border: "none", cursor: "pointer" }}>Cargar URL</button>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ color: "#00c8ff" }}>
            <th style={{ textAlign: "left" }}>NOMBRE</th>
            <th style={{ textAlign: "left" }}>URL</th>
          </tr>
        </thead>
        <tbody>
          {playlist?.channels.map((ch, idx) => (
            <tr key={idx} style={{ borderBottom: "1px solid #333" }}>
              <td style={{ padding: 10 }}>{ch.name}</td>
              <td style={{ padding: 10 }}>{ch.url}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
    }
        
