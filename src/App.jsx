import { useState, useEffect, useRef, useCallback, useMemo const [urlInput, setUrlInput] = useState("");
} from "react";

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
      const nameTagMatch = line.match(/tvg-name="([^"]*)"/);
      if (nameTagMatch) current.tvgName = nameTagMatch[1];
    } else if (current && line && !line.startsWith("#")) {
      current.url = line;
      channels.push(current);
      current = null;
    }
  }
  return channels;
}

function exportM3U(channels) {
  let out = "#EXTM3U\n";
  for (const ch of channels) {
    out += `#EXTINF:-1 tvg-id="${ch.tvgId}" tvg-name="${ch.tvgName || ch.name}" tvg-logo="${ch.logo}" group-title="${ch.group}",${ch.name}\n`;
    out += `${ch.url}\n`;
  }
  return out;
}

// ─── STYLES HELPERS ───────────────────────────────────────────────────────────
const btnStyle = (color) => ({ background: "transparent", border: `1px solid ${color}`, color: color, padding: "6px 12px", borderRadius: 2, cursor: "pointer", fontSize: 11, fontFamily: "inherit" });
const thStyle = { textAlign: "left", padding: "10px", fontWeight: 400 };
const tdStyle = { padding: "10px", borderBottom: "1px solid rgba(255,255,255,0.05)" };
const inputStyle = { background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", padding: "6px 8px", fontSize: 11, borderRadius: 2 };
const selectStyle = { ...inputStyle, padding: "6px" };

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function IPTVEditor() {
  const [licensed, setLicensed] = useState(checkLicense());
  const [licenseKey, setLicenseKey] = useState("");
  const [licenseError, setLicenseError] = useState("");

  const [playlists, setPlaylists] = useState([{ id: "pl1", name: "Playlist 1", channels: [] }]);
  const [activePlaylist, setActivePlaylist] = useState("pl1");
  const [selectedChannels, setSelectedChannels] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [filterGroup, setFilterGroup] = useState("all");
  const [editingChannel, setEditingChannel] = useState(null);
  const [tab, setTab] = useState("channels");
  const [dragIdx, setDragIdx] = useState(null);
  const [dropIdx, setDropIdx] = useState(null);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [showNewPlaylist, setShowNewPlaylist] = useState(false);
  const fileInputM3U = useRef();

  const playlist = useMemo(() => playlists.find(p => p.id === activePlaylist), [playlists, activePlaylist]);

  const groups = useMemo(() => {
    if (!playlist) return [];
    return [...new Set(playlist.channels.map(c => c.group))].filter(Boolean).sort();
  }, [playlist]);

  const filteredChannels = useMemo(() => {
    if (!playlist) return [];
    return playlist.channels.filter(ch => {
      const matchSearch = !searchQuery || ch.name.toLowerCase().includes(searchQuery.toLowerCase()) || ch.group.toLowerCase().includes(searchQuery.toLowerCase());
      const matchGroup = filterGroup === "all" || ch.group === filterGroup;
      return matchSearch && matchGroup;
    });
  }, [playlist, searchQuery, filterGroup]);

  function updatePlaylistChannels(id, channels) {
    setPlaylists(ps => ps.map(p => p.id === id ? { ...p, channels } : p));
  }

  function handleM3UFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const channels = parseM3U(ev.target.result);
      updatePlaylistChannels(activePlaylist, channels);
    };
    reader.readAsText(file, "utf-8");
    e.target.value = "";
  }

  function exportCurrentM3U() {
    if (!playlist) return;
    const content = exportM3U(playlist.channels);
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${playlist.name.replace(/\s+/g, "_")}.m3u`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleDragStart(idx) { setDragIdx(idx); }
  function handleDragOver(e, idx) { e.preventDefault(); setDropIdx(idx); }
  function handleDrop() {
    if (dragIdx === null || dropIdx === null || dragIdx === dropIdx) { setDragIdx(null); setDropIdx(null); return; }
    const newChannels = reorder(playlist.channels, dragIdx, dropIdx);
    updatePlaylistChannels(activePlaylist, newChannels);
    setDragIdx(null); setDropIdx(null);
  }

  function addChannel() {
    const ch = { id: crypto.randomUUID(), name: "Nuevo Canal", group: "General", logo: "", tvgId: "", tvgName: "", url: "" };
    updatePlaylistChannels(activePlaylist, [...playlist.channels, ch]);
  }

  function deleteSelected() {
    updatePlaylistChannels(activePlaylist, playlist.channels.filter(c => !selectedChannels.has(c.id)));
    setSelectedChannels(new Set());
  }

  function addPlaylist() {
    if (!newPlaylistName.trim()) return;
    const id = "pl" + Date.now();
    setPlaylists(ps => [...ps, { id, name: newPlaylistName.trim(), channels: [] }]);
    setActivePlaylist(id);
    setNewPlaylistName("");
    setShowNewPlaylist(false);
  }

  function tryActivate() {
    if (activateLicense(licenseKey)) setLicensed(true);
    else setLicenseError("Clave inválida");
  }

  if (!licensed) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0e1a", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Courier New', monospace" }}>
        <div style={{ width: 400, padding: 40, background: "#060a14", border: "1px solid #00c8ff", borderRadius: 4 }}>
          <div style={{ color: "#00c8ff", fontSize: 20, textAlign: "center", marginBottom: 20 }}>ACTIVAR LICENCIA</div>
          <input value={licenseKey} onChange={e => setLicenseKey(e.target.value)} style={{ width: "100%", padding: 10, marginBottom: 10, background: "#000", border: "1px solid #333", color: "#fff" }} placeholder="XXXX-XXXX" />
          <button onClick={tryActivate} style={{ width: "100%", padding: 10, background: "#00c8ff", border: "none", cursor: "pointer" }}>ACTIVAR</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0a0e1a", color: "#e0e8f0", fontFamily: "'Courier New', monospace", display: "flex", flexDirection: "column" }}>
      <div style={{ background: "#060a14", padding: "15px", display: "flex", gap: 20, borderBottom: "1px solid #00c8ff" }}>
        <div style={{ color: "#00c8ff", fontWeight: 700 }}>📡 IPTV PRO EDITOR</div>
        <button onClick={addChannel} style={btnStyle("#ffaa00")}>+ Canal</button>
        <button onClick={exportCurrentM3U} style={btnStyle("#00ff88")}>💾 Exportar</button>
      </div>

      <div style={{ display: "flex", flex: 1, padding: 20 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ color: "#00c8ff", fontSize: 10 }}>
              <th style={thStyle}>NOMBRE</th>
              <th style={thStyle}>GRUPO</th>
              <th style={thStyle}>URL</th>
            </tr>
          </thead>
          <tbody>
            {filteredChannels.map((ch, idx) => (
              <tr key={ch.id} style={{ borderBottom: "1px solid #1a202c" }}>
                <td style={tdStyle}>{ch.name}</td>
                <td style={tdStyle}>{ch.group}</td>
                <td style={tdStyle}>{ch.url}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
