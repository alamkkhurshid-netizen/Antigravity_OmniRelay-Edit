import os
import requests
import json
import hashlib

def save_draft(workspace_id: str, payload_type: str, suggested_content: str, metadata: dict = None) -> str:
    """
    Saves an AI-generated draft to the OmniRelay Supabase database for human approval.
    Includes idempotency to prevent duplicate drafts on Hermes retries.
    """
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    
    if not supabase_url or not supabase_key:
        return "Error: Supabase credentials not found."

    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }

    # Idempotency: Generate a hash of the content to prevent duplicate drafts
    content_hash = hashlib.sha256(
        f"{workspace_id}:{payload_type}:{suggested_content}".encode()
    ).hexdigest()[:16]

    # Check if a draft with this hash already exists and is still pending
    check_url = (
        f"{supabase_url}/rest/v1/ai_agent_drafts"
        f"?organization_id=eq.{workspace_id}"
        f"&status=eq.pending_approval"
        f"&draft_payload->>content_hash=eq.{content_hash}"
        f"&select=id"
    )
    check_response = requests.get(check_url, headers=headers)
    if check_response.status_code == 200 and len(check_response.json()) > 0:
        existing_id = check_response.json()[0].get("id")
        return f"Duplicate draft detected. Existing draft ID: {existing_id}. Skipping insert."

    # Insert the draft
    data = {
        "organization_id": workspace_id,
        "agent_role": "titan_advisor",
        "context_source": payload_type,
        "proposed_action": "review_advice",
        "draft_payload": {
            "text": suggested_content,
            "content_hash": content_hash,
            "metadata": metadata or {}
        },
        "status": "pending_approval"
    }
    
    endpoint = f"{supabase_url}/rest/v1/ai_agent_drafts"
    response = requests.post(endpoint, headers=headers, json=data)
    
    if response.status_code in (200, 201):
        # Defensive: handle both array and object response shapes
        result = response.json()
        if isinstance(result, list) and len(result) > 0:
            draft_id = result[0].get("id")
        elif isinstance(result, dict):
            draft_id = result.get("id")
        else:
            draft_id = "unknown"
        return f"Successfully saved draft for approval. Draft ID: {draft_id}"
    else:
        return f"Failed to save draft. Status: {response.status_code}, Error: {response.text}"

# Required for Hermes Agent to register the skill
__skill_name__ = "save_draft"
__skill_description__ = "Saves generated advice or responses into the OmniRelay Action Centre for human approval. Includes idempotency to prevent duplicate drafts."
