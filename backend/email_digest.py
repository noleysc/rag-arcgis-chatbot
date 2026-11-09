"""SMTP helpers + nearby digest composition for subscription alerts."""
from __future__ import annotations

import logging
import os
import smtplib
import ssl
from email.message import EmailMessage
from typing import Any

logger = logging.getLogger(__name__)


def _smtp_settings() -> dict[str, Any]:
    host = os.getenv("SMTP_HOST", "").strip()
    user = os.getenv("SMTP_USER", "").strip()
    return {
        "host": host,
        "port": int(os.getenv("SMTP_PORT", "587")),
        "user": user,
        "password": os.getenv("SMTP_PASSWORD", "").strip(),
        "from_addr": os.getenv("SMTP_FROM", "").strip() or user,
        "use_tls": os.getenv("SMTP_USE_TLS", "true").lower() not in {"0", "false", "no"},
        "public_base": os.getenv("PUBLIC_BASE_URL", "https://tracker.esterotoday.com").rstrip("/"),
    }


def smtp_configured() -> bool:
    s = _smtp_settings()
    return bool(s["host"] and s["from_addr"])


def compose_nearby_digest(
    *,
    display_name: str,
    radius_miles: float,
    activity: list[dict[str, Any]],
    unsubscribe_token: str,
) -> tuple[str, str, str]:
    """Return (subject, text_body, html_body) for one subscriber."""
    n = len(activity)
    subject = (
        f"{n} new development update near you"
        if n == 1
        else f"{n} new development updates near you"
    )
    base = _smtp_settings()["public_base"]
    unsub = f"{base}/#/projects?tab=nearby&unsubscribe={unsubscribe_token}"

    lines = [
        f"New Village of Estero board activity within {radius_miles:g} mi of {display_name}:",
        "",
    ]
    html_items: list[str] = []
    for item in activity[:25]:
        date = item.get("date") or ""
        name = item.get("name") or "Project"
        status = item.get("status") or ""
        miles = item.get("distance_miles")
        dist = f" · {miles} mi" if miles is not None else ""
        pid = item.get("project_id") or ""
        link = f"{base}/#/projects?tab=browse&id={pid}" if pid else base
        summary = (item.get("summary") or "").strip()
        lines.append(f"- {date} · {name} ({status}){dist}")
        if summary:
            lines.append(f"  {summary[:180]}")
        lines.append(f"  {link}")
        lines.append("")
        html_items.append(
            "<li style='margin:0 0 12px'>"
            f"<strong>{_escape(name)}</strong><br/>"
            f"<span style='color:#555'>{_escape(date)} · {_escape(status)}{_escape(dist)}</span><br/>"
            f"{_escape(summary[:220])}<br/>"
            f"<a href='{_escape(link)}'>View project</a>"
            "</li>"
        )

    lines.extend(
        [
            "—",
            "Engage Estero development tracker",
            f"Unsubscribe: {unsub}",
        ]
    )
    html = (
        "<div style='font-family:system-ui,sans-serif;font-size:15px;line-height:1.45;color:#1a1a1a'>"
        f"<p>New Village of Estero board activity within <strong>{radius_miles:g} mi</strong> "
        f"of <strong>{_escape(display_name)}</strong>:</p>"
        f"<ul style='padding-left:18px'>{''.join(html_items)}</ul>"
        f"<p style='font-size:13px;color:#666'>Engage Estero · "
        f"<a href='{_escape(unsub)}'>Unsubscribe</a></p>"
        "</div>"
    )
    return subject, "\n".join(lines), html


def send_email(*, to: str, subject: str, text: str, html: str) -> None:
    s = _smtp_settings()
    if not (s["host"] and s["from_addr"]):
        raise RuntimeError("SMTP is not configured (set SMTP_HOST and SMTP_FROM).")
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = s["from_addr"]
    msg["To"] = to
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")

    if s["use_tls"]:
        context = ssl.create_default_context()
        with smtplib.SMTP(s["host"], s["port"], timeout=30) as server:
            server.ehlo()
            server.starttls(context=context)
            server.ehlo()
            if s["user"]:
                server.login(s["user"], s["password"])
            server.send_message(msg)
    else:
        with smtplib.SMTP(s["host"], s["port"], timeout=30) as server:
            if s["user"]:
                server.login(s["user"], s["password"])
            server.send_message(msg)
    logger.info("Sent digest to %s", to)


def _escape(value: str) -> str:
    return (
        (value or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )
