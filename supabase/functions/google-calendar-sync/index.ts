import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const supabase = createClient(supabaseUrl, supabaseKey);

  const clientId = Deno.env.get("GOOGLE_CLIENT_ID") || "";
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";

  try {
    const { data: jobs, error: claimError } = await supabase.rpc("claim_google_calendar_sync_jobs", { p_limit: 20 });
    if (claimError) throw claimError;
    if (!jobs || jobs.length === 0) {
      return new Response(JSON.stringify({ message: "No jobs to process" }), { headers: { "Content-Type": "application/json" } });
    }

    let processedCount = 0;
    const errors = [];

    for (const job of jobs) {
      try {
        // Fetch appointment details
        const { data: appointment, error: aptError } = await supabase
          .from("appointments")
          .select("*, location:business_locations(name), resource:booking_resources(name), service:organization_services(name)")
          .eq("id", job.appointment_id)
          .single();

        if (aptError && job.action !== 'delete') throw aptError;

        // Find the right connection (Doctor first, then Clinic)
        const { data: connections, error: connError } = await supabase
          .from("google_calendar_connections")
          .select("*")
          .eq("organization_id", job.organization_id)
          .in("resource_id", [appointment?.resource_id, "00000000-0000-0000-0000-000000000000"]);

        if (connError) throw connError;
        if (!connections || connections.length === 0) {
          throw new Error("No Google Calendar connection found for this organization/resource");
        }

        // Prefer doctor specific over clinic-wide
        let connection = connections.find(c => c.resource_id === appointment?.resource_id) || connections[0];

        // Refresh token if expired
        if (new Date(connection.expires_at).getTime() < Date.now() + 60000) {
          const params = new URLSearchParams();
          params.append('client_id', clientId);
          params.append('client_secret', clientSecret);
          params.append('refresh_token', connection.refresh_token);
          params.append('grant_type', 'refresh_token');

          const refreshRes = await fetch(GOOGLE_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params
          });

          if (!refreshRes.ok) throw new Error("Failed to refresh Google token");
          const refreshData = await refreshRes.json();
          
          connection.access_token = refreshData.access_token;
          if (refreshData.refresh_token) {
            connection.refresh_token = refreshData.refresh_token;
          }
          connection.expires_at = new Date(Date.now() + refreshData.expires_in * 1000).toISOString();

          await supabase.from("google_calendar_connections").update({
            access_token: connection.access_token,
            refresh_token: connection.refresh_token,
            expires_at: connection.expires_at,
            updated_at: new Date().toISOString()
          }).eq("id", connection.id);
        }

        const headers = {
          "Authorization": `Bearer ${connection.access_token}`,
          "Content-Type": "application/json"
        };

        if (job.action === 'insert' || (job.action === 'update' && appointment?.status !== 'cancelled')) {
          const eventPayload = {
            summary: `${appointment.service.name} with ${appointment.customer_name}`,
            description: `Ref: ${appointment.id}\nProvider: ${appointment.resource.name}\nLocation: ${appointment.location.name}\n\nNote: ${appointment.notes || 'None'}\n\nOmniRelay automated booking.`,
            start: { dateTime: appointment.starts_at },
            end: { dateTime: appointment.ends_at },
          };

          const { data: existingEvent } = await supabase.from("google_calendar_events").select("event_id").eq("appointment_id", job.appointment_id).maybeSingle();

          let url = GOOGLE_CALENDAR_URL;
          let method = existingEvent ? "PUT" : "POST";
          if (existingEvent) url += `/${existingEvent.event_id}`;

          const res = await fetch(url, { method, headers, body: JSON.stringify(eventPayload) });
          if (!res.ok) throw new Error(`Google Calendar API Error: ${await res.text()}`);

          const resData = await res.json();
          if (!existingEvent) {
            await supabase.from("google_calendar_events").insert({
              appointment_id: job.appointment_id,
              event_id: resData.id
            });
          }
        } else if (job.action === 'delete' || (job.action === 'update' && appointment?.status === 'cancelled')) {
          const { data: existingEvent } = await supabase.from("google_calendar_events").select("event_id").eq("appointment_id", job.appointment_id).maybeSingle();
          if (existingEvent) {
            const res = await fetch(`${GOOGLE_CALENDAR_URL}/${existingEvent.event_id}`, { method: "DELETE", headers });
            if (!res.ok && res.status !== 404 && res.status !== 410) throw new Error(`Google Calendar API Error: ${await res.text()}`);
            await supabase.from("google_calendar_events").delete().eq("appointment_id", job.appointment_id);
          }
        }

        await supabase.from("google_calendar_sync_queue").update({ status: 'completed', updated_at: new Date().toISOString() }).eq("id", job.id);
        processedCount++;
      } catch (err) {
        errors.push({ job_id: job.id, error: String(err) });
        await supabase.from("google_calendar_sync_queue").update({ 
          status: job.attempts >= 5 ? 'failed' : 'queued', 
          failure_reason: String(err),
          next_attempt_at: new Date(Date.now() + Math.pow(2, job.attempts) * 60000).toISOString(), // exponential backoff
          updated_at: new Date().toISOString() 
        }).eq("id", job.id);
      }
    }

    return new Response(JSON.stringify({ processedCount, errors }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
