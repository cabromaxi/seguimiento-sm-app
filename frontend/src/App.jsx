import React, { useEffect, useMemo, useState } from 'react';

const SUPABASE_URL = 'https://iqnvhwlfrpmgijggfevl.supabase.co';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const API_BASE = `${SUPABASE_URL}/rest/v1`;
const LS_CASES = 'sm_cases_offline_v2';
const LS_QUEUE = 'sm_sync_queue_v2';
const LS_SELECTED = 'sm_selected_case_v2';

function supabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function sbFetch(path, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Faltan variables de Supabase');
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: supabaseHeaders(options.headers || {}),
  });
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return null;
  return res.json();
}

function cleanUndefined(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined));
}

function usuarioPayload(data) {
  return cleanUndefined({
    client_id: data.client_id,
    nombre: data.nombre,
    rut: data.rut,
    nacimiento: data.nacimiento,
    direccion: data.direccion,
    comuna: data.comuna,
    telefono: data.telefono,
    establecimiento: data.establecimiento,
    diagnostico: data.diagnostico,
    estado: data.estado || 'Activo',
    observaciones: data.observaciones,
    lat: data.lat,
    lng: data.lng,
    created_at: data.created_at,
    updated_at: data.updated_at || new Date().toISOString(),
    deleted_at: data.deleted_at || null,
  });
}

function familiaPayload(data) {
  return cleanUndefined({
    client_id: data.client_id,
    usuario_client_id: data.usuario_client_id,
    nombre: data.nombre,
    parentesco: data.parentesco,
    edad: data.edad,
    convive: data.convive,
    telefono: data.telefono,
    observaciones: data.observaciones,
    created_at: data.created_at,
    updated_at: data.updated_at || new Date().toISOString(),
    deleted_at: data.deleted_at || null,
  });
}

function eventoPayload(data) {
  const metadata = data.metadata || data.metadata_json || {};
  return cleanUndefined({
    client_id: data.client_id,
    usuario_client_id: data.usuario_client_id,
    categoria: data.categoria,
    tipo: data.tipo,
    fecha: data.fecha,
    titulo: data.titulo,
    detalle: data.detalle,
    lugar: data.lugar,
    metadata_json: metadata,
    metadata,
    created_at: data.created_at,
    updated_at: data.updated_at || new Date().toISOString(),
    deleted_at: data.deleted_at || null,
  });
}

async function insertRow(table, payload) {
  const rows = await sbFetch(`/${table}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(payload),
  });
  return rows?.[0] || payload;
}

async function patchByClientId(table, clientId, payload) {
  const rows = await sbFetch(`/${table}?client_id=eq.${encodeURIComponent(clientId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(payload),
  });
  return rows?.[0] || payload;
}

async function saveRemote(entity, data) {
  if (entity === 'usuario') {
    const payload = usuarioPayload(data);
    return data.id ? patchByClientId('usuarios', data.client_id, payload) : insertRow('usuarios', payload);
  }
  if (entity === 'familia') {
    const payload = familiaPayload(data);
    return data.id ? patchByClientId('familia', data.client_id, payload) : insertRow('familia', payload);
  }
  if (entity === 'evento') {
    const payload = eventoPayload(data);
    return data.id ? patchByClientId('eventos', data.client_id, payload) : insertRow('eventos', payload);
  }
  throw new Error(`Entidad no soportada: ${entity}`);
}

async function loadFromSupabase() {
  const [usuarios, familia, eventos] = await Promise.all([
    sbFetch('/usuarios?deleted_at=is.null&order=updated_at.desc'),
    sbFetch('/familia?deleted_at=is.null&order=id.asc'),
    sbFetch('/eventos?deleted_at=is.null&order=fecha.desc'),
  ]);
  return (usuarios || []).map((usuario) => ({
    ...usuario,
    familia: (familia || []).filter((f) => f.usuario_client_id === usuario.client_id),
    eventos: (eventos || [])
      .filter((e) => e.usuario_client_id === usuario.client_id)
      .map((e) => ({ ...e, metadata: e.metadata_json || e.metadata || {} })),
  }));
}

const moduleStyles = {
  visitas: { bg: '#ecfdf5', text: '#047857', fill: '#10b981', accent: '#d1fae5', label: 'Visitas domiciliarias' },
  coordinaciones: { bg: '#f0f9ff', text: '#0369a1', fill: '#0ea5e9', accent: '#e0f2fe', label: 'Coordinaciones' },
  reuniones: { bg: '#eef2ff', text: '#4338ca', fill: '#6366f1', accent: '#e0e7ff', label: 'Reuniones' },
  reuniones_ampliadas: { bg: '#f5f3ff', text: '#6d28d9', fill: '#8b5cf6', accent: '#ede9fe', label: 'Reuniones ampliadas' },
  psicologia: { bg: '#fff1f2', text: '#be123c', fill: '#f43f5e', accent: '#ffe4e6', label: 'Atenciones psicológicas' },
  psiquiatria: { bg: '#fffbeb', text: '#b45309', fill: '#f59e0b', accent: '#fef3c7', label: 'Atenciones psiquiátricas' },
  familia: { bg: '#f0fdfa', text: '#0f766e', fill: '#14b8a6', accent: '#ccfbf1', label: 'Trabajo con la familia' },
  pastilleros: { bg: '#f7fee7', text: '#4d7c0f', fill: '#84cc16', accent: '#ecfccb', label: 'Entrega de pastilleros' },
  hospitalizaciones: { bg: '#fff7ed', text: '#c2410c', fill: '#f97316', accent: '#ffedd5', label: 'Hospitalizaciones' },
  urgencias: { bg: '#fef2f2', text: '#b91c1c', fill: '#ef4444', accent: '#fee2e2', label: 'Visitas a urgencia' },
  otros: { bg: '#f1f5f9', text: '#475569', fill: '#64748b', accent: '#e2e8f0', label: 'Otros' },
};

const moduleKeys = Object.keys(moduleStyles);

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function nowDate() { return new Date().toISOString().slice(0, 10); }

function safeRead(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function getMonthMatrix(year, month) {
  const firstDay = new Date(year, month, 1);
  const startWeekDay = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    let day; let currentMonth = true;
    if (i < startWeekDay) { day = prevMonthDays - startWeekDay + i + 1; currentMonth = false; cells.push({ day, currentMonth, date: new Date(year, month - 1, day) }); }
    else if (i >= startWeekDay + daysInMonth) { day = i - (startWeekDay + daysInMonth) + 1; currentMonth = false; cells.push({ day, currentMonth, date: new Date(year, month + 1, day) }); }
    else { day = i - startWeekDay + 1; cells.push({ day, currentMonth, date: new Date(year, month, day) }); }
  }
  return cells;
}

function formatDate(value) {
  if (!value) return '-';
  return new Date(`${value}T00:00:00`).toLocaleDateString('es-CL');
}

function diffHuman(startDate, startTime, endDate, endTime) {
  if (!(startDate && startTime && endDate && endTime)) return '';
  const start = new Date(`${startDate}T${startTime}`);
  const end = new Date(`${endDate}T${endTime}`);
  const diff = end - start;
  if (Number.isNaN(diff) || diff < 0) return '';
  const mins = Math.floor(diff / 60000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const minutes = mins % 60;
  const parts = [];
  if (days) parts.push(`${days} día${days === 1 ? '' : 's'}`);
  if (hours) parts.push(`${hours} hora${hours === 1 ? '' : 's'}`);
  parts.push(`${minutes} min`);
  return parts.join(' · ');
}

function countsFromEvents(events) {
  return moduleKeys.reduce((acc, key) => ({ ...acc, [key]: events.filter((e) => e.categoria === key).length }), {});
}

function enqueue(queue, entity, data) {
  return [...queue, { op_id: uid(), entity, action: 'upsert', data, created_at: new Date().toISOString(), status: 'pending' }];
}

function DashboardChart({ counts, title }) {
  const max = Math.max(1, ...Object.values(counts));
  return (
    <div className="card">
      <h3 className="section-title">{title}</h3>
      <div className="chart">
        {moduleKeys.map((key) => (
          <div className="bar-row" key={key}>
            <div className="small">{moduleStyles[key].label}</div>
            <div className="bar-track"><div className="bar-fill" style={{ width: `${(counts[key] / max) * 100}%`, background: moduleStyles[key].fill }} /></div>
            <div className="small">{counts[key]}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function App() {
  const [cases, setCases] = useState(() => safeRead(LS_CASES, []));
  const [queue, setQueue] = useState(() => safeRead(LS_QUEUE, []));
  const [selectedId, setSelectedId] = useState(() => localStorage.getItem(LS_SELECTED) || '');
  const [view, setView] = useState('inicio');
  const [tab, setTab] = useState('resumen');
  const [moduleKey, setModuleKey] = useState('visitas');
  const [search, setSearch] = useState('');
  const [online, setOnline] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [caseForm, setCaseForm] = useState({ nombre:'', rut:'', nacimiento:'', direccion:'', comuna:'', telefono:'', establecimiento:'', diagnostico:'', estado:'Activo', observaciones:'', lat:'', lng:'' });
  const [familyForm, setFamilyForm] = useState({ nombre:'', parentesco:'', edad:'', convive:'Sí', telefono:'', observaciones:'' });
  const [eventForm, setEventForm] = useState({ fecha: nowDate(), titulo:'', detalle:'', lugar:'', acompanante:'', tipoVisita:'Realizada', motivo:'', recintoInterno:'', encargadoPaciente:'', encargadoContacto:'', fechaIngreso: nowDate(), horaIngreso:'', fechaSalida: nowDate(), horaSalida:'' });
  const [editingEventId, setEditingEventId] = useState('');

  useEffect(() => { localStorage.setItem(LS_CASES, JSON.stringify(cases)); }, [cases]);
  useEffect(() => { localStorage.setItem(LS_QUEUE, JSON.stringify(queue)); }, [queue]);
  useEffect(() => { if (selectedId) localStorage.setItem(LS_SELECTED, selectedId); }, [selectedId]);

  useEffect(() => {
    async function load() {
      try {
        const usuarios = await loadFromSupabase();
        setOnline(true);
        if (usuarios.length > 0) {
          setCases(usuarios);
          if (!selectedId) setSelectedId(usuarios[0].client_id);
          setSyncMessage('Datos cargados desde Supabase.');
        }
      } catch (error) {
        setOnline(false);
        setSyncMessage('No se pudo conectar a Supabase. Se muestran datos locales si existen.');
      }
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedCase = useMemo(() => cases.find((c) => c.client_id === selectedId) || null, [cases, selectedId]);
  const filteredCases = useMemo(() => cases.filter((c) => [c.nombre, c.comuna, c.establecimiento, c.diagnostico].join(' ').toLowerCase().includes(search.toLowerCase())), [cases, search]);
  const allEvents = useMemo(() => cases.flatMap((c) => (c.eventos || []).map((e) => ({ ...e, caseName: c.nombre }))), [cases]);
  const globalCounts = useMemo(() => countsFromEvents(allEvents), [allEvents]);
  const caseCounts = useMemo(() => countsFromEvents(selectedCase?.eventos || []), [selectedCase]);
  const pendingCount = queue.filter((q) => q.status === 'pending').length;

  async function syncNow() {
    try {
      const pending = queue.filter((q) => q.status === 'pending');
      let ok = 0;
      for (const op of pending) {
        await saveRemote(op.entity, op.data);
        ok += 1;
      }
      const usuarios = await loadFromSupabase();
      if (usuarios.length > 0) setCases(usuarios);
      setQueue((prev) => prev.map((op) => op.status === 'pending' ? { ...op, status: 'synced' } : op));
      setOnline(true);
      setSyncMessage(ok > 0 ? `Sincronización completada. ${ok} cambio(s) enviados.` : 'No había cambios pendientes. Datos actualizados desde Supabase.');
    } catch (error) {
      setOnline(false);
      setSyncMessage('No se pudo sincronizar. Los cambios siguen guardados localmente.');
    }
  }

  async function saveCase() {
    if (!caseForm.nombre.trim()) return;
    const localData = { ...caseForm, client_id: uid(), familia: [], eventos: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    setCases((prev) => [localData, ...prev]);
    setSelectedId(localData.client_id);
    setShowNew(false);
    setView('usuarios');
    setCaseForm({ nombre:'', rut:'', nacimiento:'', direccion:'', comuna:'', telefono:'', establecimiento:'', diagnostico:'', estado:'Activo', observaciones:'', lat:'', lng:'' });
    try {
      const saved = await saveRemote('usuario', localData);
      const finalData = { ...localData, ...saved };
      setCases((prev) => prev.map((c) => c.client_id === localData.client_id ? { ...finalData, familia: [], eventos: [] } : c));
      setOnline(true);
      setSyncMessage('Caso guardado online en Supabase.');
    } catch {
      setQueue((prev) => enqueue(prev, 'usuario', localData));
      setOnline(false);
      setSyncMessage('Caso guardado localmente. Pendiente de sincronización.');
    }
  }

  async function updateSelectedCase(patch) {
    if (!selectedCase) return;
    const updated = { ...selectedCase, ...patch, updated_at: new Date().toISOString() };
    setCases((prev) => prev.map((c) => c.client_id === selectedCase.client_id ? updated : c));
    try {
      await saveRemote('usuario', updated);
      setOnline(true);
      setSyncMessage('Ficha actualizada online.');
    } catch {
      setQueue((prev) => enqueue(prev, 'usuario', updated));
      setOnline(false);
      setSyncMessage('Ficha guardada localmente. Pendiente de sincronización.');
    }
  }

  async function addFamily() {
    if (!selectedCase || !familyForm.nombre.trim()) return;
    const item = { ...familyForm, client_id: uid(), usuario_client_id: selectedCase.client_id, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    const updated = { ...selectedCase, familia: [...(selectedCase.familia || []), item] };
    setCases((prev) => prev.map((c) => c.client_id === selectedCase.client_id ? updated : c));
    setFamilyForm({ nombre:'', parentesco:'', edad:'', convive:'Sí', telefono:'', observaciones:'' });
    try {
      const saved = await saveRemote('familia', item);
      setCases((prev) => prev.map((c) => c.client_id === selectedCase.client_id ? { ...c, familia: (c.familia || []).map((f) => f.client_id === item.client_id ? { ...item, ...saved } : f) } : c));
      setOnline(true);
      setSyncMessage('Integrante familiar guardado online.');
    } catch {
      setQueue((prev) => enqueue(prev, 'familia', item));
      setOnline(false);
      setSyncMessage('Integrante familiar guardado localmente. Pendiente de sincronización.');
    }
  }

  function startEditEvent(ev) {
    const md = ev.metadata || {};
    setEditingEventId(ev.client_id);
    setModuleKey(ev.categoria || 'otros');
    setTab('registrar');
    setEventForm({
      fecha: ev.fecha || nowDate(),
      titulo: ev.titulo || '',
      detalle: (ev.detalle || '').replace(/ · Dupla:.*$/, '').replace(/ · Motivo:.*$/, '').replace(/ · Dependencia:.*$/, '').replace(/ · Tiempo total:.*$/, ''),
      lugar: ev.lugar || '',
      acompanante: '',
      tipoVisita: ev.detalle?.includes('Motivo:') ? 'No realizada' : 'Realizada',
      motivo: '',
      recintoInterno: md.recintoInterno || '',
      encargadoPaciente: md.encargadoPaciente || '',
      encargadoContacto: md.encargadoContacto || '',
      fechaIngreso: md.fechaIngreso || nowDate(),
      horaIngreso: md.horaIngreso || '',
      fechaSalida: md.fechaSalida || nowDate(),
      horaSalida: md.horaSalida || ''
    });
    setSyncMessage('Editando registro. Guarda cambios para actualizarlo.');
  }

  function cancelEditEvent() {
    setEditingEventId('');
    setEventForm({ fecha: nowDate(), titulo:'', detalle:'', lugar:'', acompanante:'', tipoVisita:'Realizada', motivo:'', recintoInterno:'', encargadoPaciente:'', encargadoContacto:'', fechaIngreso: nowDate(), horaIngreso:'', fechaSalida: nowDate(), horaSalida:'' });
  }



async function addEvent() {
  if (!selectedCase || !eventForm.titulo.trim()) return;
  const metadata = {};
  let detail = eventForm.detalle || '';
  if (moduleKey === 'visitas') {
    if (eventForm.acompanante) detail += `${detail ? ' · ' : ''}Dupla: ${eventForm.acompanante}`;
    if (eventForm.tipoVisita === 'No realizada' && eventForm.motivo) detail += `${detail ? ' · ' : ''}Motivo: ${eventForm.motivo}`;
  }
  if (moduleKey === 'hospitalizaciones' || moduleKey === 'urgencias') {
    metadata.recintoInterno = eventForm.recintoInterno;
    metadata.encargadoPaciente = eventForm.encargadoPaciente;
    metadata.encargadoContacto = eventForm.encargadoContacto;
    metadata.fechaIngreso = eventForm.fechaIngreso;
    metadata.horaIngreso = eventForm.horaIngreso;
    metadata.fechaSalida = eventForm.fechaSalida;
    metadata.horaSalida = eventForm.horaSalida;
    metadata.tiempoTotal = diffHuman(eventForm.fechaIngreso, eventForm.horaIngreso, eventForm.fechaSalida, eventForm.horaSalida);
    if (eventForm.recintoInterno) detail += `${detail ? ' · ' : ''}Dependencia: ${eventForm.recintoInterno}`;
    if (metadata.tiempoTotal) detail += `${detail ? ' · ' : ''}Tiempo total: ${metadata.tiempoTotal}`;
  }
  const item = {
    client_id: editingEventId || uid(), usuario_client_id: selectedCase.client_id, categoria: moduleKey, tipo: moduleStyles[moduleKey].label,
    fecha: eventForm.fecha, titulo: eventForm.titulo, detalle: detail || 'Sin detalle', lugar: eventForm.lugar, metadata,
    created_at: editingEventId ? (selectedCase.eventos.find((e) => e.client_id === editingEventId)?.created_at || new Date().toISOString()) : new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  const updatedEvents = editingEventId
    ? (selectedCase.eventos || []).map((ev) => ev.client_id === editingEventId ? item : ev)
    : [item, ...(selectedCase.eventos || [])];
  const updated = { ...selectedCase, eventos: updatedEvents };
  setCases((prev) => prev.map((c) => c.client_id === selectedCase.client_id ? updated : c));
  try {
    const current = selectedCase.eventos.find((e) => e.client_id === item.client_id);
    const saved = await saveRemote('evento', { ...item, id: current?.id });
    setCases((prev) => prev.map((c) => c.client_id === selectedCase.client_id ? { ...c, eventos: (c.eventos || []).map((e) => e.client_id === item.client_id ? { ...item, ...saved, metadata: saved.metadata_json || saved.metadata || item.metadata } : e) } : c));
    setOnline(true);
    setSyncMessage(editingEventId ? 'Registro actualizado online.' : 'Registro guardado online.');
  } catch {
    setQueue((prev) => enqueue(prev, 'evento', item));
    setOnline(false);
    setSyncMessage(editingEventId ? 'Registro actualizado localmente. Pendiente de sincronización.' : 'Registro guardado localmente. Pendiente de sincronización.');
  }
  cancelEditEvent();
}

  const caseCalendar = useMemo(() => {
    const year = new Date().getFullYear();
    const month = new Date().getMonth();
    const cells = getMonthMatrix(year, month);
    const map = {};
    (selectedCase?.eventos || []).forEach((ev) => { if (!map[ev.fecha]) map[ev.fecha] = []; map[ev.fecha].push(ev); });
    return { title: new Date(year, month, 1).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' }), cells, map };
  }, [selectedCase]);

  return (
    <div className="app">
      <div className="layout">
        <aside className="sidebar stack">
          <div className="brand"><div style={{ fontWeight: 700, fontSize: 18 }}>Seguimiento de Casos SM</div><small>Tablet + internet + sincronización</small></div>
          <button className={`nav-btn ${view === 'inicio' ? 'active' : ''}`} onClick={() => setView('inicio')}>Inicio</button>
          <button className={`nav-btn ${view === 'usuarios' ? 'active' : ''}`} onClick={() => setView('usuarios')}>Usuarios</button>
          <button className={`nav-btn ${view === 'agenda' ? 'active' : ''}`} onClick={() => setView('agenda')}>Agenda general</button>
          <button className="primary" onClick={() => setShowNew(true)}>Nuevo usuario</button>
          <div className="card stack">
            <div className="small muted">Estado</div>
            <div className="top-row"><span>{online ? 'Online' : 'Offline'}</span><span className="badge">{pendingCount} pendiente(s)</span></div>
            <button className="secondary" onClick={syncNow}>Sincronizar ahora</button>
            <div className="small muted">Supabase: {SUPABASE_URL || 'sin configurar'}</div>
          </div>
        </aside>

        <main className="main">
          <div className="panel banner">
            <div>
              <div style={{ fontWeight: 700 }}>Estado de sincronización</div>
              <div className="subtle">{syncMessage || (online ? 'Conexión detectada. Puedes sincronizar con el servidor online.' : 'Si pierdes señal, la app guarda localmente y luego puedes sincronizar.')}</div>
            </div>
            <div className="badge">{online ? 'Conectado' : 'Sin conexión'}</div>
          </div>

          {view === 'inicio' && (
            <>
              <div className="grid-3">
                <div className="card"><div className="muted">Casos activos</div><div className="kpi">{cases.filter((c) => c.estado === 'Activo').length}</div></div>
                <div className="card"><div className="muted">Acciones totales</div><div className="kpi">{allEvents.length}</div></div>
                <div className="card"><div className="muted">Pendientes de sincronizar</div><div className="kpi">{pendingCount}</div></div>
              </div>
              <div className="grid-2">
                <DashboardChart counts={globalCounts} title="Gráfico global de acciones" />
                <div className="card">
                  <h3 className="section-title">Actividad reciente</h3>
                  <div className="list">
                    {allEvents.slice(0, 8).map((ev) => (
                      <div className="event-card" key={ev.client_id} style={{ background: moduleStyles[ev.categoria]?.bg, color: moduleStyles[ev.categoria]?.text }}>
                        <div style={{ fontWeight: 700 }}>{ev.tipo}</div>
                        <div className="small">{ev.caseName} · {formatDate(ev.fecha)}</div>
                        <div className="small">{ev.titulo}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {view === 'usuarios' && (
            <div className="grid-2" style={{ gridTemplateColumns: '340px 1fr' }}>
              <div className="card stack">
                <div>
                  <h3 className="section-title">Listado de usuarios</h3>
                  <div className="subtle">Base principal de casos</div>
                </div>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre, comuna o diagnóstico" style={{ border:'1px solid var(--line)', borderRadius:14, padding:'10px 12px' }} />
                <div className="list" style={{ maxHeight: '70vh', overflow: 'auto' }}>
                  {filteredCases.map((c) => (
                    <button className={`case-btn ${selectedId === c.client_id ? 'active' : ''}`} key={c.client_id} onClick={() => setSelectedId(c.client_id)}>
                      <div style={{ fontWeight: 700 }}>{c.nombre}</div>
                      <div className="small">{c.comuna || '-'} · {c.diagnostico || '-'}</div>
                    </button>
                  ))}
                </div>
              </div>

              {selectedCase && (
                <div className="stack">
                  <div className="card stack">
                    <div className="top-row">
                      <div>
                        <h3 className="section-title" style={{ marginBottom: 4 }}>{selectedCase.nombre}</h3>
                        <div className="subtle">{selectedCase.rut || '-'} · {selectedCase.comuna || '-'}</div>
                      </div>
                      <div className="badge">{selectedCase.estado || 'Activo'}</div>
                    </div>
                    <div className="grid-4">
                      <div className="card"><div className="small muted">Teléfono</div><div>{selectedCase.telefono || '-'}</div></div>
                      <div className="card"><div className="small muted">Dirección</div><div>{selectedCase.direccion || '-'}</div></div>
                      <div className="card"><div className="small muted">Establecimiento</div><div>{selectedCase.establecimiento || '-'}</div></div>
                      <div className="card"><div className="small muted">Diagnóstico</div><div>{selectedCase.diagnostico || '-'}</div></div>
                    </div>
                    <div className="case-tabs">
                      {['resumen', 'identificacion', 'familia', 'timeline', 'registrar'].map((t) => <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>)}
                    </div>
                  </div>

                  {tab === 'resumen' && (
                    <div className="stack">
                      <div className="grid-2">
                        <DashboardChart counts={caseCounts} title="Gráfico de barras del caso" />
                        <div className="card stack">
                          <h3 className="section-title">Ubicación del caso</h3>
                          <div className="map-box stack">
                            <div className="fields">
                              <div className="field"><label>Dirección</label><input value={selectedCase.direccion || ''} onChange={(e) => updateSelectedCase({ direccion: e.target.value })} /></div>
                              <div className="field"><label>Comuna</label><input value={selectedCase.comuna || ''} onChange={(e) => updateSelectedCase({ comuna: e.target.value })} /></div>
                              <div className="field"><label>Latitud</label><input value={selectedCase.lat || ''} onChange={(e) => updateSelectedCase({ lat: e.target.value })} /></div>
                              <div className="field"><label>Longitud</label><input value={selectedCase.lng || ''} onChange={(e) => updateSelectedCase({ lng: e.target.value })} /></div>
                            </div>
                            <div className="footer-actions">
                              <a className="secondary inline" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([selectedCase.direccion, selectedCase.comuna].filter(Boolean).join(', '))}`} target="_blank" rel="noreferrer">Abrir en Google Maps</a>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="card calendar">
                        <div className="top-row"><h3 className="section-title">Calendario del caso</h3><div className="subtle" style={{ textTransform: 'capitalize' }}>{caseCalendar.title}</div></div>
                        <div className="cal-head">{['L','M','M','J','V','S','D'].map((d, i) => <div key={i} className="small muted" style={{ textAlign:'center' }}>{d}</div>)}</div>
                        <div className="cal-grid">
                          {caseCalendar.cells.map((cell, idx) => {
                            const iso = cell.date.toISOString().slice(0, 10);
                            const evs = caseCalendar.map[iso] || [];
                            const cats = [...new Set(evs.map((e) => e.categoria))];
                            const bg = cats.length === 0 ? 'white' : cats.length === 1 ? moduleStyles[cats[0]].accent : `linear-gradient(135deg, ${cats.map((c, i) => `${moduleStyles[c].accent} ${(i / cats.length) * 100}% ${((i + 1) / cats.length) * 100}%`).join(', ')})`;
                            return <div key={idx} className={`cal-day ${cell.currentMonth ? '' : 'off'}`} style={cell.currentMonth ? { background: bg } : {}}><div style={{ fontWeight:700 }}>{cell.day}</div>{evs.slice(0,2).map((e) => <div className="cal-mini" key={e.client_id}>{moduleStyles[e.categoria].label}</div>)}</div>;
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {tab === 'identificacion' && (
                    <div className="card stack">
                      <h3 className="section-title">Ficha de identificación</h3>
                      <div className="fields">
                        {[
                          ['Nombre', 'nombre'], ['RUT / ID', 'rut'], ['Fecha nacimiento', 'nacimiento'], ['Teléfono', 'telefono'],
                          ['Dirección', 'direccion'], ['Comuna', 'comuna'], ['Establecimiento', 'establecimiento'], ['Estado', 'estado'], ['Diagnóstico', 'diagnostico']
                        ].map(([label, key]) => <div className="field" key={key}><label>{label}</label><input value={selectedCase[key] || ''} onChange={(e) => updateSelectedCase({ [key]: e.target.value })} /></div>)}
                        <div className="field" style={{ gridColumn: '1 / -1' }}><label>Observaciones</label><textarea value={selectedCase.observaciones || ''} onChange={(e) => updateSelectedCase({ observaciones: e.target.value })} /></div>
                      </div>
                    </div>
                  )}

                  {tab === 'familia' && (
                    <div className="stack">
                      <div className="card stack">
                        <h3 className="section-title">Composición familiar</h3>
                        <div className="subtle">El campo Sí / No se refiere a si la persona convive actualmente con el usuario.</div>
                        <div className="list">
                          {(selectedCase.familia || []).map((f) => (
                            <div className="family-card" key={f.client_id} style={{ background: moduleStyles.familia.bg, color: moduleStyles.familia.text }}>
                              <div className="fields">
                                <div><div className="small muted">Nombre</div><div>{f.nombre || '-'}</div></div>
                                <div><div className="small muted">Parentesco</div><div>{f.parentesco || '-'}</div></div>
                                <div><div className="small muted">Edad</div><div>{f.edad || '-'}</div></div>
                                <div><div className="small muted">¿Convive con el usuario?</div><div>{f.convive || '-'}</div></div>
                                <div><div className="small muted">Teléfono</div><div>{f.telefono || '-'}</div></div>
                              </div>
                              <div style={{ marginTop: 10 }}><div className="small muted">Observaciones</div><div>{f.observaciones || '-'}</div></div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="card stack">
                        <h3 className="section-title">Agregar integrante</h3>
                        <div className="fields">
                          {['nombre','parentesco','edad','telefono'].map((k) => <div className="field" key={k}><label>{k}</label><input value={familyForm[k]} onChange={(e) => setFamilyForm({ ...familyForm, [k]: e.target.value })} /></div>)}
                          <div className="field"><label>¿Convive con el usuario?</label><select value={familyForm.convive} onChange={(e) => setFamilyForm({ ...familyForm, convive: e.target.value })}><option>Sí</option><option>No</option></select></div>
                          <div className="field" style={{ gridColumn:'1 / -1' }}><label>Observaciones</label><textarea value={familyForm.observaciones} onChange={(e) => setFamilyForm({ ...familyForm, observaciones: e.target.value })} /></div>
                        </div>
                        <div className="footer-actions"><button className="primary inline" onClick={addFamily}>Guardar integrante</button></div>
                      </div>
                    </div>
                  )}

                  {tab === 'timeline' && (
                    <div className="card stack">
                      <h3 className="section-title">Línea de tiempo del caso</h3>
                      <div className="list">
                        {(selectedCase.eventos || []).slice().sort((a,b) => b.fecha.localeCompare(a.fecha)).map((ev) => (
                          <div className="event-card" key={ev.client_id} style={{ background: moduleStyles[ev.categoria].bg, color: moduleStyles[ev.categoria].text }}>
                            <div className="top-row"><div style={{ fontWeight:700 }}>{ev.tipo}</div><div className="small">{formatDate(ev.fecha)}</div></div>
                            <div>{ev.titulo}</div>
                            <div className="small">{ev.detalle}</div>
                            {ev.lugar && <div className="small">Lugar: {ev.lugar}</div>}
                            <div className="footer-actions" style={{ marginTop: 8 }}>
                              <button className="secondary inline" onClick={() => startEditEvent(ev)}>Editar</button>
                              <button className="ghost inline" onClick={() => {
                                const updated = { ...selectedCase, eventos: (selectedCase.eventos || []).filter((item) => item.client_id !== ev.client_id) };
                                setCases((prev) => prev.map((c) => c.client_id === selectedCase.client_id ? updated : c));
                                setQueue((prev) => enqueue(prev, 'evento', { ...ev, deleted_at: new Date().toISOString() }));
                                setSyncMessage('Registro eliminado localmente.');
                              }}>Eliminar</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {tab === 'registrar' && (
                    <div className="stack">
                      <div className="card stack">
                        <h3 className="section-title">Selecciona el módulo</h3>
                        <div className="module-grid">
                          {moduleKeys.map((key) => (
                            <button key={key} className="module-btn" style={moduleKey === key ? { background:'#4338ca', color:'white', borderColor:'#4338ca' } : { background: moduleStyles[key].bg, color: moduleStyles[key].text }} onClick={() => setModuleKey(key)}>
                              {moduleStyles[key].label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="card stack">
                        <h3 className="section-title">{editingEventId ? 'Editar registro' : 'Nuevo registro'}</h3>
                        <div className="fields">
                          <div className="field"><label>Fecha</label><input type="date" value={eventForm.fecha} onChange={(e) => setEventForm({ ...eventForm, fecha: e.target.value })} /></div>
                          <div className="field"><label>Título breve</label><input value={eventForm.titulo} onChange={(e) => setEventForm({ ...eventForm, titulo: e.target.value })} /></div>
                          {(moduleKey === 'reuniones' || moduleKey === 'reuniones_ampliadas' || moduleKey === 'hospitalizaciones' || moduleKey === 'urgencias') && <div className="field"><label>{moduleKey === 'hospitalizaciones' || moduleKey === 'urgencias' ? 'Hospital / recinto' : 'Lugar de la reunión'}</label><input value={eventForm.lugar} onChange={(e) => setEventForm({ ...eventForm, lugar: e.target.value })} /></div>}
                        </div>
                        {moduleKey === 'visitas' && (
                          <div className="fields">
                            <div className="field"><label>Tipo</label><select value={eventForm.tipoVisita} onChange={(e) => setEventForm({ ...eventForm, tipoVisita: e.target.value })}><option>Realizada</option><option>No realizada</option></select></div>
                            <div className="field"><label>Acompañante (dupla)</label><input value={eventForm.acompanante} onChange={(e) => setEventForm({ ...eventForm, acompanante: e.target.value })} /></div>
                            {eventForm.tipoVisita === 'No realizada' && <div className="field" style={{ gridColumn:'1 / -1' }}><label>Motivo</label><input value={eventForm.motivo} onChange={(e) => setEventForm({ ...eventForm, motivo: e.target.value })} /></div>}
                          </div>
                        )}
                        {(moduleKey === 'hospitalizaciones' || moduleKey === 'urgencias') && (
                          <div className="stack" style={{ background:'#f8fafc', border:'1px solid var(--line)', borderRadius:18, padding:14 }}>
                            <div style={{ fontWeight:700 }}>Datos de atención</div>
                            <div className="fields">
                              <div className="field"><label>Dependencia / recinto interno</label><input value={eventForm.recintoInterno} onChange={(e) => setEventForm({ ...eventForm, recintoInterno: e.target.value })} /></div>
                              <div className="field"><label>Encargado/a de la paciente</label><input value={eventForm.encargadoPaciente} onChange={(e) => setEventForm({ ...eventForm, encargadoPaciente: e.target.value })} /></div>
                              <div className="field" style={{ gridColumn:'1 / -1' }}><label>Datos de contacto del encargado/a</label><input value={eventForm.encargadoContacto} onChange={(e) => setEventForm({ ...eventForm, encargadoContacto: e.target.value })} /></div>
                            </div>
                            <div className="fields-4">
                              <div className="field"><label>Fecha ingreso</label><input type="date" value={eventForm.fechaIngreso} onChange={(e) => setEventForm({ ...eventForm, fechaIngreso: e.target.value })} /></div>
                              <div className="field"><label>Hora ingreso</label><input type="time" value={eventForm.horaIngreso} onChange={(e) => setEventForm({ ...eventForm, horaIngreso: e.target.value })} /></div>
                              <div className="field"><label>Fecha salida</label><input type="date" value={eventForm.fechaSalida} onChange={(e) => setEventForm({ ...eventForm, fechaSalida: e.target.value })} /></div>
                              <div className="field"><label>Hora salida</label><input type="time" value={eventForm.horaSalida} onChange={(e) => setEventForm({ ...eventForm, horaSalida: e.target.value })} /></div>
                            </div>
                            <div className="small">Tiempo total calculado: <strong>{diffHuman(eventForm.fechaIngreso, eventForm.horaIngreso, eventForm.fechaSalida, eventForm.horaSalida) || 'Completa ingreso y salida para calcular'}</strong></div>
                          </div>
                        )}
                        <div className="field"><label>Detalle</label><textarea value={eventForm.detalle} onChange={(e) => setEventForm({ ...eventForm, detalle: e.target.value })} /></div>
                        <div className="footer-actions"><button className="primary inline" onClick={addEvent}>{editingEventId ? 'Guardar cambios' : 'Guardar registro'}</button>{editingEventId && <button className="secondary inline" onClick={cancelEditEvent}>Cancelar edición</button>}</div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {view === 'agenda' && (
            <div className="card stack">
              <h3 className="section-title">Agenda general</h3>
              <div className="list">
                {allEvents.slice().sort((a,b) => a.fecha.localeCompare(b.fecha)).map((ev) => (
                  <div key={ev.client_id} className="event-card" style={{ background: moduleStyles[ev.categoria].bg, color: moduleStyles[ev.categoria].text }}>
                    <div className="top-row"><div style={{ fontWeight:700 }}>{ev.caseName}</div><div className="small">{formatDate(ev.fecha)}</div></div>
                    <div>{ev.tipo} · {ev.titulo}</div>
                    <div className="small">{ev.detalle}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>

      {showNew && (
        <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,.35)', display:'grid', placeItems:'center', padding:16 }}>
          <div className="card" style={{ width:'min(900px, 100%)' }}>
            <h3 className="section-title">Crear nuevo usuario</h3>
            <div className="fields">
              {['nombre','rut','nacimiento','telefono','direccion','comuna','establecimiento','diagnostico'].map((k) => <div className="field" key={k}><label>{k}</label><input type={k==='nacimiento' ? 'date' : 'text'} value={caseForm[k]} onChange={(e) => setCaseForm({ ...caseForm, [k]: e.target.value })} /></div>)}
              <div className="field"><label>Estado</label><select value={caseForm.estado} onChange={(e) => setCaseForm({ ...caseForm, estado: e.target.value })}><option>Activo</option><option>Suspendido</option><option>Egresado</option><option>Derivado</option></select></div>
              <div className="field"><label>Latitud</label><input value={caseForm.lat} onChange={(e) => setCaseForm({ ...caseForm, lat: e.target.value })} /></div>
              <div className="field"><label>Longitud</label><input value={caseForm.lng} onChange={(e) => setCaseForm({ ...caseForm, lng: e.target.value })} /></div>
              <div className="field" style={{ gridColumn:'1 / -1' }}><label>Observaciones</label><textarea value={caseForm.observaciones} onChange={(e) => setCaseForm({ ...caseForm, observaciones: e.target.value })} /></div>
            </div>
            <div className="footer-actions"><button className="secondary inline" onClick={() => setShowNew(false)}>Cancelar</button><button className="primary inline" onClick={saveCase}>Crear usuario</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
