import { useEffect, useMemo, useState } from "react";
import { supabase, type Slot } from "./supabase";

function getTimesForDate(d: string) {
  if (!d) return [];
  const day = new Date(d + "T12:00:00").getDay();
  if (day === 0) return [{ group: "Mediodía", slots: ["13:00", "13:30", "14:00", "14:30", "15:00", "15:30"] }];
  if (day >= 2 && day <= 6) return [{ group: "Noche", slots: ["20:00", "20:30", "21:00", "21:30", "22:00"] }];
  return [];
}

function formatDateLabel(d: string) {
  const date = new Date(d + "T12:00:00");
  const todayLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const isToday = d === todayLocal;
  const label = date.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
  const cap = label.charAt(0).toUpperCase() + label.slice(1);
  return `${isToday ? "Hoy · " : ""}${cap}`;
}

export default function App() {
  return <Panel />;
}

function Panel() {
  const todayStr = useMemo(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10), []);
  const [date, setDate] = useState(todayStr);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [editing, setEditing] = useState<Slot | null>(null);
  const [showConfirmCancel, setShowConfirmCancel] = useState<Slot | null>(null);

  const byTime = useMemo(() => {
    const m = new Map<string, Slot[]>();
    slots.forEach(s => {
      const arr = m.get(s.time) ?? [];
      arr.push(s);
      m.set(s.time, arr);
    });
    return m;
  }, [slots]);

  async function load(d: string) {
    setLoading(true);
    const { data, error } = await supabase.from("slots").select("*").eq("date", d).order("time");
    if (!error && data) setSlots(data as Slot[]);
    setLoading(false);
  }

  useEffect(() => { load(date); }, [date]);

  // realtime
  useEffect(() => {
    const channel = supabase
      .channel(`slots-${date}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "slots", filter: `date=eq.${date}` }, () => load(date))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [date]);

  // polling fallback cada 4s por si realtime no está habilitado
  useEffect(() => {
    const id = setInterval(() => load(date), 4000);
    const onVis = () => document.visibilityState === "visible" && load(date);
    const onFocus = () => load(date);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(id); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onVis); };
  }, [date]);

  function go(delta: number) {
    const d = new Date(date + "T12:00:00");
    d.setDate(d.getDate() + delta);
    setDate(d.toLocaleDateString("en-CA"));
  }

  const isToday = date === todayStr;
  const isPast = (t: string) => {
    if (date !== todayStr) return false;
    const now = new Date();
    const cur = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
    return t < cur;
  };

  return (
    <div style={{ minHeight:"100vh", background:"var(--bg)"}}>
      <header className="panel-header">
        <div className="panel-logo">Dichoso</div>
        <div className="panel-sub">Reservas</div>

        <div className="date-nav">
          <button aria-label="Día anterior" onClick={()=>go(-1)}>‹</button>
          <div className="date-center">
            <div className="date-label">{formatDateLabel(date)}</div>
            <div className="date-sub">{date.split("-").reverse().join("/")}</div>
          </div>
          <button aria-label="Día siguiente" onClick={()=>go(1)}>›</button>
          <button className="btn-hoy" onClick={()=>setDate(todayStr)} style={{marginLeft:4}}>{isToday ? "HOY" : "Hoy"}</button>
          <input
            type="date"
            className="date-input"
            value={date}
            onChange={e=>e.target.value && setDate(e.target.value)}
            aria-label="Calendario"
          />
        </div>
      </header>

      <div className="slots">
        {loading && <p style={{textAlign:"center", color:"var(--muted)", fontSize:"0.85rem", fontFamily:"Roboto Condensed"}}>Cargando…</p>}
        {(() => { const timesForDate = getTimesForDate(date); if (timesForDate.length === 0 && !loading) return <p style={{textAlign:"center", color:"var(--muted)", padding:"2rem 1rem", fontFamily:"Roboto Condensed"}}>Cerrado — No hay servicio este día</p>; return timesForDate.map(g => (
          <div key={g.group}>
            <p style={{fontSize:"0.68rem", letterSpacing:"0.14em", textTransform:"uppercase", color:"var(--muted)", margin:"10px 2px 6px", fontFamily:"Roboto Condensed"}}>{g.group}</p>
            {g.slots.map(t => {
              const list = byTime.get(t) ?? [];
              const past = isPast(t);
              const reserved = list.length >= 3;
              const s = list[0];
              return (
                <div
                  key={t}
                  className={`slot ${reserved ? "reservado" : "disponible"}`}
                  style={{ opacity: past ? 0.45 : 1 }}
                  onClick={() => {
                    if (past) return;
                    if (reserved) return;
                    if (s) setEditing(s);
                    else setSelectedTime(t);
                  }}
                >
                  <div className="slot-left">
                    <div className="slot-time">{t}</div>
                    {s ? (
                      <div className="slot-detail">
                        {list.length}/3 · {s.persons} personas · {s.name} · {s.phone}{s.note ? ` · ${s.note}`: ""}{list.length > 1 ? ` +${list.length - 1} más` : ""}
                      </div>
                    ) : (
                      <div className="slot-detail" style={{color: past ? "var(--muted)" : "#27ae60"}}>{past ? "Pasada" : "Disponible"}</div>
                    )}
                  </div>
                  <div className="slot-right">
                    <span className="badge">
                      {reserved ? "🔴 Reservado" : past ? "⚪ Pasada" : list.length > 0 ? `🟢 ${list.length}/3` : "🟢 Disponible"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ))})()}
        <p style={{textAlign:"center", fontSize:"0.7rem", color:"var(--muted)", marginTop:10, fontFamily:"Roboto Condensed"}}>Toca una hora disponible para crear. Toca una reserva para editar/cancelar.</p>
      </div>

      {selectedTime && (
        <CreateSheet date={date} time={selectedTime} onClose={()=>setSelectedTime(null)} onCreated={()=>{ setSelectedTime(null); load(date); }} />
      )}
      {editing && !showConfirmCancel && (
        <EditSheet slot={editing} onClose={()=>setEditing(null)} onCancelRequest={()=>setShowConfirmCancel(editing)} onSaved={()=>{ setEditing(null); load(date); }} allSlots={slots} />
      )}
      {showConfirmCancel && (
        <div className="sheet" onClick={()=>setShowConfirmCancel(null)}>
          <div className="sheet-card" onClick={e=>e.stopPropagation()}>
            <div className="sheet-title">¿Cancelar esta reserva?</div>
            <p className="sheet-sub">{showConfirmCancel.date.split("-").reverse().join("/")} · {showConfirmCancel.time} · {showConfirmCancel.persons} personas · {showConfirmCancel.name}</p>
            <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginTop:14}}>
              <button className="btn-ghost" onClick={()=>setShowConfirmCancel(null)}>Volver</button>
              <button
                className="btn-primary btn-danger"
                onClick={async ()=>{
                  const { error } = await supabase.from("slots").delete().eq("id", showConfirmCancel.id);
                  if (error) alert(error.message);
                  else { setShowConfirmCancel(null); setEditing(null); load(date); }
                }}
              >Cancelar reserva</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateSheet({ date, time, onClose, onCreated }: { date: string; time: string; onClose: ()=>void; onCreated: ()=>void; }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [persons, setPersons] = useState("2");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!name.trim() || !phone.trim() || !persons) { setErr("Rellena nombre, teléfono y personas"); return; }
    setSaving(true);
    const { data: existing } = await supabase.from("slots").select("id").eq("date", date).eq("time", time);
    if (existing && existing.length >= 3) {
      setErr("Esa hora ya está completa (3/3). Elige otra.");
      setSaving(false);
      return;
    }
    const { error } = await supabase.from("slots").insert({ date, time, name: name.trim(), phone: phone.trim(), persons, note: note.trim() || null });
    if (error) {
      if ((error as any).code === "23505") setErr("Esa hora ya está reservada.");
      else setErr(error.message);
      setSaving(false);
      return;
    }
    setSaving(false);
    onCreated();
  }

  return (
    <div className="sheet" onClick={onClose}>
      <div className="sheet-card" onClick={e=>e.stopPropagation()}>
        <div className="sheet-title">Nueva reserva</div>
        <div className="sheet-sub">{date.split("-").reverse().join("/")} · {time}</div>
        <form onSubmit={onSubmit} className="form-grid">
          <input className="input" placeholder="Nombre" value={name} onChange={e=>setName(e.target.value)} required autoFocus />
          <div className="row2">
            <input className="input" placeholder="Teléfono" value={phone} onChange={e=>setPhone(e.target.value.replace(/[^0-9]/g,"").slice(0,15))} inputMode="numeric" required />
            <select className="input" value={persons} onChange={e=>setPersons(e.target.value)} required>
              {[1,2,3,4,5,6,7,8,9,10,12,15,20].map(n=> <option key={n} value={String(n)}>{n} personas</option>)}
            </select>
          </div>
          <div className="row2">
            <input className="input" type="date" value={date} readOnly style={{background:"#F0E6D8"}} />
            <input className="input" value={time} readOnly style={{background:"#F0E6D8"}} />
          </div>
          <textarea className="input" placeholder="Notas (opcional) — alergias, tronas…" value={note} onChange={e=>setNote(e.target.value)} />
          {err && <p style={{color:"#c0392b", fontSize:"0.85rem", textAlign:"center"}}>{err}</p>}
          <button className="btn-primary" disabled={saving} type="submit">{saving ? "Guardando…" : "Confirmar reserva"}</button>
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
        </form>
      </div>
    </div>
  );
}

function EditSheet({ slot, onClose, onCancelRequest, onSaved, allSlots }: { slot: Slot; onClose: ()=>void; onCancelRequest: ()=>void; onSaved: ()=>void; allSlots: Slot[] }) {
  const [name, setName] = useState(slot.name);
  const [phone, setPhone] = useState(slot.phone);
  const [persons, setPersons] = useState(slot.persons);
  const [date, setDate] = useState(slot.date);
  const [time, setTime] = useState(slot.time);
  const [note, setNote] = useState(slot.note ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const isSameSlot = date === slot.date && time === slot.time;

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!name.trim() || !phone.trim()) { setErr("Faltan datos"); return; }
    setSaving(true);

    if (!isSameSlot) {
      const { data: clash } = await supabase.from("slots").select("id").eq("date", date).eq("time", time);
      if (clash && clash.length >= 3) {
        setErr("La nueva hora ya está completa (3/3).");
        setSaving(false);
        return;
      }
    }

    const { error } = await supabase.from("slots").update({ date, time, name: name.trim(), phone: phone.trim(), persons, note: note.trim() || null }).eq("id", slot.id);
    if (error) {
      if ((error as any).code === "23505") setErr("Esa hora ya está ocupada.");
      else setErr(error.message);
      setSaving(false);
      return;
    }
    setSaving(false);
    onSaved();
  }

  // horas para el selector según fecha elegida (si cambia de fecha, filtra ocupadas de esa fecha)
  const timesForDate = allSlots.filter(s => s.date === date && s.id !== slot.id).map(s=>s.time);

  return (
    <div className="sheet" onClick={onClose}>
      <div className="sheet-card" onClick={e=>e.stopPropagation()}>
        <div className="sheet-title">Editar reserva</div>
        <div className="sheet-sub">{slot.date.split("-").reverse().join("/")} · {slot.time} · {slot.persons} pers. · {slot.name}</div>
        <form onSubmit={onSave} className="form-grid">
          <input className="input" value={name} onChange={e=>setName(e.target.value)} placeholder="Nombre" required />
          <div className="row2">
            <input className="input" value={phone} onChange={e=>setPhone(e.target.value.replace(/[^0-9]/g,"").slice(0,15))} inputMode="numeric" required />
            <select className="input" value={persons} onChange={e=>setPersons(e.target.value)}>
              {[1,2,3,4,5,6,7,8,9,10,12,15,20].map(n=> <option key={n} value={String(n)}>{n} pers.</option>)}
            </select>
          </div>
          <div className="row2">
            <input className="input" type="date" value={date} onChange={e=>setDate(e.target.value)} required />
            <select className="input" value={time} onChange={e=>setTime(e.target.value)} required>
              {getTimesForDate(date).flatMap(g=>g.slots).map(t=>{
                const taken = timesForDate.includes(t);
                return <option key={t} value={t} disabled={taken}>{t}{taken?" - ocupado":""}</option>;
              })}
            </select>
          </div>
          <textarea className="input" value={note} onChange={e=>setNote(e.target.value)} placeholder="Notas" />
          {err && <p style={{color:"#c0392b", fontSize:"0.85rem", textAlign:"center"}}>{err}</p>}
          <button className="btn-primary" disabled={saving} type="submit">{saving?"Guardando…":"Guardar cambios"}</button>
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10}}>
            <button type="button" className="btn-ghost" onClick={onClose}>Volver</button>
            <button type="button" className="btn-primary btn-danger" onClick={onCancelRequest}>Cancelar reserva</button>
          </div>
          {!isSameSlot && <p style={{fontSize:"0.7rem", color:"var(--muted)", textAlign:"center", fontFamily:"Roboto Condensed"}}>Al cambiar hora, la antigua quedará libre y la nueva ocupada.</p>}
        </form>
      </div>
    </div>
  );
}
