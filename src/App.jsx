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

// ─── XMLTV PARSER ─────────────────────────────────────────────────────────────
function parseXMLTV(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "text/xml");
  const programmes = [];
  const channels = [];
  doc.querySelectorAll("channel").forEach(ch => {
    channels.push({ id: ch.getAttribute("id"), name: ch.querySelector("display-name")?.textContent || "" });
  });
  doc.querySelectorAll("programme").forEach(p => {
    programmes.push({
      channel: p.getAttribute("channel"),
      start: p.getAttribute("start"),
      stop: p.getAttribute("stop"),
      title: p.querySelector("title")?.textContent || "",
      desc: p.querySelector("desc")?.textContent || ""
    });
  });
  return { channels, programmes };
}

// ─── DRAG HELPERS ─────────────────────────────────────────────────────────────
function reorder(list, from, to) {
  const result = [...list];
  const [removed] = result.splice(from, 1);
  result.splice(to, 0, removed);
  return result;
}

// ─── ICONS ────────────────────────────────────────────────────────────────────
const Icon = ({ d, size = 16, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

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
  const [tab, setTab] = useState("channels"); // channels | epg | bulk
  const [epgData, setEpgData] = useState(null);
  const [epgFilter, setEpgFilter] = useState("");
  const [dragIdx, setDragIdx] = useState(null);
  const [dropIdx, setDropIdx] = useState(null);
  const [bulkSearch, setBulkSearch] = useState("");
  const [bulkReplace, setBulkReplace] = useState("");
  const [bulkField, setBulkField] = useState("group");
  const [toast, setToast] = useState(null);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [showNewPlaylist, setShowNewPlaylist] = useState(false);
  const fileInputM3U = useRef();
  const fileInputXML = useRef();

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

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
      showToast(`✓ ${channels.length} canales importados`);
    };
    reader.readAsText(file, "utf-8");
    e.target.value = "";
  }

  function handleXMLTVFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const data = parseXMLTV(ev.target.result);
      setEpgData(data);
      showToast(`✓ EPG cargado: ${data.channels.length} canales, ${data.programmes.length} programas`);
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
    showToast(`✓ Exportado: ${playlist.channels.length} canales`);
  }

  function handleDragStart(idx) { setDragIdx(idx); }
  function handleDragOver(e, idx) { e.preventDefault(); setDropIdx(idx); }
  function handleDrop() {
    if (dragIdx === null || dropIdx === null || dragIdx === dropIdx) { setDragIdx(null); setDropIdx(null); return; }
    const newChannels = reorder(playlist.channels, dragIdx, dropIdx);
    updatePlaylistChannels(activePlaylist, newChannels);
    setDragIdx(null); setDropIdx(null);
  }

  function saveChannelEdit(updated) {
    updatePlaylistChannels(activePlaylist, playlist.channels.map(c => c.id === updated.id ? updated : c));
    setEditingChannel(null);
    showToast("Canal guardado");
  }

  function deleteSelected() {
    updatePlaylistChannels(activePlaylist, playlist.channels.filter(c => !selectedChannels.has(c.id)));
    setSelectedChannels(new Set());
    showToast("Canales eliminados");
  }

  function addChannel() {
    const ch = { id: crypto.randomUUID(), name: "Nuevo Canal", group: "General", logo: "", tvgId: "", tvgName: "", url: "" };
    updatePlaylistChannels(activePlaylist, [...playlist.channels, ch]);
    setEditingChannel(ch);
  }

  function applyBulkReplace() {
    if (!bulkSearch) return;
    let count = 0;
    const updated = playlist.channels.map(ch => {
      if (ch[bulkField] && ch[bulkField].includes(bulkSearch)) {
        count++;
        return { ...ch, [bulkField]: ch[bulkField].replaceAll(bulkSearch, bulkReplace) };
      }
      return ch;
    });
    updatePlaylistChannels(activePlaylist, updated);
    showToast(`✓ ${count} canales actualizados`);
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
    if (activateLicense(licenseKey)) {
      setLicensed(true);
    } else {
      setLicenseError("Clave inválida. Intenta: IPTV-PRO-LIFETIME-2024");
    }
  }

  // ─── LICENSE SCREEN ──────────────────────────────────────────────────────────
  if (!licensed) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #0a0e1a 0%, #0d1b2a 50%, #0a0e1a 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Courier New', monospace" }}>
        <div style={{ width: 440, padding: "48px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(0,200,255,0.2)", borderRadius: 4, boxShadow: "0 0 60px rgba(0,200,255,0.05), inset 0 1px 0 rgba(255,255,255,0.05)" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📡</div>
            <div style={{ color: "#00c8ff", fontSize: 22, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" }}>IPTV Pro Editor</div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, letterSpacing: 2, marginTop: 6 }}>LIFETIME LICENSE REQUIRED</div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", color: "rgba(255,255,255,0.5)", fontSize: 11, letterSpacing: 2, marginBottom: 8 }}>CLAVE DE ACTIVACIÓN</label>
            <input
              value={licenseKey}
              onChange={e => { setLicenseKey(e.target.value); setLicenseError(""); }}
              onKeyDown={e => e.key === "Enter" && tryActivate()}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              style={{ width: "100%", padding: "12px 16px", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(0,200,255,0.3)", borderRadius: 2, color: "#00c8ff", fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box", letterSpacing: 2 }}
            />
            {licenseError && <div style={{ color: "#ff6b6b", fontSize: 12, marginTop: 8 }}>{licenseError}</div>}
          </div>
          <button onClick={tryActivate} style={{ width: "100%", padding: "14px", background: "linear-gradient(90deg, #00c8ff, #0080ff)", border: "none", borderRadius: 2, color: "#000", fontFamily: "inherit", fontSize: 13, fontWeight: 700, letterSpacing: 2, cursor: "pointer", textTransform: "uppercase" }}>
            ACTIVAR LICENCIA DE POR VIDA
          </button>
          <div style={{ marginTop: 24, padding: "16px", background: "rgba(0,200,255,0.05)", border: "1px solid rgba(0,200,255,0.1)", borderRadius: 2 }}>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, letterSpacing: 1, marginBottom: 8 }}>CLAVES DEMO VÁLIDAS:</div>
            {VALID_KEYS.map(k => (
              <div key={k} onClick={() => setLicenseKey(k)} style={{ color: "#00c8ff", fontSize: 11, cursor: "pointer", padding: "2px 0", opacity: 0.7 }}>▶ {k}</div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ─── MAIN EDITOR ─────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#0a0e1a", color: "#e0e8f0", fontFamily: "'Courier New', monospace", display: "flex", flexDirection: "column" }}>

      {/* TOP BAR */}
      <div style={{ background: "#060a14", borderBottom: "1px solid rgba(0,200,255,0.15)", padding: "0 20px", display: "flex", alignItems: "center", gap: 20, height: 52 }}>
        <div style={{ color: "#00c8ff", fontWeight: 700, fontSize: 15, letterSpacing: 3, textTransform: "uppercase" }}>📡 IPTV PRO</div>
        <div style={{ color: "rgba(0,200,255,0.4)", fontSize: 10, letterSpacing: 1 }}>LIFETIME ✓</div>
        <div style={{ flex: 1 }} />
        {["channels", "epg", "bulk"].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ background: tab === t ? "rgba(0,200,255,0.1)" : "transparent", border: tab === t ? "1px solid rgba(0,200,255,0.4)" : "1px solid transparent", color: tab === t ? "#00c8ff" : "rgba(255,255,255,0.4)", padding: "6px 16px", borderRadius: 2, cursor: "pointer", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", fontFamily: "inherit" }}>
            {t === "channels" ? "Canales" : t === "epg" ? "EPG/XMLTV" : "Bulk Edit"}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* SIDEBAR - PLAYLISTS */}
        <div style={{ width: 200, background: "#060a14", borderRight: "1px solid rgba(0,200,255,0.1)", display: "flex", flexDirection: "column", padding: "16px 0" }}>
          <div style={{ padding: "0 16px 12px", color: "rgba(255,255,255,0.3)", fontSize: 10, letterSpacing: 2 }}>PLAYLISTS</div>
          {playlists.map(pl => (
            <div key={pl.id} onClick={() => setActivePlaylist(pl.id)} style={{ padding: "8px 16px", cursor: "pointer", background: pl.id === activePlaylist ? "rgba(0,200,255,0.08)" : "transparent", borderLeft: pl.id === activePlaylist ? "2px solid #00c8ff" : "2px solid transparent", color: pl.id === activePlaylist ? "#00c8ff" : "rgba(255,255,255,0.6)", fontSize: 12 }}>
              <div style={{ fontWeight: pl.id === activePlaylist ? 700 : 400 }}>{pl.name}</div>
              <div style={{ fontSize: 10, opacity: 0.5 }}>{pl.channels.length} canales</div>
            </div>
          ))}
          {showNewPlaylist ? (
            <div style={{ padding: "8px 16px" }}>
              <input value={newPlaylistName} onChange={e => setNewPlaylistName(e.target.value)} onKeyDown={e => e.key === "Enter" && addPlaylist()} placeholder="Nombre..." style={{ width: "100%", background: "rgba(0,0,0,0.4)", border: "1px solid rgba(0,200,255,0.3)", color: "#fff", padding: "6px 8px", fontSize: 11, borderRadius: 2, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
              <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                <button onClick={addPlaylist} style={{ flex: 1, background: "rgba(0,200,255,0.2)", border: "1px solid rgba(0,200,255,0.3)", color: "#00c8ff", fontSize: 10, padding: "4px", cursor: "pointer", fontFamily: "inherit" }}>OK</button>
                <button onClick={() => setShowNewPlaylist(false)} style={{ flex: 1, background: "transparent", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)", fontSize: 10, padding: "4px", cursor: "pointer", fontFamily: "inherit" }}>X</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowNewPlaylist(true)} style={{ margin: "8px 16px 0", background: "transparent", border: "1px dashed rgba(0,200,255,0.2)", color: "rgba(0,200,255,0.5)", padding: "6px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>+ Nueva Playlist</button>
          )}
        </div>

        {/* MAIN CONTENT */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* ── CHANNELS TAB ── */}
          {tab === "channels" && (
            <>
              {/* TOOLBAR */}
              <div style={{ background: "#08101f", borderBottom: "1px solid rgba(0,200,255,0.1)", padding: "10px 16px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <input ref={fileInputM3U} type="file" accept=".m3u,.m3u8" onChange={handleM3UFile} style={{ display: "none" }} />
                <button onClick={() => fileInputM3U.current.click()} style={btnStyle("#00c8ff")}>📂 Abrir M3U</button>
                <button onClick={exportCurrentM3U} style={btnStyle("#00ff88")}>💾 Exportar M3U</button>
                <button onClick={addChannel} style={btnStyle("#ffaa00")}>+ Canal</button>
                {selectedChannels.size > 0 && <button onClick={deleteSelected} style={btnStyle("#ff4455")}>🗑 Eliminar ({selectedChannels.size})</button>}
                <div style={{ flex: 1 }} />
                <select value={filterGroup} onChange={e => setFilterGroup(e.target.value)} style={selectStyle}>
                  <option value="all">Todos los grupos</option>
                  {groups.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Buscar canal..." style={{ ...inputStyle, width: 180 }} />
                <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>{filteredChannels.length}/{playlist?.channels.length || 0}</div>
              </div>

              {/* CHANNEL TABLE */}
              <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 16px" }}>
                {filteredChannels.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "60px 0", color: "rgba(255,255,255,0.2)" }}>
                    <div style={{ fontSize: 40, marginBottom: 16 }}>📡</div>
                    <div style={{ fontSize: 14 }}>Sin canales. Importa un archivo M3U o añade canales manualmente.</div>
                  </div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
                    <thead>
                      <tr style={{ color: "rgba(0,200,255,0.6)", fontSize: 10, letterSpacing: 2, borderBottom: "1px solid rgba(0,200,255,0.1)" }}>
                        <th style={thStyle}><input type="checkbox" onChange={e => setSelectedChannels(e.target.checked ? new Set(filteredChannels.map(c => c.id)) : new Set())} /></th>
                        <th style={thStyle}>#</th>
                        <th style={thStyle}>NOMBRE</th>
                        <th style={thStyle}>GRUPO</th>
                        <th style={thStyle}>TVG-ID</th>
                        <th style={thStyle}>URL</th>
                        <th style={thStyle}>ACC.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredChannels.map((ch, idx) => (
                        <tr
                          key={ch.id}
                          draggable
                          onDragStart={() => handleDragStart(idx)}
                          onDragOver={e => handleDragOver(e, idx)}
                          onDrop={handleDrop}
                          style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", background: dropIdx === idx ? "rgba(0,200,255,0.05)" : selectedChannels.has(ch.id) ? "rgba(0,200,255,0.07)" : "transparent", cursor: "grab" }}
                        >
                                                  <td style={{ ...tdStyle, fontWeight: 600, color: "#e0e8f0", maxWidth: 200 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              {ch.logo && <img src={ch.logo} alt="" style={{ width: 20, height: 20, objectFit: "contain" }} />}
                              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ch.name}</span>
                            </div>
                          </td>
                          <td style={{ ...tdStyle, fontSize: 11, color: "rgba(0,200,255,0.6)" }}>{ch.group}</td>
                          <td style={{ ...tdStyle, fontSize: 10, opacity: 0.5 }}>{ch.tvgId}</td>
                          <td style={{ ...tdStyle, fontSize: 10, opacity: 0.3, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{ch.url}</td>
                          <td style={tdStyle}>
                            <button onClick={() => setEditingChannel(ch)} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", cursor: "pointer", padding: "2px 8px", fontSize: 10 }}>Editar</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
          
