import { useState, useEffect, useRef, Fragment } from "react";
import { db } from "./firebase";
import { doc, onSnapshot, setDoc } from "firebase/firestore";

const DOC_REF = doc(db, "tournament", "game1");

// ─── Scoring ─────────────────────────────────────────────────────────────────
const PLACEMENT_PTS = (p) => {
  const n = parseInt(p);
  if (n === 1) return 10;
  if (n <= 5)  return 7;
  if (n <= 10) return 5;
  return 0;
};
const ELIM_PTS      = 1;
const REBOOT_PTS    = 1;
const TEAM_WIPE_PTS = 2;
const NUM_MATCHES   = 5;

// ─── Factories ────────────────────────────────────────────────────────────────
let _pid = 0;
const newPlayer = (name = "") => ({
  id: ++_pid,
  name,
  matches: Array.from({ length: NUM_MATCHES }, () => ({
    placement: "",
    elims: 0,
    reboots: 0,
    teamWipes: 0,
    waterShots: 0,
  })),
});

let _tid = 0;
const newTeam = (name = "") => ({
  id: ++_tid,
  name,
  matchPlacements: Array(NUM_MATCHES).fill(""),
  members: [newPlayer("")],
});

const DEFAULT_TEAMS = [newTeam("Team 1"), newTeam("Team 2")];

// ─── Calc ─────────────────────────────────────────────────────────────────────
const calcPlayer = (player) => {
  let pts = 0, shots = 0;
  player.matches.forEach((m) => {
    pts   += (parseInt(m.elims)      || 0) * ELIM_PTS;
    pts   += (parseInt(m.reboots)    || 0) * REBOOT_PTS;
    pts   += (parseInt(m.teamWipes)  || 0) * TEAM_WIPE_PTS;
    shots += (parseInt(m.waterShots) || 0);
  });
  return { pts, shots };
};

const calcTeam = (team) => {
  const memberTotals = team.members.reduce((acc, m) => {
    const r = calcPlayer(m);
    return { pts: acc.pts + r.pts, shots: acc.shots + r.shots };
  }, { pts: 0, shots: 0 });
  const teamPlacementPts = team.matchPlacements.reduce((sum, p) => {
    return sum + (p !== "" ? PLACEMENT_PTS(p) : 0);
  }, 0);
  const waterPenalty = memberTotals.shots * 2;
  return { pts: Math.max(0, memberTotals.pts + teamPlacementPts - waterPenalty), shots: memberTotals.shots };
};

const teamWins = (team) =>
  team.matchPlacements.filter(p => parseInt(p) === 1).length;

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  bg:     "#0a0e1a",
  card:   "#111827",
  deep:   "#0d1526",
  border: "#1e2d45",
  accent: "#00d4ff",
  purple: "#a855f7",
  danger: "#ff4d6d",
  water:  "#60a5fa",
  gold:   "#ffd700",
  green:  "#34d399",
  text:   "#e2e8f0",
  muted:  "#64748b",
};

const TEAM_COLORS = ["#00d4ff","#a855f7","#f59e0b","#34d399","#f472b6","#fb923c"];
const teamColor   = (idx) => TEAM_COLORS[idx % TEAM_COLORS.length];

const PLACE_LABEL = (p) => {
  const n = parseInt(p);
  if (!n) return "—";
  if (n === 1) return "👑 Victory Royale";
  if (n <= 5)  return `🔥 Top 5 (#${n})`;
  return `#${n}`;
};

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Rajdhani:wght@400;500;600;700&display=swap');
  *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
  body { background:${C.bg}; color:${C.text}; font-family:'Rajdhani',sans-serif; min-height:100vh; }
  .app { max-width:940px; margin:0 auto; padding:20px 14px 80px; }

  .hero { text-align:center; padding:26px 0 18px; position:relative; }
  .hero::before {
    content:''; position:absolute; inset:0;
    background:radial-gradient(ellipse at 50% 0%, rgba(0,212,255,.13) 0%, transparent 70%);
    pointer-events:none;
  }
  .trophy { font-size:2.2rem; margin-bottom:5px; filter:drop-shadow(0 0 12px #ffd70099);
    animation:bob 3s ease-in-out infinite; }
  @keyframes bob { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-7px)} }
  .title {
    font-family:'Bebas Neue',sans-serif; font-size:clamp(2rem,8vw,3.5rem);
    letter-spacing:.06em; line-height:1;
    background:linear-gradient(135deg,#ffd700 0%,#00d4ff 55%,#a855f7 100%);
    -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text;
  }
  .subtitle { color:${C.muted}; font-size:.82rem; letter-spacing:.22em; text-transform:uppercase; margin-top:4px; }

  .sync-bar {
    display:flex; align-items:center; justify-content:center; gap:6px;
    font-size:.72rem; letter-spacing:.1em; text-transform:uppercase;
    padding:5px 0 2px; color:${C.muted};
  }
  .sync-dot {
    width:7px; height:7px; border-radius:50%; flex-shrink:0;
    transition: background .4s;
  }
  .sync-dot.live    { background:#34d399; box-shadow:0 0 6px #34d39988; }
  .sync-dot.saving  { background:#ffd700; box-shadow:0 0 6px #ffd70088; }
  .sync-dot.offline { background:#ff4d6d; }

  .scoreboard { margin:16px 0; }
  .sb-label { font-size:.68rem; color:${C.muted}; text-transform:uppercase; letter-spacing:.12em; margin-bottom:8px; }
  .sb-teams { display:flex; gap:10px; flex-wrap:wrap; }
  .sb-team {
    flex:1; min-width:130px; border-radius:9px; padding:12px 14px 16px;
    background:${C.deep}; position:relative; overflow:hidden; transition:transform .15s;
  }
  .sb-team:hover { transform:translateY(-2px); }
  .sb-team-bar { position:absolute; bottom:0; left:0; height:3px; border-radius:0 0 9px 9px; transition:width .4s ease; }
  .sb-team-name { font-family:'Bebas Neue',sans-serif; font-size:.95rem; letter-spacing:.06em; margin-bottom:2px; }
  .sb-team-pts  { font-family:'Bebas Neue',sans-serif; font-size:2rem; line-height:1; }
  .sb-team-sub  { font-size:.67rem; color:${C.muted}; margin-top:3px; line-height:1.5; }
  .sb-win-badge {
    display:inline-block; background:rgba(255,215,0,.15); border:1px solid rgba(255,215,0,.35);
    color:${C.gold}; font-size:.65rem; font-weight:700; letter-spacing:.06em;
    padding:1px 7px; border-radius:10px; margin-top:4px;
  }
  .sb-rank { position:absolute; top:10px; right:12px; font-family:'Bebas Neue',sans-serif; font-size:1.6rem; line-height:1; opacity:.18; }
  .sb-rank-badge {
    display:inline-flex; align-items:center; gap:4px;
    font-family:'Bebas Neue',sans-serif; font-size:.75rem; letter-spacing:.06em;
    padding:2px 8px; border-radius:10px; margin-top:5px;
  }
  .sb-rank-1 { background:rgba(255,215,0,.18); border:1px solid rgba(255,215,0,.4); color:${C.gold}; }
  .sb-rank-n { background:rgba(100,116,139,.12); border:1px solid ${C.border}; color:${C.muted}; }

  .tabs { display:flex; gap:4px; overflow-x:auto; padding-bottom:6px; margin:6px 0 14px; scrollbar-width:none; }
  .tabs::-webkit-scrollbar { display:none; }
  .tab {
    flex-shrink:0; padding:7px 15px; border-radius:6px;
    border:1px solid ${C.border}; background:${C.card};
    color:${C.muted}; font-family:'Rajdhani',sans-serif; font-size:.82rem;
    font-weight:600; letter-spacing:.05em; cursor:pointer; transition:all .15s;
  }
  .tab:hover { border-color:${C.accent}; color:${C.accent}; }
  .tab.active {
    background:linear-gradient(135deg,rgba(0,212,255,.14),rgba(168,85,247,.14));
    border-color:${C.accent}; color:${C.accent};
  }

  .card { background:${C.card}; border:1px solid ${C.border}; border-radius:10px; padding:18px; margin-bottom:14px; }
  .card-title {
    font-family:'Bebas Neue',sans-serif; font-size:1.22rem; letter-spacing:.08em;
    color:${C.accent}; margin-bottom:14px; display:flex; align-items:center; gap:8px; flex-wrap:wrap;
  }

  label { display:block; font-size:.7rem; color:${C.muted}; text-transform:uppercase; letter-spacing:.1em; margin-bottom:3px; }
  label.inline { display:inline; margin-bottom:0; }
  input, select {
    width:100%; background:${C.deep}; border:1px solid ${C.border}; border-radius:6px;
    padding:7px 9px; color:${C.text}; font-family:'Rajdhani',sans-serif; font-size:.95rem; outline:none;
    transition:border-color .15s;
  }
  input:focus, select:focus { border-color:${C.accent}; }
  select option { background:${C.card}; }

  .btn { padding:8px 16px; border-radius:6px; border:none; font-family:'Rajdhani',sans-serif;
    font-size:.85rem; font-weight:700; letter-spacing:.07em; cursor:pointer; transition:all .15s; }
  .btn-ghost { background:transparent; border:1px solid ${C.border}; color:${C.muted}; }
  .btn-ghost:hover { border-color:${C.danger}; color:${C.danger}; }
  .add-row {
    width:100%; padding:9px; border-radius:7px; border:1px dashed ${C.border};
    background:transparent; color:${C.muted}; font-family:'Rajdhani',sans-serif;
    font-size:.85rem; cursor:pointer; transition:all .15s; margin-top:8px;
  }
  .add-row:hover { border-color:${C.accent}; color:${C.accent}; }

  .tally {
    display:inline-flex; align-items:center;
    border:1px solid ${C.border}; border-radius:7px; overflow:hidden; background:${C.deep};
  }
  .tally-btn {
    border:none; background:transparent; color:${C.muted};
    font-size:1rem; font-weight:700; width:28px; height:28px;
    cursor:pointer; transition:all .12s; display:flex; align-items:center; justify-content:center; flex-shrink:0;
  }
  .tally-btn:hover { background:rgba(255,255,255,.07); }
  .tally-btn.minus:hover { color:${C.danger}; }
  .tally-btn.plus:hover  { color:${C.accent}; }
  .tally-val { min-width:26px; text-align:center; font-family:'Bebas Neue',sans-serif; font-size:1rem; color:${C.text}; user-select:none; padding:0 2px; }
  .tally-val.water   { color:${C.water}; }
  .tally-val.nonzero { color:${C.accent}; }

  .team-block { border:1px solid ${C.border}; border-radius:9px; margin-bottom:14px; overflow:hidden; }
  .team-header { display:flex; align-items:flex-end; gap:10px; padding:12px 14px; background:rgba(0,212,255,.05); border-bottom:1px solid ${C.border}; flex-wrap:wrap; }
  .team-name-wrap { flex:1; min-width:140px; }
  .member-row { display:flex; align-items:center; gap:8px; padding:9px 14px; border-bottom:1px solid rgba(30,45,69,.5); }
  .member-row:last-child { border-bottom:none; }
  .member-row input { flex:1; }
  .member-num { font-family:'Bebas Neue',sans-serif; font-size:1rem; color:${C.muted}; width:18px; flex-shrink:0; }

  .team-placement-row {
    display:flex; align-items:center; gap:12px; flex-wrap:wrap;
    padding:10px 12px; border-radius:8px; margin-bottom:6px;
  }
  .team-placement-label { font-family:'Bebas Neue',sans-serif; font-size:1rem; letter-spacing:.06em; flex-shrink:0; }
  .team-placement-sel { max-width:200px; font-size:.88rem; padding:6px 8px; }
  .placement-result-badge {
    display:inline-flex; align-items:center; gap:5px;
    padding:4px 12px; border-radius:20px; font-family:'Bebas Neue',sans-serif;
    font-size:.95rem; letter-spacing:.04em; flex-shrink:0;
  }

  .match-wrap { overflow-x:auto; }
  .match-table { width:100%; border-collapse:collapse; min-width:460px; }
  .match-table th {
    font-size:.65rem; text-transform:uppercase; letter-spacing:.1em;
    color:${C.muted}; text-align:center; padding:7px 4px; border-bottom:1px solid ${C.border}; white-space:nowrap;
  }
  .match-table th:first-child { text-align:left; }
  .match-table td { padding:6px 4px; border-bottom:1px solid rgba(30,45,69,.4); vertical-align:middle; }
  .match-table tbody tr:last-child td { border-bottom:none; }
  .team-sep td {
    padding:6px 10px; font-family:'Bebas Neue',sans-serif; letter-spacing:.08em;
    font-size:.88rem; border-bottom:1px solid rgba(168,85,247,.25) !important;
    background:rgba(168,85,247,.05);
  }
  .player-cell { font-weight:600; font-size:.88rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100px; }
  .pts-badge { display:inline-block; padding:2px 8px; border-radius:4px; font-size:.82rem; font-weight:700; text-align:center; white-space:nowrap; }
  .placement-sel { padding:5px 4px; font-size:.82rem; text-align:center; }

  .lb-row {
    display:grid; grid-template-columns:42px 1fr auto 62px; gap:6px;
    align-items:center; padding:10px 14px; border-radius:8px; margin-bottom:5px;
    border:1px solid ${C.border}; background:${C.deep}; transition:transform .13s;
  }
  .lb-row:hover { transform:translateX(3px); }
  .rank-badge { width:34px; height:34px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-family:'Bebas Neue',sans-serif; font-size:1.05rem; }
  .r1 { background:linear-gradient(135deg,#ffd700,#ff9500); color:#000; box-shadow:0 0 10px #ffd70055; }
  .r2 { background:linear-gradient(135deg,#c0c0c0,#909090); color:#000; }
  .r3 { background:linear-gradient(135deg,#cd7f32,#a0522d); color:#fff; }
  .rn { background:${C.border}; color:${C.muted}; }
  .lb-name { font-size:1rem; font-weight:700; }
  .lb-sub  { font-size:.7rem; color:${C.muted}; }
  .lb-pts  { font-family:'Bebas Neue',sans-serif; font-size:1.5rem; color:${C.accent}; text-align:right; }
  .lb-shots{ font-size:.82rem; color:${C.water}; text-align:right; }
  .match-strip { display:flex; gap:4px; margin-top:3px; flex-wrap:wrap; }
  .match-pip {
    font-size:.62rem; font-weight:700; padding:1px 6px; border-radius:4px;
    letter-spacing:.03em; white-space:nowrap;
  }
  .pip-win  { background:rgba(255,215,0,.18); color:${C.gold}; border:1px solid rgba(255,215,0,.35); }
  .pip-top5 { background:rgba(255,100,0,.15); color:#fb923c; border:1px solid rgba(255,100,0,.3); }
  .pip-other{ background:rgba(100,116,139,.12); color:${C.muted}; border:1px solid ${C.border}; }
  .pip-none { background:transparent; color:${C.border}; border:1px dashed ${C.border}; }

  .rules-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  .rule-item { display:flex; align-items:center; gap:7px; padding:7px 11px; background:${C.deep}; border-radius:6px; border:1px solid ${C.border}; font-size:.88rem; }
  .rule-icon { font-size:1rem; flex-shrink:0; }
  .score-pill { display:inline-flex; align-items:center; padding:2px 10px; border-radius:20px; font-size:.75rem; font-weight:700; background:rgba(0,212,255,.09); border:1px solid rgba(0,212,255,.22); color:${C.accent}; }

  @media(max-width:520px){
    .rules-grid { grid-template-columns:1fr; }
    .lb-row { grid-template-columns:36px 1fr auto 52px; }
    .tally-btn { width:26px; height:26px; font-size:.9rem; }
  }
`;

// ─── Components ───────────────────────────────────────────────────────────────
function Tally({ value, onChange, color }) {
  const v = parseInt(value) || 0;
  const valClass = `tally-val${color === "water" ? " water" : v > 0 ? " nonzero" : ""}`;
  return (
    <div className="tally">
      <button className="tally-btn minus" onClick={() => onChange(Math.max(0, v - 1))}>−</button>
      <span className={valClass}>{v}</span>
      <button className="tally-btn plus"  onClick={() => onChange(v + 1)}>+</button>
    </div>
  );
}

function MatchPip({ placement }) {
  const n = parseInt(placement);
  if (!n) return <span className="match-pip pip-none">M?</span>;
  if (n === 1)  return <span className="match-pip pip-win">👑 W</span>;
  if (n <= 5)   return <span className="match-pip pip-top5">T5</span>;
  return <span className="match-pip pip-other">#{n}</span>;
}

const TABS = ["Roster","Match 1","Match 2","Match 3","Match 4","Match 5","Leaderboard"];

// ═════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [tab,        setTab]        = useState(0);
  const [teams,      setTeams]      = useState(DEFAULT_TEAMS);
  const [syncStatus, setSyncStatus] = useState("live"); // "live" | "saving" | "offline"
  const isRemoteUpdate = useRef(false);
  const saveTimer      = useRef(null);

  // ── READ: subscribe to Firestore on mount ──────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(
      DOC_REF,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (data.teams && data.teams.length > 0) {
            isRemoteUpdate.current = true;
            setTeams(data.teams);
          }
        }
        setSyncStatus("live");
      },
      (err) => {
        console.error("Firestore error:", err);
        setSyncStatus("offline");
      }
    );
    return () => unsub();
  }, []);

  // ── WRITE: debounced save to Firestore whenever teams changes ──────────────
  useEffect(() => {
    // If this state change came FROM Firestore, don't write back
    if (isRemoteUpdate.current) {
      isRemoteUpdate.current = false;
      return;
    }
    setSyncStatus("saving");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setDoc(DOC_REF, { teams })
        .then(() => setSyncStatus("live"))
        .catch((err) => {
          console.error("Save error:", err);
          setSyncStatus("offline");
        });
    }, 1200); // 1200ms debounce — gives time to finish typing before saving
  }, [teams]);

  // ── team CRUD ──────────────────────────────────────────────────────────────
  const addTeam        = ()          => setTeams(ts => [...ts, newTeam(`Team ${ts.length + 1}`)]);
  const removeTeam     = (tid)       => { if (teams.length > 1) setTeams(ts => ts.filter(t => t.id !== tid)); };
  const updateTeamName = (tid, name) => setTeams(ts => ts.map(t => t.id === tid ? { ...t, name } : t));

  const updateTeamMatchPlacement = (tid, mi, val) =>
    setTeams(ts => ts.map(t => {
      if (t.id !== tid) return t;
      const mp = [...t.matchPlacements];
      mp[mi] = val;
      return { ...t, matchPlacements: mp };
    }));

  const addMember        = (tid)      => setTeams(ts => ts.map(t => t.id !== tid ? t : { ...t, members: [...t.members, newPlayer("")] }));
  const removeMember     = (tid, pid) => setTeams(ts => ts.map(t => {
    if (t.id !== tid || t.members.length <= 1) return t;
    return { ...t, members: t.members.filter(m => m.id !== pid) };
  }));
  const updateMemberName = (tid, pid, v) => setTeams(ts => ts.map(t =>
    t.id !== tid ? t : { ...t, members: t.members.map(m => m.id === pid ? { ...m, name: v } : m) }
  ));

  const updateStat = (tid, pid, mi, field, val) =>
    setTeams(ts => ts.map(t => {
      if (t.id !== tid) return t;
      return {
        ...t,
        members: t.members.map(m => {
          if (m.id !== pid) return m;
          const matches = m.matches.map((mx, i) => i === mi ? { ...mx, [field]: val } : mx);
          return { ...m, matches };
        }),
      };
    }));

  // ── derived ────────────────────────────────────────────────────────────────
  const teamsWithStats = teams.map((t, ti) => ({
    ...t,
    color: teamColor(ti),
    wins:  teamWins(t),
    ...calcTeam(t),
  }));

  const allPlayers = teams.flatMap((t, ti) =>
    t.members
      .filter(m => m.name.trim())
      .map(m => ({ ...m, teamName: t.name, teamId: t.id, teamColor: teamColor(ti), ...calcPlayer(m) }))
  );

  const teamLeaderboard   = [...teamsWithStats].filter(t => t.members.some(m => m.name.trim())).sort((a,b) => b.pts - a.pts);
  const playerLeaderboard = [...allPlayers].sort((a,b) => b.pts - a.pts);
  const maxTeamPts = Math.max(1, ...teamsWithStats.map(t => t.pts));

  const teamRankMap   = Object.fromEntries(teamLeaderboard.map((t, i) => [t.id, i + 1]));
  const playerRankMap = Object.fromEntries(playerLeaderboard.map((p, i) => [p.id, i + 1]));
  const totalWater = allPlayers.reduce((s,p) => s + p.shots, 0);

  const matchIdx    = tab - 1;
  const scoredCount = (tab >= 1 && tab <= 5)
    ? allPlayers.filter(p => p.matches[matchIdx] && p.matches[matchIdx].placement !== "").length : 0;

  const syncLabel = syncStatus === "saving" ? "Saving…" : syncStatus === "offline" ? "Offline" : "Live";

  return (
    <>
      <style>{CSS}</style>
      <div className="app">

        {/* ── Hero ── */}
        <div className="hero">
          <div className="trophy">🏆💧🎮</div>
          <h1 className="title">Fortnite Water Cup</h1>
          <p className="subtitle">World Championship · Official Scorecard</p>
          <div className="sync-bar">
            <span className={`sync-dot ${syncStatus}`} />
            <span>{syncLabel}</span>
          </div>
        </div>

        {/* ── Live Scoreboard ── */}
        <div className="scoreboard">
          <div className="sb-label">Live Standings · {totalWater} 💧 shots ({totalWater * 2} pts penalized)</div>
          <div className="sb-teams">
            {teamsWithStats.map((t, i) => {
              const pct  = t.pts > 0 ? Math.round((t.pts / maxTeamPts) * 100) : 0;
              const rank = teamRankMap[t.id];
              const isLeading = rank === 1 && t.pts > 0;
              return (
                <div className="sb-team" key={t.id} style={{ border:`1px solid ${isLeading ? t.color+"88" : t.color+"44"}` }}>
                  <div className="sb-rank" style={{ color:t.color }}>{rank ?? "—"}</div>
                  <div className="sb-team-name" style={{ color:t.color }}>{t.name || `Team ${i+1}`}</div>
                  <div className="sb-team-pts"  style={{ color:t.color }}>{t.pts}</div>
                  <div className="sb-team-sub">
                    💧 {t.shots} shots · {t.members.filter(m=>m.name.trim()).length} players
                  </div>
                  <div className={`sb-rank-badge ${isLeading ? "sb-rank-1" : "sb-rank-n"}`}>
                    {isLeading ? "👑 #1 LEADING" : rank ? `#${rank}` : "—"}
                  </div>
                  <div className="match-strip" style={{ marginTop:5 }}>
                    {t.matchPlacements.map((p, mi) => (
                      <MatchPip key={mi} placement={p} />
                    ))}
                  </div>
                  {t.wins > 0 && (
                    <div className="sb-win-badge">🏆 {t.wins} WIN{t.wins > 1 ? "S" : ""}</div>
                  )}
                  <div className="sb-team-bar" style={{ background:t.color, width:`${pct}%` }} />
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="tabs">
          {TABS.map((t, i) => (
            <button key={t} className={`tab${tab === i ? " active" : ""}`} onClick={() => setTab(i)}>
              {t}
            </button>
          ))}
        </div>

        {/* ══════════════ ROSTER ══════════════ */}
        {tab === 0 && (
          <>
            {teams.map((team, ti) => (
              <div className="team-block" key={team.id} style={{ borderColor:teamColor(ti)+"55" }}>
                <div className="team-header" style={{ borderBottomColor:teamColor(ti)+"44" }}>
                  <div className="team-name-wrap">
                    <label>Team Name</label>
                    <input
                      value={team.name}
                      placeholder={`Team ${ti+1}`}
                      onChange={e => updateTeamName(team.id, e.target.value)}
                      style={{ borderColor:teamColor(ti)+"66" }}
                    />
                  </div>
                  <button
                    className="btn btn-ghost"
                    style={{ padding:"6px 12px", fontSize:".78rem", flexShrink:0 }}
                    onClick={() => removeTeam(team.id)}
                  >🗑 Remove Team</button>
                </div>

                {team.members.map((m, mi) => (
                  <div className="member-row" key={m.id}>
                    <span className="member-num" style={{ color:teamColor(ti) }}>{mi+1}</span>
                    <input
                      value={m.name}
                      placeholder={`Player ${mi+1}`}
                      onChange={e => updateMemberName(team.id, m.id, e.target.value)}
                    />
                    <button
                      className="btn btn-ghost"
                      style={{ padding:"5px 9px", fontSize:".85rem", flexShrink:0 }}
                      onClick={() => removeMember(team.id, m.id)}
                    >✕</button>
                  </div>
                ))}

                <div style={{ padding:"8px 14px 12px" }}>
                  <button className="add-row" onClick={() => addMember(team.id)}>
                    + Add Teammate to {team.name || `Team ${ti+1}`}
                  </button>
                </div>
              </div>
            ))}

            <button className="add-row" style={{ marginBottom:18 }} onClick={addTeam}>
              + Add New Team
            </button>

            <div className="card">
              <div className="card-title">📋 Rules & Scoring</div>
              <div className="rules-grid">
                {[
                  ["👑","Victory Royale",  "+10 pts"],
                  ["🔥","Top 5",           "+7 pts"],
                  ["⬆️","Top 10",          "+5 pts"],
                  ["🎯","Elimination",      "+1 pt"],
                  ["🔄","Reboot",           "+1 pt"],
                  ["💥","Team Wipe",        "+2 pts"],
                  ["💧","Early Death Shot",    "−2 pts from team"],
                  ["💧","Mid-game Death Shot",  "−2 pts from team"],
                  ["💧","First Knocked Shot",   "−2 pts from team"],
                  ["🚫","No Rage Quitting", "Commissioner"],
                ].map(([icon,rule,val]) => (
                  <div className="rule-item" key={rule}>
                    <span className="rule-icon">{icon}</span>
                    <span style={{ flex:1 }}>{rule}</span>
                    <span style={{ color:C.accent, fontWeight:700, fontSize:".8rem" }}>{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ══════════════ MATCH TABS 1–5 ══════════════ */}
        {tab >= 1 && tab <= 5 && (
          <div className="card">
            <div className="card-title">
              🎮 Match {tab} Scorecard
              <span className="score-pill" style={{ marginLeft:"auto" }}>
                {scoredCount} / {allPlayers.length} entered
              </span>
            </div>

            {allPlayers.length === 0 ? (
              <p style={{ color:C.muted, textAlign:"center", padding:"24px 0" }}>
                Add players in the Roster tab first.
              </p>
            ) : (
              <div className="match-wrap">
                <table className="match-table">
                  <thead>
                    <tr>
                      <th>Player</th>
                      <th>Finish</th>
                      <th>Elims</th>
                      <th>Reboots</th>
                      <th>💥 Wipes</th>
                      <th>💧 Shots</th>
                      <th>Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teams.map((team, ti) => {
                      const visible = team.members.filter(m => m.name.trim());
                      if (!visible.length) return null;
                      const tc = teamColor(ti);
                      const teamPlace = team.matchPlacements[matchIdx];
                      const isWin = parseInt(teamPlace) === 1;

                      return (
                        <Fragment key={team.id}>
                          <tr className="team-sep">
                            <td colSpan={7} style={{ padding:"8px 10px" }}>
                              <div className="team-placement-row" style={{ background:`${tc}0d`, border:`1px solid ${tc}33` }}>
                                <span className="team-placement-label" style={{ color:tc }}>
                                  ▸ {team.name || `Team ${ti+1}`}
                                </span>
                                {(() => {
                                  const r = teamRankMap[team.id];
                                  const leading = r === 1 && (teamsWithStats.find(t=>t.id===team.id)?.pts||0) > 0;
                                  return r ? (
                                    <span className={`sb-rank-badge ${leading?"sb-rank-1":"sb-rank-n"}`} style={{ fontSize:".65rem" }}>
                                      {leading ? "👑 #1" : `#${r}`}
                                    </span>
                                  ) : null;
                                })()}
                                <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                                  <label className="inline" style={{ color:C.muted, fontSize:".65rem" }}>TEAM PLACEMENT</label>
                                  <select
                                    className="team-placement-sel"
                                    value={teamPlace}
                                    onChange={e => updateTeamMatchPlacement(team.id, matchIdx, e.target.value)}
                                    style={{
                                      borderColor: teamPlace ? tc+"88" : C.border,
                                      color: teamPlace ? C.text : C.muted,
                                    }}
                                  >
                                    <option value="">— Not set —</option>
                                    {Array.from({ length:20 },(_,n)=>n+1).map(n => (
                                      <option value={n} key={n}>
                                        {n===1 ? "👑 #1 — Victory Royale" : n<=5 ? `🔥 #${n} — Top 5` : `#${n}`}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                {teamPlace && (
                                  <span
                                    className="placement-result-badge"
                                    style={isWin
                                      ? { background:"rgba(255,215,0,.18)", border:"1px solid rgba(255,215,0,.4)", color:C.gold }
                                      : { background:`${tc}18`, border:`1px solid ${tc}44`, color:tc }
                                    }
                                  >
                                    {isWin ? "👑 VICTORY ROYALE" : PLACE_LABEL(teamPlace)}
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>

                          {visible.map(member => {
                            const m = member.matches[matchIdx];
                            const rowPts =
                                (parseInt(m.elims)      || 0) * ELIM_PTS
                              + (parseInt(m.reboots)    || 0) * REBOOT_PTS
                              + (parseInt(m.teamWipes)  || 0) * TEAM_WIPE_PTS;
                            const hasData = rowPts > 0 || (parseInt(m.waterShots)||0) > 0;

                            return (
                              <tr key={member.id}>
                                <td><div className="player-cell">{member.name}</div></td>
                                <td>
                                  <select
                                    className="placement-sel"
                                    value={m.placement}
                                    onChange={e => updateStat(team.id, member.id, matchIdx, "placement", e.target.value)}
                                  >
                                    <option value="">—</option>
                                    {Array.from({length:30},(_,n)=>n+1).map(n => (
                                      <option value={n} key={n}>
                                        {n===1?"👑 #1":n<=5?`🔥 #${n}`:`#${n}`}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td style={{ textAlign:"center" }}>
                                  <Tally value={m.elims}      onChange={v => updateStat(team.id, member.id, matchIdx, "elims", v)} />
                                </td>
                                <td style={{ textAlign:"center" }}>
                                  <Tally value={m.reboots}    onChange={v => updateStat(team.id, member.id, matchIdx, "reboots", v)} />
                                </td>
                                <td style={{ textAlign:"center" }}>
                                  <Tally value={m.teamWipes}  onChange={v => updateStat(team.id, member.id, matchIdx, "teamWipes", v)} />
                                </td>
                                <td style={{ textAlign:"center" }}>
                                  <Tally value={m.waterShots} color="water" onChange={v => updateStat(team.id, member.id, matchIdx, "waterShots", v)} />
                                </td>
                                <td style={{ textAlign:"center" }}>
                                  <span className="pts-badge" style={{
                                    background: hasData ? `${tc}18` : "transparent",
                                    color:      hasData ? tc        : C.muted,
                                    border:     `1px solid ${hasData ? tc+"44" : C.border}`,
                                  }}>{rowPts}</span>
                                </td>
                              </tr>
                            );
                          })}

                          {(() => {
                            const placePts = teamPlace !== "" ? PLACEMENT_PTS(teamPlace) : 0;
                            const memberPts = visible.reduce((sum, member) => {
                              const m = member.matches[matchIdx];
                              return sum
                                + (parseInt(m.elims)     || 0) * ELIM_PTS
                                + (parseInt(m.reboots)   || 0) * REBOOT_PTS
                                + (parseInt(m.teamWipes) || 0) * TEAM_WIPE_PTS;
                            }, 0);
                            const matchTotal = placePts + memberPts;
                            return (
                              <tr>
                                <td colSpan={7} style={{ textAlign:"right", paddingRight:8, color:C.muted, fontSize:".72rem", fontWeight:600, letterSpacing:".05em", borderTop:`1px solid ${tc}33` }}>
                                  MATCH TOTAL
                                  {placePts > 0 && <span style={{ color:tc, marginLeft:6 }}>+{placePts} placement</span>}
                                  <span className="pts-badge" style={{
                                    background:`${tc}22`, color:tc, border:`1px solid ${tc}66`,
                                    fontSize:".9rem", marginLeft:10,
                                  }}>{matchTotal}</span>
                                </td>
                              </tr>
                            );
                          })()}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ══════════════ LEADERBOARD ══════════════ */}
        {tab === 6 && (
          <>
            <div className="card">
              <div className="card-title">🏆 Team Standings</div>
              {teamLeaderboard.length === 0
                ? <p style={{ color:C.muted, textAlign:"center", padding:"20px 0" }}>No data yet.</p>
                : teamLeaderboard.map((team) => {
                  const rank = teamRankMap[team.id] ?? 99;
                  const rc = rank===1?"r1":rank===2?"r2":rank===3?"r3":"rn";
                  return (
                    <div className="lb-row" key={team.id} style={{ borderColor:team.color+"44" }}>
                      <div className={`rank-badge ${rc}`}>{rank}</div>
                      <div>
                        <div className="lb-name" style={{ color:team.color }}>{team.name||"Unnamed"}</div>
                        <div className="lb-sub">
                          {team.members.filter(m=>m.name.trim()).length} players
                          {team.wins > 0 && <span style={{ color:C.gold, marginLeft:6 }}>· 🏆 {team.wins} win{team.wins>1?"s":""}</span>}
                        </div>
                        <div className="match-strip" style={{ marginTop:4 }}>
                          {team.matchPlacements.map((p, mi) => (
                            <MatchPip key={mi} placement={p} />
                          ))}
                        </div>
                      </div>
                      <div className="lb-shots">💧 {team.shots}</div>
                      <div className="lb-pts" style={{ color:team.color }}>{team.pts}</div>
                    </div>
                  );
                })
              }
            </div>

            <div className="card">
              <div className="card-title">🎯 Player Rankings</div>
              {playerLeaderboard.length === 0
                ? <p style={{ color:C.muted, textAlign:"center", padding:"20px 0" }}>No data yet.</p>
                : playerLeaderboard.map((p) => {
                  const rank = playerRankMap[p.id] ?? 99;
                  const rc = rank===1?"r1":rank===2?"r2":rank===3?"r3":"rn";
                  return (
                    <div className="lb-row" key={p.id}>
                      <div className={`rank-badge ${rc}`}>{rank}</div>
                      <div>
                        <div className="lb-name">{p.name}</div>
                        <div className="lb-sub" style={{ color:p.teamColor }}>{p.teamName}</div>
                      </div>
                      <div className="lb-shots">💧 {p.shots}</div>
                      <div className="lb-pts">{p.pts}</div>
                    </div>
                  );
                })
              }
            </div>

            <div className="card">
              <div className="card-title">🎖️ Awards</div>
              <div className="rules-grid">
                {(() => {
                  const topTeam   = teamLeaderboard[0];
                  const topPlayer = playerLeaderboard[0];
                  const hydration = [...playerLeaderboard].sort((a,b)=>b.shots-a.shots)[0];
                  const mostWins  = [...teamsWithStats].filter(t=>t.members.some(m=>m.name.trim())).sort((a,b)=>b.wins-a.wins)[0];
                  return [
                    ["🥇","Champion Team",       topTeam   ? topTeam.name                                    : "TBD"],
                    ["🏆","Most Match Wins",      mostWins?.wins > 0 ? `${mostWins.name} (${mostWins.wins}W)` : "TBD"],
                    ["🎯","MVP",                  topPlayer ? topPlayer.name                                  : "TBD"],
                    ["💧","Hydration King/Queen", hydration?.shots>0 ? `${hydration.name} (${hydration.shots} shots)` : "TBD"],
                    ["🚑","Best Teammate",        "TBD"],
                    ["😂","Funniest Elimination", "TBD"],
                  ];
                })().map(([icon,award,winner]) => (
                  <div className="rule-item" key={award}>
                    <span className="rule-icon">{icon}</span>
                    <div>
                      <div style={{ fontWeight:700, fontSize:".88rem" }}>{award}</div>
                      <div style={{ color:C.accent, fontSize:".78rem" }}>{winner}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

      </div>
    </>
  );
}
