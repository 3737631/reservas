import { useEffect, useMemo, useState } from "react";
import {
  supabase,
  type Slot,
  type Zone,
  BLOQUEO,
  SALON_CERRADO,
  CIERRE_DIA,
  cierreDe,
  salonCerradoEn,
  servicioDe,
  type Servicio,
  SALON_POR_SERVICIO,
  TERRAZA_POR_HORA,
  mensajeError,
  salonEnServicio,
} from "./supabase";

function getTimesForDate(d: string) {
  if (!d) return [];
  const day = new Date(d + "T12:00:00").getDay();
  if (day === 2) return [];
  if (day === 0) return [{ group: "Mediodía", slots: ["13:00", "13:30", "14:00", "14:30", "15:00", "15:30"] }];
  if (day >= 3 && day <= 6)
    return [
      { group: "Mañana", slots: ["12:00", "12:30", "13:00", "13:30", "14:00"] },
      { group: "Noche", slots: ["20:00", "20:30", "21:00", "21:30", "22:00"] },
    ];
  return [];
}

function dayName(d: string) {
  return ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"][new Date(d + "T12:00:00").getDay()];
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
  const [managing, setManaging] = useState<string | null>(null);
  const [editing, setEditing] = useState<Slot | null>(null);
  const [showConfirmCancel, setShowConfirmCancel] = useState<Slot | null>(null);

  const [busySalon, setBusySalon] = useState(false);
  const [salonErr, setSalonErr] = useState("");

  const byTime = useMemo(() => {
    const m = new Map<string, Slot[]>();
    slots.filter(s => s.name !== SALON_CERRADO).forEach(s => {
      const arr = m.get(s.time) ?? [];
      arr.push(s);
      m.set(s.time, arr);
    });
    return m;
  }, [slots]);

  // Cierre antiguo de "dia completo" (hora 00:00): cierra comida y cena a la vez.
  const cierreDiaCompleto = slots.some(s => s.name === SALON_CERRADO && s.time === CIERRE_DIA);

  async function cerrarServicio(servicio: Servicio) {
    setSalonErr("");
    setBusySalon(true);
    const { error } = await supabase.from("slots").insert({ date, time: cierreDe(servicio), name: SALON_CERRADO, phone: "-", persons: "0", note: `salón cerrado (${servicio})`, zone: "salon" });
    if (error) setSalonErr(mensajeError(error.message));
    setBusySalon(false);
    load(date);
  }

  async function abrirServicio(servicio: Servicio) {
    setSalonErr("");
    setBusySalon(true);
    if (cierreDiaCompleto) {
      // Se sustituye el cierre de dia completo por el del otro servicio, que se queda cerrado.
      const otro: Servicio = servicio === "comida" ? "cena" : "comida";
      const yaCerradoOtro = slots.some(s => s.name === SALON_CERRADO && s.time === cierreDe(otro));
      if (!yaCerradoOtro) {
        const { error: e1 } = await supabase.from("slots").insert({ date, time: cierreDe(otro), name: SALON_CERRADO, phone: "-", persons: "0", note: `salón cerrado (${otro})`, zone: "salon" });
        if (e1) { setSalonErr(mensajeError(e1.message)); setBusySalon(false); load(date); return; }
      }
      const { error: e2 } = await supabase.from("slots").delete().eq("date", date).eq("name", SALON_CERRADO).eq("time", CIERRE_DIA);
      if (e2) setSalonErr(mensajeError(e2.message));
    } else {
      const { error } = await supabase.from("slots").delete().eq("date", date).eq("name", SALON_CERRADO).eq("time", cierreDe(servicio));
      if (error) setSalonErr(mensajeError(error.message));
    }
    setBusySalon(false);
    load(date);
  }

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
        {getTimesForDate(date).length > 0 && (
          <div style={{ border: "1px solid rgba(0,0,0,.12)", borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
            <div style={{ fontFamily: "Roboto Condensed", fontSize: "0.9rem", marginBottom: 6 }}><strong>Salón</strong></div>
            {getTimesForDate(date).map(g => {
              const servicio = servicioDe(g.slots[0]);
              const cerrado = salonCerradoEn(slots, servicio);
              return (
                <div key={g.group} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "6px 8px", borderRadius: 8, marginBottom: 4, background: cerrado ? "#FFF5F5" : "transparent" }}>
                  <div style={{ flex: 1, minWidth: 150, fontFamily: "Roboto Condensed", fontSize: "0.88rem" }}>
                    <span style={{ textTransform: "capitalize" }}>{servicio}</span>{" "}
                    {cerrado ? (
                      <span style={{ color: "#c0392b" }}>🔒 cerrado: en la web solo terraza</span>
                    ) : (
                      <span style={{ color: "var(--muted)" }}>{salonEnServicio(slots, g.slots[0])}/{SALON_POR_SERVICIO} reservas</span>
                    )}
                  </div>
                  {cerrado ? (
                    <button className="btn-ghost" disabled={busySalon} onClick={() => abrirServicio(servicio)}>Reabrir {servicio}</button>
                  ) : (
                    <button className="btn-ghost" disabled={busySalon} onClick={() => cerrarServicio(servicio)}>🔒 Cerrar salón en {servicio}</button>
                  )}
                </div>
              );
            })}
            {cierreDiaCompleto && (
              <p style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: 4, fontFamily: "Roboto Condensed" }}>
                Este día estaba cerrado entero. Reabre solo la comida o solo la cena y el otro servicio se queda cerrado.
              </p>
            )}
            {salonErr && <p style={{ color: "#c0392b", fontSize: "0.8rem", marginTop: 6 }}>{salonErr}</p>}
          </div>
        )}
        {loading &&<p style={{textAlign:"center", color:"var(--muted)", fontSize:"0.85rem", fontFamily:"Roboto Condensed"}}>Cargando…</p>}
        {(() => { const timesForDate = getTimesForDate(date); if (timesForDate.length === 0 && !loading) return <p style={{textAlign:"center", color:"var(--muted)", padding:"2rem 1rem", fontFamily:"Roboto Condensed"}}>{dayName(date) === "Martes" ? "Martes cerrado" : "Cerrado — No hay servicio este día"}</p>; return timesForDate.map(g => (
          <div key={g.group}>
            <p style={{fontSize:"0.68rem", letterSpacing:"0.14em", textTransform:"uppercase", color:"var(--muted)", margin:"10px 2px 6px", fontFamily:"Roboto Condensed"}}>{g.group}</p>
            {g.slots.map(t => {
              const list = byTime.get(t) ?? [];
              const past = isPast(t);
              const terrazaCount = list.filter(x => x.zone !== "salon").length;
              const salonCount = list.length - terrazaCount;
              const reserved = terrazaCount >= TERRAZA_POR_HORA;
              const s = list[0];
              return (
                <div
                  key={t}
                  className={`slot ${reserved ? "reservado" : "disponible"}`}
                  style={{ opacity: past ? 0.45 : 1 }}
                  onClick={() => {
                    if (past) return;
                    setManaging(t);
                  }}
                >
                  <div className="slot-left">
                    <div className="slot-time">
                      {t} <span style={{ fontSize: "0.78rem", fontWeight: 400, color: reserved ? "#c0392b" : "var(--muted)", marginLeft: 8, verticalAlign: "middle" }}>{terrazaCount}/{TERRAZA_POR_HORA}{salonCount > 0 ? ` · salón ${salonCount}` : ""}</span>
                    </div>
                    {s ? (
                      <div className="slot-detail">
                        {list.slice(0, 2).map((x, idx) => (
                          <span key={x.id}>
                            {idx > 0 && " · "}
                            {x.name === BLOQUEO ? "🔒 Cerrado (reservas por teléfono)" : `${x.zone === "salon" ? "Salón" : "Terraza"} · ${x.persons} pers. · ${x.name} · ${x.phone}`}
                          </span>
                        ))}
                        {list.length > 2 ? ` +${list.length - 2} más` : ""}
                      </div>
                    ) : (
                      <div className="slot-detail" style={{ color: past ? "var(--muted)" : "#27ae60" }}>{past ? "Pasada" : "Disponible"}</div>
                    )}
                  </div>
                  <div className="slot-right">
                    <span className="badge">
                      {reserved ? "🔴 Reservado" : past ? "⚪ Pasada" : "🟢 Disponible"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ))})()}
        <p style={{textAlign:"center", fontSize:"0.7rem", color:"var(--muted)", marginTop:10, fontFamily:"Roboto Condensed"}}>Toca una hora para gestionarla: añadir reservas, editar, cancelar o cerrar la hora.</p>
      </div>

      {managing && (
        <ManageSheet
          date={date}
          time={managing}
          list={byTime.get(managing) ?? []}
          allSlots={slots}
          onClose={()=>setManaging(null)}
          onAdd={()=>{ setManaging(null); setSelectedTime(managing); }}
          onEdit={s=>{ setManaging(null); setEditing(s); }}
          onChanged={()=>load(date)}
        />
      )}

      {selectedTime && (
        <CreateSheet date={date} time={selectedTime} allSlots={slots} onClose={()=>setSelectedTime(null)} onCreated={()=>{ setSelectedTime(null); load(date); }} />
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

function ManageSheet({ date, time, list, allSlots, onClose, onAdd, onEdit, onChanged }: { date: string; time: string; list: Slot[]; allSlots: Slot[]; onClose: ()=>void; onAdd: ()=>void; onEdit: (s: Slot)=>void; onChanged: ()=>void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const terraza = list.filter(s => s.zone !== "salon");
  const blocks = list.filter(s => s.name === BLOQUEO).length;
  const free = TERRAZA_POR_HORA - terraza.length;
  const salonCerrado = salonCerradoEn(allSlots, servicioDe(time));
  const salonCount = salonEnServicio(allSlots, time);
  const salonFree = !salonCerrado && salonCount < SALON_POR_SERVICIO;

  async function blockHour() {
    setErr("");
    setBusy(true);
    const need = TERRAZA_POR_HORA - terraza.length;
    if (need <= 0) { setBusy(false); return; }
    const rows = Array.from({ length: need }, () => ({ date, time, name: BLOQUEO, phone: "-", persons: "0", note: "hora cerrada" }));
    const { error } = await supabase.from("slots").insert(rows);
    if (error) setErr(mensajeError(error.message));
    setBusy(false);
    onChanged();
  }

  async function unblockHour() {
    setErr("");
    setBusy(true);
    const { error } = await supabase.from("slots").delete().eq("date", date).eq("time", time).eq("name", BLOQUEO);
    if (error) setErr(mensajeError(error.message));
    setBusy(false);
    onChanged();
  }

  return (
    <div className="sheet" onClick={onClose}>
      <div className="sheet-card" onClick={e=>e.stopPropagation()}>
        <div className="sheet-title">{time} · {date.split("-").reverse().join("/")}</div>
        <div className="sheet-sub">
          Terraza {terraza.length}/{TERRAZA_POR_HORA} · {free > 0 ? `${free} libres` : "completa"}
          {" · "}
          Salón {salonCerrado ? "cerrado" : `${salonCount}/${SALON_POR_SERVICIO} en ${time < "17:00" ? "comida" : "cena"}`}
        </div>

        <div style={{display:"grid", gap:8, marginTop:14, textAlign:"left"}}>
          {list.length === 0 && <p style={{fontSize:"0.8rem", color:"var(--muted)", fontFamily:"Roboto Condensed"}}>Sin reservas en esta hora.</p>}
          {list.map(s => (
            <div key={s.id} style={{display:"flex", alignItems:"center", gap:8, padding:"8px 10px", border:"1px solid rgba(0,0,0,.12)", borderRadius:8}}>
              <div style={{flex:1, minWidth:0}}>
                <div style={{fontSize:"0.92rem", fontWeight:600, fontFamily:"Roboto Condensed"}}>
                  {s.name === BLOQUEO ? "🔒 Hora cerrada" : `${s.zone === "salon" ? "Salón" : "Terraza"} · ${s.name} · ${s.persons} pers.`}
                </div>
                {s.name !== BLOQUEO && (
                  <div style={{fontSize:"0.72rem", color:"var(--muted)", fontFamily:"Roboto Condensed"}}>
                    {s.phone}{s.note ? ` · ${s.note}` : ""}
                  </div>
                )}
              </div>
              {s.name !== BLOQUEO && (
                <button className="btn-ghost" style={{padding:"6px 10px", fontSize:"0.72rem"}} onClick={()=>onEdit(s)}>Editar</button>
              )}
            </div>
          ))}
        </div>

        {err && <p style={{color:"#c0392b", fontSize:"0.85rem", textAlign:"center", marginTop:10}}>{err}</p>}

        <div style={{display:"grid", gap:8, marginTop:14}}>
          {free > 0 || salonFree ? (
            <button className="btn-primary" onClick={onAdd}>
              + Añadir reserva ({[free > 0 ? `${free} en terraza` : "", salonFree ? "salón" : ""].filter(Boolean).join(" · ")})
            </button>
          ) : (
            <p style={{fontSize:"0.78rem", color:"#c0392b", textAlign:"center", fontFamily:"Roboto Condensed"}}>Terraza completa (3/3) y salón {salonCerrado ? "cerrado" : "completo"}</p>
          )}
          {blocks > 0 ? (
            <button className="btn-ghost" disabled={busy} onClick={unblockHour}>Reabrir hora (quitar {blocks} {blocks === 1 ? "cierre" : "cierres"})</button>
          ) : (
            <button className="btn-ghost" disabled={busy} onClick={blockHour}>🔒 Cerrar hora (reservas por teléfono)</button>
          )}
          <button className="btn-ghost" onClick={onClose}>Volver</button>
        </div>
        <p style={{fontSize:"0.68rem", color:"var(--muted)", textAlign:"center", marginTop:10, fontFamily:"Roboto Condensed"}}>
          Al cerrar la hora se ocupa con reservas internas: en la web aparecerá como "reservado".
        </p>
      </div>
    </div>
  );
}

function CreateSheet({ date, time, allSlots, onClose, onCreated }: { date: string; time: string; allSlots: Slot[]; onClose: ()=>void; onCreated: ()=>void; }) {
  const terrazaCount = allSlots.filter(s => s.date === date && s.time === time && s.zone !== "salon").length;
  const salonCerrado = salonCerradoEn(allSlots, servicioDe(time));
  const terrazaFree = terrazaCount < TERRAZA_POR_HORA;
  const salonFree = !salonCerrado && salonEnServicio(allSlots, time) < SALON_POR_SERVICIO;
  const [zone, setZone] = useState<Zone>(terrazaFree ? "terraza" : "salon");
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
    if (zone === "terraza") {
      // Solo cuenta terraza (y reservas antiguas sin zona); el salon tiene su propio limite.
      const { data: existing } = await supabase.from("slots").select("id,zone").eq("date", date).eq("time", time);
      const ocupadas = (existing ?? []).filter((r: { zone: string | null }) => r.zone !== "salon").length;
      if (ocupadas >= TERRAZA_POR_HORA) {
        setErr("La terraza ya está completa a esa hora (3/3). Elige salón u otra hora.");
        setSaving(false);
        return;
      }
    }
    const fila = { date, time, name: name.trim(), phone: phone.trim(), persons, note: note.trim() || null, zone };
    // origen "panel": la reserva la apunta el propio restaurante, asi que no genera aviso de Telegram.
    let { error } = await supabase.from("slots").insert({ ...fila, origen: "panel" });
    // Si la columna "origen" aun no existe en la base de datos, se guarda igual (sin marcar origen).
    if (error && /origen/i.test(error.message)) ({ error } = await supabase.from("slots").insert(fila));
    if (error) {
      if ((error as any).code === "23505") setErr("Esa hora ya está reservada.");
      else setErr(mensajeError(error.message));
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
          <select className="input" value={zone} onChange={e=>setZone(e.target.value as Zone)} required>
            <option value="terraza" disabled={!terrazaFree}>Terraza{terrazaFree ? "" : " - completa"}</option>
            <option value="salon" disabled={!salonFree}>Salón{salonFree ? "" : salonCerrado ? " - cerrado" : " - completo"}</option>
          </select>
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
  const [zone, setZone] = useState<Zone>(slot.zone === "salon" ? "salon" : "terraza");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const isSameSlot = date === slot.date && time === slot.time && zone === (slot.zone === "salon" ? "salon" : "terraza");

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!name.trim() || !phone.trim()) { setErr("Faltan datos"); return; }
    setSaving(true);

    if (!isSameSlot && zone === "terraza") {
      const { data: clash } = await supabase.from("slots").select("id,zone").eq("date", date).eq("time", time).neq("id", slot.id);
      const ocupadas = (clash ?? []).filter((r: { zone: string | null }) => r.zone !== "salon").length;
      if (ocupadas >= TERRAZA_POR_HORA) {
        setErr("La terraza ya está completa a esa hora (3/3).");
        setSaving(false);
        return;
      }
    }

    // El limite del salon (2 por servicio) y el cierre del dia los comprueba la base de datos.
    const { error } = await supabase.from("slots").update({ date, time, name: name.trim(), phone: phone.trim(), persons, note: note.trim() || null, zone }).eq("id", slot.id);
    if (error) {
      if ((error as any).code === "23505") setErr("Esa hora ya está ocupada.");
      else setErr(mensajeError(error.message));
      setSaving(false);
      return;
    }
    setSaving(false);
    onSaved();
  }

  // horas para el selector según fecha elegida (deshabilita solo si esa fecha/hora ya está 3/3)
  const countsForDate = useMemo(() => {
    const m = new Map<string, number>();
    allSlots.filter(s => s.date === date && s.id !== slot.id && s.zone !== "salon" && s.name !== SALON_CERRADO).forEach(s => m.set(s.time, (m.get(s.time) ?? 0) + 1));
    return m;
  }, [allSlots, date, slot.id]);

  return (
    <div className="sheet" onClick={onClose}>
      <div className="sheet-card" onClick={e=>e.stopPropagation()}>
        <div className="sheet-title">Editar reserva</div>
        <div className="sheet-sub">{slot.date.split("-").reverse().join("/")} · {slot.time} · {slot.persons} pers. · {slot.name}</div>
        <form onSubmit={onSave} className="form-grid">
          <select className="input" value={zone} onChange={e=>setZone(e.target.value as Zone)}>
            <option value="terraza">Terraza</option>
            <option value="salon">Salón</option>
          </select>
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
                const n = countsForDate.get(t) ?? 0;
                const full = n >= 3;
                return <option key={t} value={t} disabled={full}>{t}{full?" - completa":n>0?` - ${n}/3`:""}</option>;
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
