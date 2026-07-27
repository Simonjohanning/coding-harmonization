import { useEffect, useState } from "react";
import { NavLink, Route, Routes, useSearchParams } from "react-router-dom";
import Reconcile from "./routes/Reconcile";
import Frequency from "./routes/Frequency";
import {
  getCoder, setCoder, getPassword, setPassword, loadManifest,
} from "./lib/data";
import type { Coder, Manifest } from "./lib/types";

export default function App() {
  const [coder, setCoderState] = useState<Coder | null>(getCoder());
  const [pw, setPwState] = useState(getPassword());
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [params, setParams] = useSearchParams();

  useEffect(() => {
    loadManifest().then(setManifest).catch(() => setManifest(null));
  }, []);

  if (!coder || !pw) {
    return <Landing onReady={(c, p) => { setCoderState(c); setPwState(p); }} />;
  }
  if (!manifest) return <div className="app">Loading manifest…</div>;

  const version = Number(params.get("v") || manifest.current);

  return (
    <div className="app">
      <div className="topbar">
        <nav>
          <NavLink to="/reconcile" className={({ isActive }) => isActive ? "active" : ""}>Reconcile</NavLink>
          <NavLink to="/frequency" className={({ isActive }) => isActive ? "active" : ""}>Frequency</NavLink>
        </nav>
        <div className="spacer" />
        <label>Version:&nbsp;
          <select value={version}
            onChange={e => {
              const p = new URLSearchParams(params);
              p.set("v", e.target.value);
              setParams(p);
            }}>
            {manifest.versions.map(v => (
              <option key={v.n} value={v.n}>
                v{v.n}{v.n === manifest.current ? " (current)" : ""}
              </option>
            ))}
          </select>
        </label>
        <span className="pill">Coder {coder}</span>
        <button className="btn sm" onClick={() => {
          localStorage.removeItem("harm_coder");
          localStorage.removeItem("harm_password");
          location.reload();
        }}>Sign out</button>
      </div>

      <Routes>
        <Route path="/" element={<Reconcile version={version} coder={coder} isCurrent={version === manifest.current} />} />
        <Route path="/reconcile" element={<Reconcile version={version} coder={coder} isCurrent={version === manifest.current} />} />
        <Route path="/frequency" element={<Frequency version={version} />} />
      </Routes>
    </div>
  );
}

function Landing({ onReady }: { onReady: (c: Coder, p: string) => void }) {
  const [c, setC] = useState<Coder>("A");
  const [p, setP] = useState("");
  return (
    <div className="landing">
      <h1>Coding harmonization</h1>
      <label>Coder</label>
      <select value={c} onChange={e => setC(e.target.value as Coder)}>
        <option value="A">Coder A</option>
        <option value="B">Coder B</option>
      </select>
      <label>Shared password</label>
      <input type="password" value={p} onChange={e => setP(e.target.value)}
             placeholder="password for committing changes" />
      <button className="btn primary" onClick={() => {
        if (!p.trim()) return;
        setCoder(c);
        setPassword(p.trim());
        onReady(c, p.trim());
      }}>Continue</button>
    </div>
  );
}
