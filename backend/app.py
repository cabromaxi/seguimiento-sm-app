from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy

BASE_DIR = Path(__file__).resolve().parent
LOCAL_DB = BASE_DIR / "data" / "seguimiento_sm.db"
LOCAL_DB.parent.mkdir(exist_ok=True)

db = SQLAlchemy()


def utc_now() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def normalize_database_url(url: str | None) -> str:
    if not url:
        return f"sqlite:///{LOCAL_DB}"
    # Some platforms still expose postgres://; SQLAlchemy expects postgresql://
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql://", 1)
    return url


class Usuario(db.Model):
    __tablename__ = "usuarios"
    id = db.Column(db.Integer, primary_key=True)
    client_id = db.Column(db.String(128), unique=True, nullable=False, index=True)
    nombre = db.Column(db.Text, nullable=False)
    rut = db.Column(db.Text)
    nacimiento = db.Column(db.Text)
    direccion = db.Column(db.Text)
    comuna = db.Column(db.Text)
    telefono = db.Column(db.Text)
    establecimiento = db.Column(db.Text)
    diagnostico = db.Column(db.Text)
    estado = db.Column(db.Text, default="Activo")
    observaciones = db.Column(db.Text)
    lat = db.Column(db.Float)
    lng = db.Column(db.Float)
    created_at = db.Column(db.Text, nullable=False)
    updated_at = db.Column(db.Text, nullable=False)
    deleted_at = db.Column(db.Text)


class Familiar(db.Model):
    __tablename__ = "familia"
    id = db.Column(db.Integer, primary_key=True)
    client_id = db.Column(db.String(128), unique=True, nullable=False, index=True)
    usuario_client_id = db.Column(db.String(128), nullable=False, index=True)
    nombre = db.Column(db.Text, nullable=False)
    parentesco = db.Column(db.Text)
    edad = db.Column(db.Text)
    convive = db.Column(db.Text)
    telefono = db.Column(db.Text)
    observaciones = db.Column(db.Text)
    created_at = db.Column(db.Text, nullable=False)
    updated_at = db.Column(db.Text, nullable=False)
    deleted_at = db.Column(db.Text)


class Evento(db.Model):
    __tablename__ = "eventos"
    id = db.Column(db.Integer, primary_key=True)
    client_id = db.Column(db.String(128), unique=True, nullable=False, index=True)
    usuario_client_id = db.Column(db.String(128), nullable=False, index=True)
    categoria = db.Column(db.Text, nullable=False)
    tipo = db.Column(db.Text)
    fecha = db.Column(db.Text, nullable=False)
    titulo = db.Column(db.Text, nullable=False)
    detalle = db.Column(db.Text)
    lugar = db.Column(db.Text)
    metadata_json = db.Column(db.Text)
    created_at = db.Column(db.Text, nullable=False)
    updated_at = db.Column(db.Text, nullable=False)
    deleted_at = db.Column(db.Text)


def parse_json(value: str | None) -> dict[str, Any]:
    if not value:
        return {}
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return {}


def user_to_dict(user: Usuario, include_children: bool = True) -> dict[str, Any]:
    data = {
        "client_id": user.client_id,
        "nombre": user.nombre,
        "rut": user.rut,
        "nacimiento": user.nacimiento,
        "direccion": user.direccion,
        "comuna": user.comuna,
        "telefono": user.telefono,
        "establecimiento": user.establecimiento,
        "diagnostico": user.diagnostico,
        "estado": user.estado or "Activo",
        "observaciones": user.observaciones,
        "lat": user.lat,
        "lng": user.lng,
        "created_at": user.created_at,
        "updated_at": user.updated_at,
        "deleted_at": user.deleted_at,
    }
    if include_children:
        familia = Familiar.query.filter_by(usuario_client_id=user.client_id, deleted_at=None).order_by(Familiar.id.asc()).all()
        eventos = Evento.query.filter_by(usuario_client_id=user.client_id, deleted_at=None).order_by(Evento.fecha.desc(), Evento.id.desc()).all()
        data["familia"] = [family_to_dict(item) for item in familia]
        data["eventos"] = [event_to_dict(item) for item in eventos]
    return data


def family_to_dict(item: Familiar) -> dict[str, Any]:
    return {
        "client_id": item.client_id,
        "usuario_client_id": item.usuario_client_id,
        "nombre": item.nombre,
        "parentesco": item.parentesco,
        "edad": item.edad,
        "convive": item.convive,
        "telefono": item.telefono,
        "observaciones": item.observaciones,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
        "deleted_at": item.deleted_at,
    }


def event_to_dict(item: Evento) -> dict[str, Any]:
    return {
        "client_id": item.client_id,
        "usuario_client_id": item.usuario_client_id,
        "categoria": item.categoria,
        "tipo": item.tipo,
        "fecha": item.fecha,
        "titulo": item.titulo,
        "detalle": item.detalle,
        "lugar": item.lugar,
        "metadata": parse_json(item.metadata_json),
        "created_at": item.created_at,
        "updated_at": item.updated_at,
        "deleted_at": item.deleted_at,
    }


def upsert_user(payload: dict[str, Any]) -> dict[str, Any]:
    client_id = payload.get("client_id")
    nombre = (payload.get("nombre") or "").strip()
    if not client_id or not nombre:
        raise ValueError("client_id y nombre son obligatorios")
    now = utc_now()
    user = Usuario.query.filter_by(client_id=client_id).first()
    if user is None:
        user = Usuario(client_id=client_id, created_at=payload.get("created_at") or now, updated_at=now)
        db.session.add(user)
    user.nombre = nombre
    user.rut = payload.get("rut")
    user.nacimiento = payload.get("nacimiento")
    user.direccion = payload.get("direccion")
    user.comuna = payload.get("comuna")
    user.telefono = payload.get("telefono")
    user.establecimiento = payload.get("establecimiento")
    user.diagnostico = payload.get("diagnostico")
    user.estado = payload.get("estado") or "Activo"
    user.observaciones = payload.get("observaciones")
    user.lat = payload.get("lat") or None
    user.lng = payload.get("lng") or None
    user.updated_at = payload.get("updated_at") or now
    user.deleted_at = payload.get("deleted_at")
    db.session.commit()
    return user_to_dict(user)


def upsert_family(payload: dict[str, Any]) -> dict[str, Any]:
    client_id = payload.get("client_id")
    usuario_client_id = payload.get("usuario_client_id")
    nombre = (payload.get("nombre") or "").strip()
    if not client_id or not usuario_client_id or not nombre:
        raise ValueError("client_id, usuario_client_id y nombre son obligatorios")
    now = utc_now()
    item = Familiar.query.filter_by(client_id=client_id).first()
    if item is None:
        item = Familiar(client_id=client_id, created_at=payload.get("created_at") or now, updated_at=now)
        db.session.add(item)
    item.usuario_client_id = usuario_client_id
    item.nombre = nombre
    item.parentesco = payload.get("parentesco")
    item.edad = payload.get("edad")
    item.convive = payload.get("convive")
    item.telefono = payload.get("telefono")
    item.observaciones = payload.get("observaciones")
    item.updated_at = payload.get("updated_at") or now
    item.deleted_at = payload.get("deleted_at")
    db.session.commit()
    return family_to_dict(item)


def upsert_event(payload: dict[str, Any]) -> dict[str, Any]:
    client_id = payload.get("client_id")
    usuario_client_id = payload.get("usuario_client_id")
    categoria = (payload.get("categoria") or "").strip()
    fecha = (payload.get("fecha") or "").strip()
    titulo = (payload.get("titulo") or "").strip()
    if not client_id or not usuario_client_id or not categoria or not fecha or not titulo:
        raise ValueError("client_id, usuario_client_id, categoria, fecha y titulo son obligatorios")
    now = utc_now()
    item = Evento.query.filter_by(client_id=client_id).first()
    if item is None:
        item = Evento(client_id=client_id, created_at=payload.get("created_at") or now, updated_at=now)
        db.session.add(item)
    item.usuario_client_id = usuario_client_id
    item.categoria = categoria
    item.tipo = payload.get("tipo") or categoria
    item.fecha = fecha
    item.titulo = titulo
    item.detalle = payload.get("detalle")
    item.lugar = payload.get("lugar")
    item.metadata_json = json.dumps(payload.get("metadata") or {}, ensure_ascii=False)
    item.updated_at = payload.get("updated_at") or now
    item.deleted_at = payload.get("deleted_at")
    db.session.commit()
    return event_to_dict(item)


def create_app() -> Flask:
    app = Flask(__name__)
    app.config["SQLALCHEMY_DATABASE_URI"] = normalize_database_url(os.getenv("DATABASE_URL"))
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    db.init_app(app)

    cors_origins = os.getenv("CORS_ORIGINS", "*")
    CORS(app, origins="*" if cors_origins == "*" else [o.strip() for o in cors_origins.split(",") if o.strip()])

    with app.app_context():
        db.create_all()

    @app.get("/")
    def root():
        return jsonify({"ok": True, "service": "Seguimiento SM API", "health": "/api/health"})

    @app.get("/api/health")
    def health():
        return jsonify({"ok": True, "timestamp": utc_now(), "database": "connected"})

    @app.get("/api/bootstrap")
    def bootstrap():
        users = Usuario.query.filter_by(deleted_at=None).order_by(Usuario.updated_at.desc(), Usuario.id.desc()).all()
        return jsonify({"usuarios": [user_to_dict(user) for user in users], "server_time": utc_now()})

    @app.post("/api/usuarios")
    def create_user():
        try:
            return jsonify(upsert_user(request.get_json(silent=True) or {})), 201
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

    @app.put("/api/usuarios/<client_id>")
    def put_user(client_id: str):
        payload = request.get_json(silent=True) or {}
        payload["client_id"] = client_id
        try:
            return jsonify(upsert_user(payload))
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

    @app.post("/api/usuarios/<usuario_client_id>/familia")
    def create_family(usuario_client_id: str):
        payload = request.get_json(silent=True) or {}
        payload["usuario_client_id"] = usuario_client_id
        try:
            return jsonify(upsert_family(payload)), 201
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

    @app.post("/api/usuarios/<usuario_client_id>/eventos")
    def create_event(usuario_client_id: str):
        payload = request.get_json(silent=True) or {}
        payload["usuario_client_id"] = usuario_client_id
        try:
            return jsonify(upsert_event(payload)), 201
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

    @app.post("/api/sync")
    def sync():
        payload = request.get_json(silent=True) or {}
        ops = payload.get("operations") or []
        results: list[dict[str, Any]] = []
        errors: list[dict[str, Any]] = []
        for op in ops:
            op_id = op.get("op_id")
            try:
                entity = op.get("entity")
                action = op.get("action")
                data = op.get("data") or {}
                if action not in {"upsert"}:
                    raise ValueError("Solo se soporta action=upsert")
                if entity == "usuario":
                    item = upsert_user(data)
                elif entity == "familia":
                    item = upsert_family(data)
                elif entity == "evento":
                    item = upsert_event(data)
                else:
                    raise ValueError(f"Entidad no soportada: {entity}")
                results.append({"op_id": op_id, "status": "synced", "entity": entity, "item": item})
            except Exception as exc:  # noqa: BLE001
                errors.append({"op_id": op_id, "status": "error", "message": str(exc)})
        return jsonify({"results": results, "errors": errors, "server_time": utc_now()})

    return app


app = create_app()


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=os.getenv("FLASK_DEBUG") == "1")
