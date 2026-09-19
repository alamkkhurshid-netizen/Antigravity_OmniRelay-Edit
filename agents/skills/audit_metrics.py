import os
import requests
import json
from datetime import datetime, timedelta

def audit_business_metrics(workspace_id: str, days_back: int = 7) -> str:
    """
    Queries REAL OmniRelay Supabase tables to fetch actual business performance metrics
    over a given number of days. Returns structured JSON for the AI to analyze.
    """
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    
    if not supabase_url or not supabase_key:
        return "Error: Supabase credentials not found."

    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json"
    }
    
    end_date = datetime.utcnow()
    start_date = end_date - timedelta(days=days_back)
    start_iso = start_date.isoformat()

    metrics = {
        "workspace_id": workspace_id,
        "period": f"Last {days_back} days",
        "generated_at": end_date.isoformat(),
        "metrics": {}
    }

    # 1. Appointment volume and status breakdown
    try:
        r = requests.get(
            f"{supabase_url}/rest/v1/appointments?organization_id=eq.{workspace_id}&created_at=gte.{start_iso}&select=id,status",
            headers=headers
        )
        if r.status_code == 200:
            appointments = r.json()
            total = len(appointments)
            completed = sum(1 for a in appointments if a.get("status") == "completed")
            cancelled = sum(1 for a in appointments if a.get("status") == "cancelled")
            no_show = sum(1 for a in appointments if a.get("status") == "no_show")
            metrics["metrics"]["appointments"] = {
                "total_booked": total,
                "completed": completed,
                "cancelled": cancelled,
                "no_show": no_show,
                "completion_rate": f"{round(completed / total * 100, 1)}%" if total > 0 else "N/A",
                "drop_off_rate": f"{round((cancelled + no_show) / total * 100, 1)}%" if total > 0 else "N/A"
            }
        else:
            metrics["metrics"]["appointments"] = {"error": f"Query failed: {r.status_code}"}
    except Exception as e:
        metrics["metrics"]["appointments"] = {"error": str(e)}

    # 2. WhatsApp delivery performance
    try:
        r = requests.get(
            f"{supabase_url}/rest/v1/reminder_events?organization_id=eq.{workspace_id}&scheduled_for=gte.{start_iso}&select=id,status,event_type",
            headers=headers
        )
        if r.status_code == 200:
            events = r.json()
            total_msgs = len(events)
            sent = sum(1 for e in events if e.get("status") in ("sent", "delivered", "read"))
            failed = sum(1 for e in events if e.get("status") == "failed")
            read = sum(1 for e in events if e.get("status") == "read")
            metrics["metrics"]["whatsapp_delivery"] = {
                "total_messages": total_msgs,
                "delivered": sent,
                "failed": failed,
                "read": read,
                "delivery_rate": f"{round(sent / total_msgs * 100, 1)}%" if total_msgs > 0 else "N/A",
                "read_rate": f"{round(read / total_msgs * 100, 1)}%" if total_msgs > 0 else "N/A"
            }
        else:
            metrics["metrics"]["whatsapp_delivery"] = {"error": f"Query failed: {r.status_code}"}
    except Exception as e:
        metrics["metrics"]["whatsapp_delivery"] = {"error": str(e)}

    # 3. Booking concierge performance (WhatsApp bookings)
    try:
        r = requests.get(
            f"{supabase_url}/rest/v1/whatsapp_booking_requests?organization_id=eq.{workspace_id}&created_at=gte.{start_iso}&select=id,status",
            headers=headers
        )
        if r.status_code == 200:
            bookings = r.json()
            total_reqs = len(bookings)
            approved = sum(1 for b in bookings if b.get("status") == "approved")
            pending = sum(1 for b in bookings if b.get("status") == "pending_approval")
            metrics["metrics"]["booking_concierge"] = {
                "total_requests": total_reqs,
                "approved": approved,
                "pending": pending,
                "conversion_rate": f"{round(approved / total_reqs * 100, 1)}%" if total_reqs > 0 else "N/A"
            }
        else:
            metrics["metrics"]["booking_concierge"] = {"error": f"Query failed: {r.status_code}"}
    except Exception as e:
        metrics["metrics"]["booking_concierge"] = {"error": str(e)}

    # 4. AI Agent draft approval rate (self-learning signal)
    try:
        r = requests.get(
            f"{supabase_url}/rest/v1/ai_agent_drafts?organization_id=eq.{workspace_id}&created_at=gte.{start_iso}&select=id,status,human_feedback",
            headers=headers
        )
        if r.status_code == 200:
            drafts = r.json()
            total_drafts = len(drafts)
            approved_drafts = sum(1 for d in drafts if d.get("status") == "approved")
            rejected_drafts = sum(1 for d in drafts if d.get("status") == "rejected")
            metrics["metrics"]["ai_agent_performance"] = {
                "total_drafts": total_drafts,
                "approved": approved_drafts,
                "rejected": rejected_drafts,
                "approval_rate": f"{round(approved_drafts / total_drafts * 100, 1)}%" if total_drafts > 0 else "N/A",
                "recent_feedback": [d.get("human_feedback") for d in drafts if d.get("human_feedback")][:5]
            }
        else:
            metrics["metrics"]["ai_agent_performance"] = {"error": f"Query failed: {r.status_code}"}
    except Exception as e:
        metrics["metrics"]["ai_agent_performance"] = {"error": str(e)}

    # 5. Care reminder adherence
    try:
        r = requests.get(
            f"{supabase_url}/rest/v1/care_reminder_runs?organization_id=eq.{workspace_id}&scheduled_for=gte.{start_iso}&select=id,status",
            headers=headers
        )
        if r.status_code == 200:
            runs = r.json()
            total_runs = len(runs)
            completed_runs = sum(1 for run in runs if run.get("status") in ("sent", "approved", "delivered"))
            skipped_runs = sum(1 for run in runs if run.get("status") == "skipped")
            metrics["metrics"]["care_reminders"] = {
                "total_scheduled": total_runs,
                "delivered": completed_runs,
                "skipped": skipped_runs,
                "adherence_rate": f"{round(completed_runs / total_runs * 100, 1)}%" if total_runs > 0 else "N/A"
            }
        else:
            metrics["metrics"]["care_reminders"] = {"error": f"Query failed: {r.status_code}"}
    except Exception as e:
        metrics["metrics"]["care_reminders"] = {"error": str(e)}

    metrics["status"] = "success"
    return json.dumps(metrics, indent=2)

# Required for Hermes Agent to register the skill
__skill_name__ = "audit_business_metrics"
__skill_description__ = "Audits REAL business metrics (appointments, WhatsApp delivery, booking concierge, AI approval rates, care reminders) for a workspace by querying live Supabase tables."
