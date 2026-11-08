export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      action_centre_assignments: {
        Row: {
          assigned_at: string
          assigned_to: string | null
          id: string
          item_kind: string
          organization_id: string
          reviewed_at: string | null
          status: string
          subject_id: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string
          assigned_to?: string | null
          id?: string
          item_kind: string
          organization_id: string
          reviewed_at?: string | null
          status?: string
          subject_id: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string
          assigned_to?: string | null
          id?: string
          item_kind?: string
          organization_id?: string
          reviewed_at?: string | null
          status?: string
          subject_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_centre_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_centre_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      action_centre_deployments: {
        Row: {
          actor_user_id: string
          automatic_count: number
          created_at: string
          deployed_count: number
          exception_count: number
          id: string
          organization_id: string
          snapshot: Json
          status: string
        }
        Insert: {
          actor_user_id: string
          automatic_count?: number
          created_at?: string
          deployed_count?: number
          exception_count?: number
          id?: string
          organization_id: string
          snapshot?: Json
          status?: string
        }
        Update: {
          actor_user_id?: string
          automatic_count?: number
          created_at?: string
          deployed_count?: number
          exception_count?: number
          id?: string
          organization_id?: string
          snapshot?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_centre_deployments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_centre_deployments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          ai: boolean
          created_at: string
          extra: Json | null
          id: string
          name: string
          organization_id: string
          picture: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          ai: boolean
          created_at?: string
          extra?: Json | null
          id?: string
          name: string
          organization_id: string
          picture?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          ai?: boolean
          created_at?: string
          extra?: Json | null
          id?: string
          name?: string
          organization_id?: string
          picture?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_channel_bindings: {
        Row: {
          agent_role: string
          created_at: string
          delivery_mode: string
          id: string
          organization_address: string
          organization_id: string
          service: string
          updated_at: string
        }
        Insert: {
          agent_role?: string
          created_at?: string
          delivery_mode?: string
          id?: string
          organization_address: string
          organization_id: string
          service?: string
          updated_at?: string
        }
        Update: {
          agent_role?: string
          created_at?: string
          delivery_mode?: string
          id?: string
          organization_address?: string
          organization_id?: string
          service?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_channel_bindings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_channel_bindings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_conversation_state: {
        Row: {
          agent_role: string
          conversation_id: string
          last_inbound_message_id: string | null
          last_prompt: string | null
          opted_out_at: string | null
          organization_id: string
          stage: string
          updated_at: string
        }
        Insert: {
          agent_role: string
          conversation_id: string
          last_inbound_message_id?: string | null
          last_prompt?: string | null
          opted_out_at?: string | null
          organization_id: string
          stage?: string
          updated_at?: string
        }
        Update: {
          agent_role?: string
          conversation_id?: string
          last_inbound_message_id?: string | null
          last_prompt?: string | null
          opted_out_at?: string | null
          organization_id?: string
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_conversation_state_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_conversation_state_last_inbound_message_id_fkey"
            columns: ["last_inbound_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_conversation_state_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_conversation_state_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_dispatches: {
        Row: {
          binding_id: string
          classification: string
          conversation_id: string
          created_at: string
          failure_reason: string | null
          id: string
          message_id: string
          model_status: string | null
          organization_id: string
          processed_at: string | null
          response_message_id: string | null
          shadow_response_text: string | null
          source_document_ids: string[]
          status: string
          updated_at: string
        }
        Insert: {
          binding_id: string
          classification?: string
          conversation_id: string
          created_at?: string
          failure_reason?: string | null
          id?: string
          message_id: string
          model_status?: string | null
          organization_id: string
          processed_at?: string | null
          response_message_id?: string | null
          shadow_response_text?: string | null
          source_document_ids?: string[]
          status?: string
          updated_at?: string
        }
        Update: {
          binding_id?: string
          classification?: string
          conversation_id?: string
          created_at?: string
          failure_reason?: string | null
          id?: string
          message_id?: string
          model_status?: string | null
          organization_id?: string
          processed_at?: string | null
          response_message_id?: string | null
          shadow_response_text?: string | null
          source_document_ids?: string[]
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_dispatches_binding_id_fkey"
            columns: ["binding_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_channel_bindings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_dispatches_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_dispatches_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: true
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_dispatches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_dispatches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_dispatches_response_message_id_fkey"
            columns: ["response_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_profiles: {
        Row: {
          channels: string[]
          created_at: string
          handoff_message: string
          id: string
          instructions: string
          name: string
          organization_id: string
          role: string
          status: string
          updated_at: string
        }
        Insert: {
          channels?: string[]
          created_at?: string
          handoff_message?: string
          id?: string
          instructions?: string
          name: string
          organization_id: string
          role?: string
          status?: string
          updated_at?: string
        }
        Update: {
          channels?: string[]
          created_at?: string
          handoff_message?: string
          id?: string
          instructions?: string
          name?: string
          organization_id?: string
          role?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_governance_queue: {
        Row: {
          affected_files: Json
          created_at: string
          diagnosis: string
          id: string
          proposed_patch: string
          reviewed_at: string | null
          reviewed_by: string | null
          risk_level: Database["public"]["Enums"]["ai_risk_level"]
          source_error: Json
          status: Database["public"]["Enums"]["ai_patch_status"]
          updated_at: string
        }
        Insert: {
          affected_files: Json
          created_at?: string
          diagnosis: string
          id?: string
          proposed_patch: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_level?: Database["public"]["Enums"]["ai_risk_level"]
          source_error: Json
          status?: Database["public"]["Enums"]["ai_patch_status"]
          updated_at?: string
        }
        Update: {
          affected_files?: Json
          created_at?: string
          diagnosis?: string
          id?: string
          proposed_patch?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_level?: Database["public"]["Enums"]["ai_risk_level"]
          source_error?: Json
          status?: Database["public"]["Enums"]["ai_patch_status"]
          updated_at?: string
        }
        Relationships: []
      }
      api_keys: {
        Row: {
          created_at: string
          id: string
          key_hash: string
          name: string
          organization_id: string
          role: Database["public"]["Enums"]["role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          key_hash: string
          name: string
          organization_id: string
          role?: Database["public"]["Enums"]["role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          key_hash?: string
          name?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      app_notifications: {
        Row: {
          body: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          escalation_level: number
          href: string | null
          id: string
          notification_type: string
          organization_id: string
          priority: string
          read_at: string | null
          recipient_user_id: string
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          escalation_level?: number
          href?: string | null
          id?: string
          notification_type: string
          organization_id: string
          priority?: string
          read_at?: string | null
          recipient_user_id: string
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          escalation_level?: number
          href?: string | null
          id?: string
          notification_type?: string
          organization_id?: string
          priority?: string
          read_at?: string | null
          recipient_user_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_events: {
        Row: {
          actor_id: string | null
          actor_type: string
          appointment_id: string
          created_at: string
          details: Json
          event_type: string
          id: string
          organization_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_type: string
          appointment_id: string
          created_at?: string
          details?: Json
          event_type: string
          id?: string
          organization_id: string
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          appointment_id?: string
          created_at?: string
          details?: Json
          event_type?: string
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_events_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_events_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "voice_appointments_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_queue_entries: {
        Row: {
          appointment_id: string
          created_at: string
          created_by: string
          id: string
          location_id: string
          organization_id: string
          queue_date: string
          queue_status: string
          resource_id: string
          token_number: number
          updated_at: string
        }
        Insert: {
          appointment_id: string
          created_at?: string
          created_by?: string
          id?: string
          location_id: string
          organization_id: string
          queue_date: string
          queue_status?: string
          resource_id: string
          token_number: number
          updated_at?: string
        }
        Update: {
          appointment_id?: string
          created_at?: string
          created_by?: string
          id?: string
          location_id?: string
          organization_id?: string
          queue_date?: string
          queue_status?: string
          resource_id?: string
          token_number?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_queue_entries_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: true
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_queue_entries_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: true
            referencedRelation: "voice_appointments_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_queue_entries_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "business_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_queue_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_queue_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_queue_entries_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "booking_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_waitlist: {
        Row: {
          booking_request_id: string | null
          created_at: string
          id: string
          location_id: string | null
          offer_expires_at: string | null
          organization_id: string
          patient_id: string | null
          patient_name: string
          patient_phone: string
          preferred_date: string | null
          preferred_starts_at: string | null
          priority: number
          resource_id: string | null
          service_id: string
          status: string
          updated_at: string
        }
        Insert: {
          booking_request_id?: string | null
          created_at?: string
          id?: string
          location_id?: string | null
          offer_expires_at?: string | null
          organization_id: string
          patient_id?: string | null
          patient_name: string
          patient_phone: string
          preferred_date?: string | null
          preferred_starts_at?: string | null
          priority?: number
          resource_id?: string | null
          service_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          booking_request_id?: string | null
          created_at?: string
          id?: string
          location_id?: string | null
          offer_expires_at?: string | null
          organization_id?: string
          patient_id?: string | null
          patient_name?: string
          patient_phone?: string
          preferred_date?: string | null
          preferred_starts_at?: string | null
          priority?: number
          resource_id?: string | null
          service_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_waitlist_booking_request_id_fkey"
            columns: ["booking_request_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_booking_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_waitlist_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "business_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_waitlist_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_waitlist_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_waitlist_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_waitlist_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "booking_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_waitlist_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "organization_services"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          booking_consent_evidence_id: string | null
          booking_contact_name: string | null
          booking_contact_phone: string | null
          booking_phone_verification_id: string | null
          booking_phone_verified_at: string | null
          care_communications_consent: boolean
          created_at: string
          created_by: string | null
          customer_email: string | null
          customer_name: string
          customer_phone: string | null
          ends_at: string
          follow_up_at: string | null
          follow_up_note: string | null
          health_concern: string | null
          hold_expires_at: string | null
          id: string
          location_id: string
          marketing_consent: boolean
          metadata: Json | null
          notes: string | null
          organization_id: string
          patient_age: number | null
          patient_date_of_birth: string | null
          patient_id: string | null
          patient_locality: string | null
          patient_pincode: string | null
          patient_relationship: string
          patient_summary: string | null
          payment_status: string
          resource_id: string
          service_id: string
          source: string
          starts_at: string
          status: string
          updated_at: string
        }
        Insert: {
          booking_consent_evidence_id?: string | null
          booking_contact_name?: string | null
          booking_contact_phone?: string | null
          booking_phone_verification_id?: string | null
          booking_phone_verified_at?: string | null
          care_communications_consent?: boolean
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_name: string
          customer_phone?: string | null
          ends_at: string
          follow_up_at?: string | null
          follow_up_note?: string | null
          health_concern?: string | null
          hold_expires_at?: string | null
          id?: string
          location_id: string
          marketing_consent?: boolean
          metadata?: Json | null
          notes?: string | null
          organization_id: string
          patient_age?: number | null
          patient_date_of_birth?: string | null
          patient_id?: string | null
          patient_locality?: string | null
          patient_pincode?: string | null
          patient_relationship?: string
          patient_summary?: string | null
          payment_status?: string
          resource_id: string
          service_id: string
          source?: string
          starts_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          booking_consent_evidence_id?: string | null
          booking_contact_name?: string | null
          booking_contact_phone?: string | null
          booking_phone_verification_id?: string | null
          booking_phone_verified_at?: string | null
          care_communications_consent?: boolean
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string | null
          ends_at?: string
          follow_up_at?: string | null
          follow_up_note?: string | null
          health_concern?: string | null
          hold_expires_at?: string | null
          id?: string
          location_id?: string
          marketing_consent?: boolean
          metadata?: Json | null
          notes?: string | null
          organization_id?: string
          patient_age?: number | null
          patient_date_of_birth?: string | null
          patient_id?: string | null
          patient_locality?: string | null
          patient_pincode?: string | null
          patient_relationship?: string
          patient_summary?: string | null
          payment_status?: string
          resource_id?: string
          service_id?: string
          source?: string
          starts_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_booking_consent_evidence_id_fkey"
            columns: ["booking_consent_evidence_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_booking_consent_evidence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "business_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "booking_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "organization_services"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          id: string
          organization_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          organization_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          organization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_recovery_events: {
        Row: {
          action: string
          actor_user_id: string
          created_at: string
          id: string
          job_id: string
          job_kind: string
          organization_id: string
          previous_status: string
          reason: string
        }
        Insert: {
          action: string
          actor_user_id: string
          created_at?: string
          id?: string
          job_id: string
          job_kind: string
          organization_id: string
          previous_status: string
          reason: string
        }
        Update: {
          action?: string
          actor_user_id?: string
          created_at?: string
          id?: string
          job_id?: string
          job_kind?: string
          organization_id?: string
          previous_status?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_recovery_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_recovery_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_rollout_reviews: {
        Row: {
          actor_user_id: string
          created_at: string
          decision: string
          evidence_window_started_at: string
          failure_count: number
          id: string
          observation_count: number
          organization_id: string
          workflow_id: string
        }
        Insert: {
          actor_user_id: string
          created_at?: string
          decision: string
          evidence_window_started_at: string
          failure_count: number
          id?: string
          observation_count: number
          organization_id: string
          workflow_id: string
        }
        Update: {
          actor_user_id?: string
          created_at?: string
          decision?: string
          evidence_window_started_at?: string
          failure_count?: number
          id?: string
          observation_count?: number
          organization_id?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_rollout_reviews_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_rollout_reviews_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_rollout_reviews_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "automation_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_runs: {
        Row: {
          attempt_count: number
          completed_at: string | null
          created_at: string
          delivery_status: string | null
          failure_code: string | null
          failure_summary: string | null
          id: string
          idempotency_key: string
          max_attempts: number
          next_attempt_at: string | null
          observed_message_id: string | null
          organization_id: string
          provider_execution_id: string | null
          safe_context: Json
          source_id: string | null
          source_type: string | null
          started_at: string | null
          status: string
          trigger_key: string
          updated_at: string
          workflow_id: string
        }
        Insert: {
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          delivery_status?: string | null
          failure_code?: string | null
          failure_summary?: string | null
          id?: string
          idempotency_key: string
          max_attempts?: number
          next_attempt_at?: string | null
          observed_message_id?: string | null
          organization_id: string
          provider_execution_id?: string | null
          safe_context?: Json
          source_id?: string | null
          source_type?: string | null
          started_at?: string | null
          status?: string
          trigger_key: string
          updated_at?: string
          workflow_id: string
        }
        Update: {
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          delivery_status?: string | null
          failure_code?: string | null
          failure_summary?: string | null
          id?: string
          idempotency_key?: string
          max_attempts?: number
          next_attempt_at?: string | null
          observed_message_id?: string | null
          organization_id?: string
          provider_execution_id?: string | null
          safe_context?: Json
          source_id?: string | null
          source_type?: string | null
          started_at?: string | null
          status?: string
          trigger_key?: string
          updated_at?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_runs_observed_message_id_fkey"
            columns: ["observed_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "automation_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_workflows: {
        Row: {
          configuration: Json
          created_at: string
          created_by: string | null
          execution_provider: string
          external_workflow_id: string | null
          id: string
          last_failure_at: string | null
          last_run_at: string | null
          last_success_at: string | null
          max_attempts: number
          name: string
          organization_id: string
          status: string
          timeout_seconds: number
          trigger_key: string
          updated_at: string
        }
        Insert: {
          configuration?: Json
          created_at?: string
          created_by?: string | null
          execution_provider?: string
          external_workflow_id?: string | null
          id?: string
          last_failure_at?: string | null
          last_run_at?: string | null
          last_success_at?: string | null
          max_attempts?: number
          name: string
          organization_id: string
          status?: string
          timeout_seconds?: number
          trigger_key: string
          updated_at?: string
        }
        Update: {
          configuration?: Json
          created_at?: string
          created_by?: string | null
          execution_provider?: string
          external_workflow_id?: string | null
          id?: string
          last_failure_at?: string | null
          last_run_at?: string | null
          last_success_at?: string | null
          max_attempts?: number
          name?: string
          organization_id?: string
          status?: string
          timeout_seconds?: number
          trigger_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_workflows_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_workflows_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_rules: {
        Row: {
          active: boolean
          created_at: string
          effective_from: string | null
          effective_to: string | null
          end_time: string
          id: string
          location_id: string | null
          organization_id: string
          resource_id: string
          slot_interval_minutes: number
          start_time: string
          updated_at: string
          weekday: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          effective_from?: string | null
          effective_to?: string | null
          end_time: string
          id?: string
          location_id?: string | null
          organization_id: string
          resource_id: string
          slot_interval_minutes?: number
          start_time: string
          updated_at?: string
          weekday: number
        }
        Update: {
          active?: boolean
          created_at?: string
          effective_from?: string | null
          effective_to?: string | null
          end_time?: string
          id?: string
          location_id?: string | null
          organization_id?: string
          resource_id?: string
          slot_interval_minutes?: number
          start_time?: string
          updated_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "availability_rules_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "business_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_rules_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "booking_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_notice_events: {
        Row: {
          channel: string
          created_at: string
          id: string
          metadata: Json
          notice_type: string
          organization_id: string
          recipient: string | null
          scheduled_for: string
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          channel?: string
          created_at?: string
          id?: string
          metadata?: Json
          notice_type: string
          organization_id: string
          recipient?: string | null
          scheduled_for: string
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          metadata?: Json
          notice_type?: string
          organization_id?: string
          recipient?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_notice_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_notice_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_webhook_events: {
        Row: {
          event_type: string
          failure_reason: string | null
          id: string
          payload_digest: string
          processed_at: string | null
          provider: string
          provider_event_id: string
          provider_order_id: string | null
          provider_payment_id: string | null
          received_at: string
          status: string
        }
        Insert: {
          event_type: string
          failure_reason?: string | null
          id?: string
          payload_digest: string
          processed_at?: string | null
          provider?: string
          provider_event_id: string
          provider_order_id?: string | null
          provider_payment_id?: string | null
          received_at?: string
          status?: string
        }
        Update: {
          event_type?: string
          failure_reason?: string | null
          id?: string
          payload_digest?: string
          processed_at?: string | null
          provider?: string
          provider_event_id?: string
          provider_order_id?: string | null
          provider_payment_id?: string | null
          received_at?: string
          status?: string
        }
        Relationships: []
      }
      booking_pages: {
        Row: {
          accent_color: string
          active: boolean
          created_at: string
          description: string | null
          headline: string
          organization_id: string
          slug: string
          updated_at: string
        }
        Insert: {
          accent_color?: string
          active?: boolean
          created_at?: string
          description?: string | null
          headline?: string
          organization_id: string
          slug: string
          updated_at?: string
        }
        Update: {
          accent_color?: string
          active?: boolean
          created_at?: string
          description?: string | null
          headline?: string
          organization_id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_pages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_pages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_payments: {
        Row: {
          amount_paise: number
          appointment_id: string
          created_at: string
          currency: string
          expires_at: string
          failure_code: string | null
          failure_message: string | null
          id: string
          metadata: Json
          organization_id: string
          paid_at: string | null
          payment_mode: string
          provider: string
          provider_order_id: string | null
          provider_payment_id: string | null
          provider_signature: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_paise: number
          appointment_id: string
          created_at?: string
          currency?: string
          expires_at: string
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          metadata?: Json
          organization_id: string
          paid_at?: string | null
          payment_mode: string
          provider?: string
          provider_order_id?: string | null
          provider_payment_id?: string | null
          provider_signature?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount_paise?: number
          appointment_id?: string
          created_at?: string
          currency?: string
          expires_at?: string
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          metadata?: Json
          organization_id?: string
          paid_at?: string | null
          payment_mode?: string
          provider?: string
          provider_order_id?: string | null
          provider_payment_id?: string | null
          provider_signature?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_payments_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: true
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_payments_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: true
            referencedRelation: "voice_appointments_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_resources: {
        Row: {
          active: boolean
          created_at: string
          id: string
          location_id: string | null
          name: string
          organization_id: string
          resource_type: string
          timezone: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          location_id?: string | null
          name: string
          organization_id: string
          resource_type?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          location_id?: string | null
          name?: string
          organization_id?: string
          resource_type?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_resources_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "business_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_resources_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_resources_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      business_locations: {
        Row: {
          active: boolean
          address: Json
          created_at: string
          created_by: string
          google_maps_url: string | null
          id: string
          location_type: string
          name: string
          organization_id: string
          phone: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: Json
          created_at?: string
          created_by?: string
          google_maps_url?: string | null
          id?: string
          location_type?: string
          name: string
          organization_id: string
          phone?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: Json
          created_at?: string
          created_by?: string
          google_maps_url?: string | null
          id?: string
          location_type?: string
          name?: string
          organization_id?: string
          phone?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_locations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_locations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_events: {
        Row: {
          actor_user_id: string | null
          campaign_id: string
          created_at: string
          event_type: string
          id: string
          organization_id: string
          payload: Json
          recipient_id: string | null
        }
        Insert: {
          actor_user_id?: string | null
          campaign_id: string
          created_at?: string
          event_type: string
          id?: string
          organization_id: string
          payload?: Json
          recipient_id?: string | null
        }
        Update: {
          actor_user_id?: string | null
          campaign_id?: string
          created_at?: string
          event_type?: string
          id?: string
          organization_id?: string
          payload?: Json
          recipient_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_events_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "campaign_recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_recipients: {
        Row: {
          campaign_id: string
          consent_basis: string
          created_at: string
          delivered_at: string | null
          failure_reason: string | null
          id: string
          message_id: string | null
          organization_id: string
          patient_id: string
          provider_message_id: string | null
          read_at: string | null
          recipient_address: string
          scheduled_for: string | null
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          campaign_id: string
          consent_basis: string
          created_at?: string
          delivered_at?: string | null
          failure_reason?: string | null
          id?: string
          message_id?: string | null
          organization_id: string
          patient_id: string
          provider_message_id?: string | null
          read_at?: string | null
          recipient_address: string
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          consent_basis?: string
          created_at?: string
          delivered_at?: string | null
          failure_reason?: string | null
          id?: string
          message_id?: string | null
          organization_id?: string
          patient_id?: string
          provider_message_id?: string | null
          read_at?: string | null
          recipient_address?: string
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          audience_filter: Json
          campaign_type: string
          channel: string
          created_at: string
          created_by: string
          delivered_count: number
          eligible_count: number
          failed_count: number
          frequency_cap_hours: number
          id: string
          message_note: string | null
          name: string
          organization_id: string
          read_count: number
          scheduled_for: string | null
          sent_count: number
          skipped_count: number
          status: string
          template_id: string
          timezone: string
          total_count: number
          updated_at: string
        }
        Insert: {
          audience_filter?: Json
          campaign_type: string
          channel?: string
          created_at?: string
          created_by: string
          delivered_count?: number
          eligible_count?: number
          failed_count?: number
          frequency_cap_hours?: number
          id?: string
          message_note?: string | null
          name: string
          organization_id: string
          read_count?: number
          scheduled_for?: string | null
          sent_count?: number
          skipped_count?: number
          status?: string
          template_id: string
          timezone?: string
          total_count?: number
          updated_at?: string
        }
        Update: {
          audience_filter?: Json
          campaign_type?: string
          channel?: string
          created_at?: string
          created_by?: string
          delivered_count?: number
          eligible_count?: number
          failed_count?: number
          frequency_cap_hours?: number
          id?: string
          message_note?: string | null
          name?: string
          organization_id?: string
          read_count?: number
          scheduled_for?: string | null
          sent_count?: number
          skipped_count?: number
          status?: string
          template_id?: string
          timezone?: string
          total_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "channel_message_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      capi_event_logs: {
        Row: {
          api_response: Json | null
          created_at: string | null
          event_id: string
          event_name: string
          id: string
          organization_id: string
          payload: Json
          status: string
        }
        Insert: {
          api_response?: Json | null
          created_at?: string | null
          event_id: string
          event_name: string
          id?: string
          organization_id: string
          payload: Json
          status: string
        }
        Update: {
          api_response?: Json | null
          created_at?: string | null
          event_id?: string
          event_name?: string
          id?: string
          organization_id?: string
          payload?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "capi_event_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capi_event_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      care_reminder_runs: {
        Row: {
          acknowledged_at: string | null
          acknowledgement: string | null
          approved_at: string | null
          approved_by: string | null
          attempt_count: number
          channel: string
          created_at: string
          delivered_at: string | null
          failure_reason: string | null
          id: string
          last_attempt_at: string | null
          max_attempts: number
          next_attempt_at: string | null
          organization_id: string
          patient_id: string
          provider_message_id: string | null
          provider_response: Json
          read_at: string | null
          reminder_id: string
          response_kind: string | null
          response_message_id: string | null
          response_received_at: string | null
          response_text: string | null
          scheduled_for: string
          sent_at: string | null
          snoozed_until: string | null
          status: string
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledgement?: string | null
          approved_at?: string | null
          approved_by?: string | null
          attempt_count?: number
          channel: string
          created_at?: string
          delivered_at?: string | null
          failure_reason?: string | null
          id?: string
          last_attempt_at?: string | null
          max_attempts?: number
          next_attempt_at?: string | null
          organization_id: string
          patient_id: string
          provider_message_id?: string | null
          provider_response?: Json
          read_at?: string | null
          reminder_id: string
          response_kind?: string | null
          response_message_id?: string | null
          response_received_at?: string | null
          response_text?: string | null
          scheduled_for: string
          sent_at?: string | null
          snoozed_until?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledgement?: string | null
          approved_at?: string | null
          approved_by?: string | null
          attempt_count?: number
          channel?: string
          created_at?: string
          delivered_at?: string | null
          failure_reason?: string | null
          id?: string
          last_attempt_at?: string | null
          max_attempts?: number
          next_attempt_at?: string | null
          organization_id?: string
          patient_id?: string
          provider_message_id?: string | null
          provider_response?: Json
          read_at?: string | null
          reminder_id?: string
          response_kind?: string | null
          response_message_id?: string | null
          response_received_at?: string | null
          response_text?: string | null
          scheduled_for?: string
          sent_at?: string | null
          snoozed_until?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_reminder_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_reminder_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_reminder_runs_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_reminder_runs_reminder_id_fkey"
            columns: ["reminder_id"]
            isOneToOne: false
            referencedRelation: "care_reminders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_reminder_runs_response_message_id_fkey"
            columns: ["response_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      care_reminders: {
        Row: {
          approval_mode: string
          care_plan_id: string | null
          channel: string
          consent_snapshot: boolean
          created_at: string
          created_by: string
          encounter_id: string | null
          ends_on: string | null
          id: string
          instructions: string | null
          last_run_at: string | null
          next_run_at: string
          organization_id: string
          patient_id: string
          prescription_id: string | null
          prescription_item_id: string | null
          reminder_type: string
          schedule_kind: string
          scheduled_for: string | null
          starts_on: string | null
          status: string
          time_of_day: string | null
          timezone: string
          title: string
          updated_at: string
        }
        Insert: {
          approval_mode?: string
          care_plan_id?: string | null
          channel?: string
          consent_snapshot?: boolean
          created_at?: string
          created_by: string
          encounter_id?: string | null
          ends_on?: string | null
          id?: string
          instructions?: string | null
          last_run_at?: string | null
          next_run_at: string
          organization_id: string
          patient_id: string
          prescription_id?: string | null
          prescription_item_id?: string | null
          reminder_type: string
          schedule_kind: string
          scheduled_for?: string | null
          starts_on?: string | null
          status?: string
          time_of_day?: string | null
          timezone?: string
          title: string
          updated_at?: string
        }
        Update: {
          approval_mode?: string
          care_plan_id?: string | null
          channel?: string
          consent_snapshot?: boolean
          created_at?: string
          created_by?: string
          encounter_id?: string | null
          ends_on?: string | null
          id?: string
          instructions?: string | null
          last_run_at?: string | null
          next_run_at?: string
          organization_id?: string
          patient_id?: string
          prescription_id?: string | null
          prescription_item_id?: string | null
          reminder_type?: string
          schedule_kind?: string
          scheduled_for?: string | null
          starts_on?: string | null
          status?: string
          time_of_day?: string | null
          timezone?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "care_reminders_care_plan_id_fkey"
            columns: ["care_plan_id"]
            isOneToOne: false
            referencedRelation: "patient_care_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_reminders_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "patient_encounters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_reminders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_reminders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_reminders_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_reminders_prescription_id_fkey"
            columns: ["prescription_id"]
            isOneToOne: false
            referencedRelation: "prescriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_reminders_prescription_item_id_fkey"
            columns: ["prescription_item_id"]
            isOneToOne: false
            referencedRelation: "prescription_items"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_connections: {
        Row: {
          capabilities: Json
          channel: string
          created_at: string
          display_address: string | null
          display_name: string | null
          external_account_id: string | null
          external_phone_number_id: string | null
          id: string
          last_error: string | null
          last_verified_at: string | null
          organization_id: string
          provider: string
          status: string
          updated_at: string
        }
        Insert: {
          capabilities?: Json
          channel: string
          created_at?: string
          display_address?: string | null
          display_name?: string | null
          external_account_id?: string | null
          external_phone_number_id?: string | null
          id?: string
          last_error?: string | null
          last_verified_at?: string | null
          organization_id: string
          provider: string
          status?: string
          updated_at?: string
        }
        Update: {
          capabilities?: Json
          channel?: string
          created_at?: string
          display_address?: string | null
          display_name?: string | null
          external_account_id?: string | null
          external_phone_number_id?: string | null
          id?: string
          last_error?: string | null
          last_verified_at?: string | null
          organization_id?: string
          provider?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_message_templates: {
        Row: {
          channel: string
          created_at: string
          event_type: string
          id: string
          language_code: string
          organization_id: string
          provider_template_name: string
          status: string
          updated_at: string
          variable_map: Json
        }
        Insert: {
          channel?: string
          created_at?: string
          event_type: string
          id?: string
          language_code?: string
          organization_id: string
          provider_template_name: string
          status?: string
          updated_at?: string
          variable_map?: Json
        }
        Update: {
          channel?: string
          created_at?: string
          event_type?: string
          id?: string
          language_code?: string
          organization_id?: string
          provider_template_name?: string
          status?: string
          updated_at?: string
          variable_map?: Json
        }
        Relationships: [
          {
            foreignKeyName: "channel_message_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_message_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_departments: {
        Row: {
          active: boolean
          code: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          organization_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          organization_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_departments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_departments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_pilot_controls: {
        Row: {
          health_note: string | null
          health_status: string
          organization_id: string
          pilot_owner_name: string
          planned_start_date: string | null
          reviewed_at: string
          rollback_owner_name: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          health_note?: string | null
          health_status?: string
          organization_id: string
          pilot_owner_name: string
          planned_start_date?: string | null
          reviewed_at?: string
          rollback_owner_name: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          health_note?: string | null
          health_status?: string
          organization_id?: string
          pilot_owner_name?: string
          planned_start_date?: string | null
          reviewed_at?: string
          rollback_owner_name?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_pilot_controls_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_pilot_controls_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_opt_outs: {
        Row: {
          address: string
          channel: string
          id: string
          opted_out_at: string
          organization_id: string
          patient_id: string | null
          reason: string | null
          recorded_by: string | null
          scope: string
          source: string
        }
        Insert: {
          address: string
          channel?: string
          id?: string
          opted_out_at?: string
          organization_id: string
          patient_id?: string | null
          reason?: string | null
          recorded_by?: string | null
          scope?: string
          source?: string
        }
        Update: {
          address?: string
          channel?: string
          id?: string
          opted_out_at?: string
          organization_id?: string
          patient_id?: string | null
          reason?: string | null
          recorded_by?: string | null
          scope?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_opt_outs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_opt_outs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_opt_outs_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          created_at: string
          extra: Json | null
          id: string
          name: string | null
          organization_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          extra?: Json | null
          id?: string
          name?: string | null
          organization_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          extra?: Json | null
          id?: string
          name?: string | null
          organization_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts_addresses: {
        Row: {
          address: string
          contact_id: string | null
          created_at: string
          extra: Json | null
          organization_id: string
          service: Database["public"]["Enums"]["service"]
          status: string
          updated_at: string
        }
        Insert: {
          address: string
          contact_id?: string | null
          created_at?: string
          extra?: Json | null
          organization_id: string
          service: Database["public"]["Enums"]["service"]
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string
          contact_id?: string | null
          created_at?: string
          extra?: Json | null
          organization_id?: string
          service?: Database["public"]["Enums"]["service"]
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_addresses_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_addresses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_addresses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          ai_paused: boolean
          assigned_agent_id: string | null
          contact_address: string | null
          created_at: string
          extra: Json | null
          group_address: string | null
          id: string
          name: string | null
          organization_address: string
          organization_id: string
          paused_at: string | null
          service: Database["public"]["Enums"]["service"]
          status: string
          updated_at: string
        }
        Insert: {
          ai_paused?: boolean
          assigned_agent_id?: string | null
          contact_address?: string | null
          created_at?: string
          extra?: Json | null
          group_address?: string | null
          id?: string
          name?: string | null
          organization_address: string
          organization_id: string
          paused_at?: string | null
          service: Database["public"]["Enums"]["service"]
          status?: string
          updated_at?: string
        }
        Update: {
          ai_paused?: boolean
          assigned_agent_id?: string | null
          contact_address?: string | null
          created_at?: string
          extra?: Json | null
          group_address?: string | null
          id?: string
          name?: string | null
          organization_address?: string
          organization_id?: string
          paused_at?: string | null
          service?: Database["public"]["Enums"]["service"]
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_assigned_agent_id_fkey"
            columns: ["assigned_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_contact_address_fkey"
            columns: ["organization_id", "service", "contact_address"]
            isOneToOne: false
            referencedRelation: "contacts_addresses"
            referencedColumns: ["organization_id", "service", "address"]
          },
          {
            foreignKeyName: "conversations_organization_address_fkey"
            columns: ["organization_id", "organization_address"]
            isOneToOne: false
            referencedRelation: "organizations_addresses"
            referencedColumns: ["organization_id", "address"]
          },
          {
            foreignKeyName: "conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      device_push_deliveries: {
        Row: {
          attempts: number
          claimed_at: string | null
          created_at: string
          delivered_at: string | null
          failure_reason: string | null
          id: string
          max_attempts: number
          next_attempt_at: string
          notification_id: string
          organization_id: string
          provider_response: Json | null
          status: string
          subscription_id: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          claimed_at?: string | null
          created_at?: string
          delivered_at?: string | null
          failure_reason?: string | null
          id?: string
          max_attempts?: number
          next_attempt_at?: string
          notification_id: string
          organization_id: string
          provider_response?: Json | null
          status?: string
          subscription_id: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          claimed_at?: string | null
          created_at?: string
          delivered_at?: string | null
          failure_reason?: string | null
          id?: string
          max_attempts?: number
          next_attempt_at?: string
          notification_id?: string
          organization_id?: string
          provider_response?: Json | null
          status?: string
          subscription_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_push_deliveries_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "app_notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_push_deliveries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_push_deliveries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_push_deliveries_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "device_push_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      device_push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string
          endpoint: string
          id: string
          organization_id: string
          p256dh_key: string
          revoked_at: string | null
          status: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth_key: string
          created_at?: string
          endpoint: string
          id?: string
          organization_id: string
          p256dh_key: string
          revoked_at?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth_key?: string
          created_at?: string
          endpoint?: string
          id?: string
          organization_id?: string
          p256dh_key?: string
          revoked_at?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_push_subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_push_subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_import_jobs: {
        Row: {
          created_at: string
          created_by: string
          id: string
          imported_count: number
          organization_id: string
          payload_hash: string
          row_count: number
          source_format: string
          status: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          imported_count?: number
          organization_id: string
          payload_hash: string
          row_count: number
          source_format: string
          status: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          imported_count?: number
          organization_id?: string
          payload_hash?: string
          row_count?: number
          source_format?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_import_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_import_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_queue_consent_events: {
        Row: {
          action: string
          channel: string
          id: string
          notice_text: string
          notice_version: string
          organization_id: string
          phone_identity: string | null
          recorded_at: string
          recorded_by: string
          resource_id: string
        }
        Insert: {
          action: string
          channel: string
          id?: string
          notice_text: string
          notice_version: string
          organization_id: string
          phone_identity?: string | null
          recorded_at?: string
          recorded_by: string
          resource_id: string
        }
        Update: {
          action?: string
          channel?: string
          id?: string
          notice_text?: string
          notice_version?: string
          organization_id?: string
          phone_identity?: string | null
          recorded_at?: string
          recorded_by?: string
          resource_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_queue_consent_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_queue_consent_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_queue_consent_events_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "booking_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_queue_dispatches: {
        Row: {
          attempts: number
          availability_rule_id: string
          booking_count: number
          created_at: string
          delivered_at: string | null
          failure_reason: string | null
          id: string
          max_attempts: number
          message_id: string | null
          next_attempt_at: string | null
          organization_id: string
          provider_message_id: string | null
          provider_response: Json
          read_at: string | null
          recipient_phone: string
          resource_id: string
          scheduled_for: string
          sent_at: string | null
          shift_date: string
          shift_starts_at: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          availability_rule_id: string
          booking_count?: number
          created_at?: string
          delivered_at?: string | null
          failure_reason?: string | null
          id?: string
          max_attempts?: number
          message_id?: string | null
          next_attempt_at?: string | null
          organization_id: string
          provider_message_id?: string | null
          provider_response?: Json
          read_at?: string | null
          recipient_phone: string
          resource_id: string
          scheduled_for: string
          sent_at?: string | null
          shift_date: string
          shift_starts_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          availability_rule_id?: string
          booking_count?: number
          created_at?: string
          delivered_at?: string | null
          failure_reason?: string | null
          id?: string
          max_attempts?: number
          message_id?: string | null
          next_attempt_at?: string | null
          organization_id?: string
          provider_message_id?: string | null
          provider_response?: Json
          read_at?: string | null
          recipient_phone?: string
          resource_id?: string
          scheduled_for?: string
          sent_at?: string | null
          shift_date?: string
          shift_starts_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_queue_dispatches_availability_rule_id_fkey"
            columns: ["availability_rule_id"]
            isOneToOne: false
            referencedRelation: "availability_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_queue_dispatches_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_queue_dispatches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_queue_dispatches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_queue_dispatches_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "booking_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      document_chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          document_id: string
          embedding: string | null
          id: string
          metadata: Json | null
          organization_id: string
        }
        Insert: {
          chunk_index: number
          content: string
          created_at?: string
          document_id: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
          organization_id: string
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          document_id?: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "tenant_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_chunks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_chunks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      durable_api_rate_limits: {
        Row: {
          created_at: string
          hits: number
          key: string
          window_expires_at: string
        }
        Insert: {
          created_at?: string
          hits?: number
          key: string
          window_expires_at: string
        }
        Update: {
          created_at?: string
          hits?: number
          key?: string
          window_expires_at?: string
        }
        Relationships: []
      }
      entitlements: {
        Row: {
          cancel_at_period_end: boolean
          channels: Json
          conversations_quota: number
          created_at: string
          current_period_end: string | null
          features: Json
          grace_ends_at: string | null
          id: string
          mautic_enabled: boolean
          max_seats: number
          max_workspaces: number
          organization_id: string
          plan_id: string
          status: string
          trial_ends_at: string | null
          trial_started_at: string | null
          updated_at: string
          white_label: boolean
        }
        Insert: {
          cancel_at_period_end?: boolean
          channels?: Json
          conversations_quota?: number
          created_at?: string
          current_period_end?: string | null
          features?: Json
          grace_ends_at?: string | null
          id?: string
          mautic_enabled?: boolean
          max_seats?: number
          max_workspaces?: number
          organization_id: string
          plan_id?: string
          status?: string
          trial_ends_at?: string | null
          trial_started_at?: string | null
          updated_at?: string
          white_label?: boolean
        }
        Update: {
          cancel_at_period_end?: boolean
          channels?: Json
          conversations_quota?: number
          created_at?: string
          current_period_end?: string | null
          features?: Json
          grace_ends_at?: string | null
          id?: string
          mautic_enabled?: boolean
          max_seats?: number
          max_workspaces?: number
          organization_id?: string
          plan_id?: string
          status?: string
          trial_ends_at?: string | null
          trial_started_at?: string | null
          updated_at?: string
          white_label?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "entitlements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entitlements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      eval_runs: {
        Row: {
          created_at: string
          eval_status: string
          id: string
          matched_chunk_id: string | null
          organization_id: string
          query_text: string
          similarity_score: number
        }
        Insert: {
          created_at?: string
          eval_status: string
          id?: string
          matched_chunk_id?: string | null
          organization_id: string
          query_text: string
          similarity_score: number
        }
        Update: {
          created_at?: string
          eval_status?: string
          id?: string
          matched_chunk_id?: string | null
          organization_id?: string
          query_text?: string
          similarity_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "eval_runs_matched_chunk_id_fkey"
            columns: ["matched_chunk_id"]
            isOneToOne: false
            referencedRelation: "knowledge_chunks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eval_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eval_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_bases: {
        Row: {
          category: string
          created_at: string
          id: string
          name: string
          organization_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          name: string
          organization_id: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_bases_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_bases_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_chunks: {
        Row: {
          content: string
          created_at: string
          document_id: string
          embedding: string | null
          id: string
          organization_id: string
          source_updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string
          document_id: string
          embedding?: string | null
          id?: string
          organization_id: string
          source_updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          document_id?: string
          embedding?: string | null
          id?: string
          organization_id?: string
          source_updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_chunks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_chunks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_documents: {
        Row: {
          created_at: string
          error_message: string | null
          file_type: string
          filename: string
          id: string
          knowledge_base_id: string
          organization_id: string
          status: string
          storage_path: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          file_type: string
          filename: string
          id?: string
          knowledge_base_id: string
          organization_id: string
          status?: string
          storage_path: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          file_type?: string
          filename?: string
          id?: string
          knowledge_base_id?: string
          organization_id?: string
          status?: string
          storage_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_documents_knowledge_base_id_fkey"
            columns: ["knowledge_base_id"]
            isOneToOne: false
            referencedRelation: "knowledge_bases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      logs: {
        Row: {
          category: string
          created_at: string
          id: string
          level: Database["public"]["Enums"]["log_level"]
          message: string
          metadata: Json | null
          organization_address: string | null
          organization_id: string
          service: Database["public"]["Enums"]["service"] | null
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          level: Database["public"]["Enums"]["log_level"]
          message: string
          metadata?: Json | null
          organization_address?: string | null
          organization_id: string
          service?: Database["public"]["Enums"]["service"] | null
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          level?: Database["public"]["Enums"]["log_level"]
          message?: string
          metadata?: Json | null
          organization_address?: string | null
          organization_id?: string
          service?: Database["public"]["Enums"]["service"] | null
        }
        Relationships: [
          {
            foreignKeyName: "logs_organization_address_fkey"
            columns: ["organization_id", "organization_address"]
            isOneToOne: false
            referencedRelation: "organizations_addresses"
            referencedColumns: ["organization_id", "address"]
          },
          {
            foreignKeyName: "logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      medicine_catalog_entries: {
        Row: {
          created_at: string
          display_name: string
          dose_form_identifier: string | null
          dose_form_name: string | null
          entry_type: string
          generic_identifier: string | null
          generic_name: string | null
          id: number
          product_identifier: string | null
          product_name: string | null
          quality_flags: string[]
          release_id: string
          route_identifiers: string[]
          route_names: string[]
          search_text: string
          source_identifier: string
          status: string
          supplier_identifier: string | null
          supplier_name: string | null
        }
        Insert: {
          created_at?: string
          display_name: string
          dose_form_identifier?: string | null
          dose_form_name?: string | null
          entry_type: string
          generic_identifier?: string | null
          generic_name?: string | null
          id?: never
          product_identifier?: string | null
          product_name?: string | null
          quality_flags?: string[]
          release_id: string
          route_identifiers?: string[]
          route_names?: string[]
          search_text: string
          source_identifier: string
          status?: string
          supplier_identifier?: string | null
          supplier_name?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string
          dose_form_identifier?: string | null
          dose_form_name?: string | null
          entry_type?: string
          generic_identifier?: string | null
          generic_name?: string | null
          id?: never
          product_identifier?: string | null
          product_name?: string | null
          quality_flags?: string[]
          release_id?: string
          route_identifiers?: string[]
          route_names?: string[]
          search_text?: string
          source_identifier?: string
          status?: string
          supplier_identifier?: string | null
          supplier_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "medicine_catalog_entries_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "medicine_catalog_releases"
            referencedColumns: ["id"]
          },
        ]
      }
      medicine_catalog_releases: {
        Row: {
          activated_at: string | null
          created_at: string
          edition: string
          id: string
          licence_name: string
          licence_url: string
          metadata: Json
          package_sha256: string
          release_date: string
          row_counts: Json
          source_name: string
          status: string
        }
        Insert: {
          activated_at?: string | null
          created_at?: string
          edition: string
          id?: string
          licence_name: string
          licence_url: string
          metadata?: Json
          package_sha256: string
          release_date: string
          row_counts?: Json
          source_name: string
          status?: string
        }
        Update: {
          activated_at?: string | null
          created_at?: string
          edition?: string
          id?: string
          licence_name?: string
          licence_url?: string
          metadata?: Json
          package_sha256?: string
          release_date?: string
          row_counts?: Json
          source_name?: string
          status?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          agent_id: string | null
          contact_address: string | null
          content: Json
          conversation_id: string
          created_at: string
          direction: Database["public"]["Enums"]["direction"]
          external_id: string | null
          group_address: string | null
          id: string
          organization_address: string
          organization_id: string
          service: Database["public"]["Enums"]["service"]
          status: Json
          thread_id: string | null
          timestamp: string
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          contact_address?: string | null
          content: Json
          conversation_id: string
          created_at?: string
          direction: Database["public"]["Enums"]["direction"]
          external_id?: string | null
          group_address?: string | null
          id?: string
          organization_address: string
          organization_id: string
          service: Database["public"]["Enums"]["service"]
          status?: Json
          thread_id?: string | null
          timestamp?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          contact_address?: string | null
          content?: Json
          conversation_id?: string
          created_at?: string
          direction?: Database["public"]["Enums"]["direction"]
          external_id?: string | null
          group_address?: string | null
          id?: string
          organization_address?: string
          organization_id?: string
          service?: Database["public"]["Enums"]["service"]
          status?: Json
          thread_id?: string | null
          timestamp?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_capi_config: {
        Row: {
          access_token: string
          created_at: string | null
          id: string
          is_active: boolean | null
          organization_id: string
          pixel_id: string
          test_event_code: string | null
          updated_at: string | null
        }
        Insert: {
          access_token: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          organization_id: string
          pixel_id: string
          test_event_code?: string | null
          updated_at?: string | null
        }
        Update: {
          access_token?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          organization_id?: string
          pixel_id?: string
          test_event_code?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_capi_config_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_capi_config_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      n8n_instances: {
        Row: {
          created_at: string
          id: string
          instance_url: string
          organization_id: string
          status: string
          webhook_slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          instance_url: string
          organization_id: string
          status?: string
          webhook_slug: string
        }
        Update: {
          created_at?: string
          id?: string
          instance_url?: string
          organization_id?: string
          status?: string
          webhook_slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "n8n_instances_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "n8n_instances_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      n8n_template_registry: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          name: string
          template_id: string
          workflow_json: Json
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          template_id: string
          workflow_json: Json
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          template_id?: string
          workflow_json?: Json
        }
        Relationships: []
      }
      oauth_nonces: {
        Row: {
          consumed_at: string | null
          created_at: string
          expires_at: string
          nonce: string
          organization_id: string
          provider: string
          resource_id: string | null
          user_id: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          nonce: string
          organization_id: string
          provider?: string
          resource_id?: string | null
          user_id: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          nonce?: string
          organization_id?: string
          provider?: string
          resource_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      onboarding_profiles: {
        Row: {
          business_category: string
          business_name: string
          clinic_mode: string
          created_at: string
          custom_brochure_storage_path: string | null
          custom_brochure_url: string | null
          description: string | null
          email: string | null
          id: string
          organization_id: string
          primary_phone: string | null
          services_offered: Json
          timezone: string
          updated_at: string
          website: string | null
          working_hours: Json
        }
        Insert: {
          business_category: string
          business_name: string
          clinic_mode?: string
          created_at?: string
          custom_brochure_storage_path?: string | null
          custom_brochure_url?: string | null
          description?: string | null
          email?: string | null
          id?: string
          organization_id: string
          primary_phone?: string | null
          services_offered?: Json
          timezone?: string
          updated_at?: string
          website?: string | null
          working_hours?: Json
        }
        Update: {
          business_category?: string
          business_name?: string
          clinic_mode?: string
          created_at?: string
          custom_brochure_storage_path?: string | null
          custom_brochure_url?: string | null
          description?: string | null
          email?: string | null
          id?: string
          organization_id?: string
          primary_phone?: string | null
          services_offered?: Json
          timezone?: string
          updated_at?: string
          website?: string | null
          working_hours?: Json
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_tokens: {
        Row: {
          callback_url: string | null
          created_at: string
          expires_at: string
          id: string
          name: string
          organization_id: string
          service: Database["public"]["Enums"]["service"]
          status: string
          used_at: string | null
          verify_token: string | null
        }
        Insert: {
          callback_url?: string | null
          created_at?: string
          expires_at: string
          id?: string
          name: string
          organization_id: string
          service: Database["public"]["Enums"]["service"]
          status?: string
          used_at?: string | null
          verify_token?: string | null
        }
        Update: {
          callback_url?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          name?: string
          organization_id?: string
          service?: Database["public"]["Enums"]["service"]
          status?: string
          used_at?: string | null
          verify_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_tokens_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_tokens_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_billing_settings: {
        Row: {
          activated_at: string | null
          activated_by: string | null
          charging_enabled: boolean
          creative_billing_enabled: boolean
          critical_threshold_paise: number
          mode: string
          organization_id: string
          rate_activation_enabled: boolean
          send_blocking_enabled: boolean
          updated_at: string
          wallet_topups_enabled: boolean
          warning_threshold_paise: number
        }
        Insert: {
          activated_at?: string | null
          activated_by?: string | null
          charging_enabled?: boolean
          creative_billing_enabled?: boolean
          critical_threshold_paise?: number
          mode?: string
          organization_id: string
          rate_activation_enabled?: boolean
          send_blocking_enabled?: boolean
          updated_at?: string
          wallet_topups_enabled?: boolean
          warning_threshold_paise?: number
        }
        Update: {
          activated_at?: string | null
          activated_by?: string | null
          charging_enabled?: boolean
          creative_billing_enabled?: boolean
          critical_threshold_paise?: number
          mode?: string
          organization_id?: string
          rate_activation_enabled?: boolean
          send_blocking_enabled?: boolean
          updated_at?: string
          wallet_topups_enabled?: boolean
          warning_threshold_paise?: number
        }
        Relationships: [
          {
            foreignKeyName: "operational_billing_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_billing_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_creative_reservations: {
        Row: {
          amount_paise: number
          created_at: string
          creative_kind: string
          id: string
          metadata: Json
          organization_id: string
          reference_id: string | null
          status: string
        }
        Insert: {
          amount_paise: number
          created_at?: string
          creative_kind: string
          id?: string
          metadata?: Json
          organization_id: string
          reference_id?: string | null
          status?: string
        }
        Update: {
          amount_paise?: number
          created_at?: string
          creative_kind?: string
          id?: string
          metadata?: Json
          organization_id?: string
          reference_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_creative_reservations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_creative_reservations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          error_code: string
          event_source: string
          id: string
          metadata: Json
          organization_id: string | null
          request_id: string
          resolved_at: string | null
          safe_message: string
          severity: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          error_code: string
          event_source: string
          id?: string
          metadata?: Json
          organization_id?: string | null
          request_id?: string
          resolved_at?: string | null
          safe_message: string
          severity?: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          error_code?: string
          event_source?: string
          id?: string
          metadata?: Json
          organization_id?: string | null
          request_id?: string
          resolved_at?: string | null
          safe_message?: string
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_rate_card_audit: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          metadata: Json
          organization_id: string
          rate_card_id: string | null
          source_url: string
          source_version: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          organization_id: string
          rate_card_id?: string | null
          source_url: string
          source_version: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          organization_id?: string
          rate_card_id?: string | null
          source_url?: string
          source_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_rate_card_audit_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_rate_card_audit_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_rate_card_audit_rate_card_id_fkey"
            columns: ["rate_card_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_rate_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_reconciliation_runs: {
        Row: {
          created_at: string
          id: string
          ledger_total_paise: number | null
          meta_bill_paise: number | null
          organization_id: string
          period_end: string
          period_start: string
          razorpay_settlement_paise: number | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          variance_paise: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          ledger_total_paise?: number | null
          meta_bill_paise?: number | null
          organization_id: string
          period_end: string
          period_start: string
          razorpay_settlement_paise?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          variance_paise?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          ledger_total_paise?: number | null
          meta_bill_paise?: number | null
          organization_id?: string
          period_end?: string
          period_start?: string
          razorpay_settlement_paise?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          variance_paise?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "operational_reconciliation_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_reconciliation_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_statements: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          period_end: string
          period_start: string
          status: string
          usage_total_paise: number
          wallet_movement_paise: number
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          period_end: string
          period_start: string
          status?: string
          usage_total_paise?: number
          wallet_movement_paise?: number
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          period_end?: string
          period_start?: string
          status?: string
          usage_total_paise?: number
          wallet_movement_paise?: number
        }
        Relationships: [
          {
            foreignKeyName: "operational_statements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_statements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_topup_intents: {
        Row: {
          amount_paise: number
          created_at: string
          id: string
          metadata: Json
          organization_id: string
          provider: string
          provider_reference: string | null
          status: string
        }
        Insert: {
          amount_paise: number
          created_at?: string
          id?: string
          metadata?: Json
          organization_id: string
          provider?: string
          provider_reference?: string | null
          status?: string
        }
        Update: {
          amount_paise?: number
          created_at?: string
          id?: string
          metadata?: Json
          organization_id?: string
          provider?: string
          provider_reference?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_topup_intents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_topup_intents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_usage_events: {
        Row: {
          base_cost_paise: number
          channel: string
          charged_total_paise: number
          delivery_status: string
          estimated_total_paise: number
          id: string
          message_category: string
          metadata: Json
          occurred_at: string
          organization_id: string
          platform_fee_paise: number
          provider_message_id: string | null
          rate_card_id: string | null
          source_id: string
          source_type: string
          updated_at: string
        }
        Insert: {
          base_cost_paise?: number
          channel?: string
          charged_total_paise?: number
          delivery_status?: string
          estimated_total_paise?: number
          id?: string
          message_category: string
          metadata?: Json
          occurred_at?: string
          organization_id: string
          platform_fee_paise?: number
          provider_message_id?: string | null
          rate_card_id?: string | null
          source_id: string
          source_type: string
          updated_at?: string
        }
        Update: {
          base_cost_paise?: number
          channel?: string
          charged_total_paise?: number
          delivery_status?: string
          estimated_total_paise?: number
          id?: string
          message_category?: string
          metadata?: Json
          occurred_at?: string
          organization_id?: string
          platform_fee_paise?: number
          provider_message_id?: string | null
          rate_card_id?: string | null
          source_id?: string
          source_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_usage_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_usage_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_usage_events_rate_card_id_fkey"
            columns: ["rate_card_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_rate_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_wallet_ledger: {
        Row: {
          amount_paise: number
          balance_after_paise: number
          created_at: string
          description: string
          entry_type: string
          id: string
          metadata: Json
          organization_id: string
          reference_id: string
          reference_type: string
        }
        Insert: {
          amount_paise: number
          balance_after_paise: number
          created_at?: string
          description: string
          entry_type: string
          id?: string
          metadata?: Json
          organization_id: string
          reference_id: string
          reference_type: string
        }
        Update: {
          amount_paise?: number
          balance_after_paise?: number
          created_at?: string
          description?: string
          entry_type?: string
          id?: string
          metadata?: Json
          organization_id?: string
          reference_id?: string
          reference_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_wallet_ledger_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_wallet_ledger_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_wallets: {
        Row: {
          balance_paise: number
          organization_id: string
          reserved_paise: number
          updated_at: string
        }
        Insert: {
          balance_paise?: number
          organization_id: string
          reserved_paise?: number
          updated_at?: string
        }
        Update: {
          balance_paise?: number
          organization_id?: string
          reserved_paise?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_wallets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_wallets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_communication_controls: {
        Row: {
          booking_confirmation_enabled: boolean
          emergency_notices_enabled: boolean
          follow_up_enabled: boolean
          marketing_campaigns_enabled: boolean
          medication_reminder_enabled: boolean
          organization_id: string
          reminder_24h_enabled: boolean
          reminder_2h_enabled: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          booking_confirmation_enabled?: boolean
          emergency_notices_enabled?: boolean
          follow_up_enabled?: boolean
          marketing_campaigns_enabled?: boolean
          medication_reminder_enabled?: boolean
          organization_id: string
          reminder_24h_enabled?: boolean
          reminder_2h_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          booking_confirmation_enabled?: boolean
          emergency_notices_enabled?: boolean
          follow_up_enabled?: boolean
          marketing_campaigns_enabled?: boolean
          medication_reminder_enabled?: boolean
          organization_id?: string
          reminder_24h_enabled?: boolean
          reminder_2h_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_communication_controls_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_communication_controls_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_services: {
        Row: {
          active: boolean
          booking_enabled: boolean
          buffer_minutes: number
          created_at: string
          currency: string
          description: string | null
          duration_minutes: number
          id: string
          name: string
          organization_id: string
          price_paise: number | null
          service_type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          booking_enabled?: boolean
          buffer_minutes?: number
          created_at?: string
          currency?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          name: string
          organization_id: string
          price_paise?: number | null
          service_type: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          booking_enabled?: boolean
          buffer_minutes?: number
          created_at?: string
          currency?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          name?: string
          organization_id?: string
          price_paise?: number | null
          service_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_services_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_services_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          extra: Json | null
          id: string
          name: string
          premium_admin_agent_active: boolean
          premium_cto_agent_active: boolean
          premium_growth_agent_active: boolean
          premium_support_agent_active: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          extra?: Json | null
          id?: string
          name: string
          premium_admin_agent_active?: boolean
          premium_cto_agent_active?: boolean
          premium_growth_agent_active?: boolean
          premium_support_agent_active?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          extra?: Json | null
          id?: string
          name?: string
          premium_admin_agent_active?: boolean
          premium_cto_agent_active?: boolean
          premium_growth_agent_active?: boolean
          premium_support_agent_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      organizations_addresses: {
        Row: {
          address: string
          created_at: string
          extra: Json | null
          organization_id: string
          service: Database["public"]["Enums"]["service"]
          status: string
          updated_at: string
        }
        Insert: {
          address: string
          created_at?: string
          extra?: Json | null
          organization_id: string
          service: Database["public"]["Enums"]["service"]
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string
          created_at?: string
          extra?: Json | null
          organization_id?: string
          service?: Database["public"]["Enums"]["service"]
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_addresses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizations_addresses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_care_plans: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string
          encounter_id: string | null
          goal: string | null
          id: string
          instructions: string | null
          next_review_at: string | null
          organization_id: string
          patient_id: string
          plan_type: string
          starts_on: string
          status: string
          target_date: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by: string
          encounter_id?: string | null
          goal?: string | null
          id?: string
          instructions?: string | null
          next_review_at?: string | null
          organization_id: string
          patient_id: string
          plan_type?: string
          starts_on?: string
          status?: string
          target_date?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string
          encounter_id?: string | null
          goal?: string | null
          id?: string
          instructions?: string | null
          next_review_at?: string | null
          organization_id?: string
          patient_id?: string
          plan_type?: string
          starts_on?: string
          status?: string
          target_date?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_care_plans_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "patient_encounters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_care_plans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_care_plans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_care_plans_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_care_tasks: {
        Row: {
          appointment_id: string | null
          assigned_to: string | null
          care_plan_id: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string
          details: string | null
          due_at: string | null
          encounter_id: string | null
          id: string
          organization_id: string
          patient_id: string
          priority: string
          status: string
          task_type: string
          title: string
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          assigned_to?: string | null
          care_plan_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by: string
          details?: string | null
          due_at?: string | null
          encounter_id?: string | null
          id?: string
          organization_id: string
          patient_id: string
          priority?: string
          status?: string
          task_type?: string
          title: string
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          assigned_to?: string | null
          care_plan_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string
          details?: string | null
          due_at?: string | null
          encounter_id?: string | null
          id?: string
          organization_id?: string
          patient_id?: string
          priority?: string
          status?: string
          task_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_care_tasks_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_care_tasks_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "voice_appointments_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_care_tasks_care_plan_id_fkey"
            columns: ["care_plan_id"]
            isOneToOne: false
            referencedRelation: "patient_care_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_care_tasks_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "patient_encounters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_care_tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_care_tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_care_tasks_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_consent_events: {
        Row: {
          captured_at: string
          captured_by: string | null
          consent_type: string
          id: string
          metadata: Json
          new_status: boolean
          note: string | null
          organization_id: string
          patient_id: string
          previous_status: boolean | null
          source: string
        }
        Insert: {
          captured_at?: string
          captured_by?: string | null
          consent_type: string
          id?: string
          metadata?: Json
          new_status: boolean
          note?: string | null
          organization_id: string
          patient_id: string
          previous_status?: boolean | null
          source?: string
        }
        Update: {
          captured_at?: string
          captured_by?: string | null
          consent_type?: string
          id?: string
          metadata?: Json
          new_status?: boolean
          note?: string | null
          organization_id?: string
          patient_id?: string
          previous_status?: boolean | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_consent_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_consent_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_consent_events_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_data_request_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event_type: string
          from_status: string | null
          id: string
          organization_id: string
          request_id: string
          safe_summary: string
          to_status: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          from_status?: string | null
          id?: string
          organization_id: string
          request_id: string
          safe_summary: string
          to_status: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          from_status?: string | null
          id?: string
          organization_id?: string
          request_id?: string
          safe_summary?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_data_request_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_data_request_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_data_request_events_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "patient_data_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_data_requests: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          decision_summary: string | null
          id: string
          identity_method: string
          identity_verified_at: string
          organization_id: string
          patient_id: string
          reference: string
          request_summary: string
          request_type: string
          retention_reason: string | null
          retention_review: string
          source_channel: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          decision_summary?: string | null
          id?: string
          identity_method: string
          identity_verified_at: string
          organization_id: string
          patient_id: string
          reference?: string
          request_summary: string
          request_type: string
          retention_reason?: string | null
          retention_review?: string
          source_channel: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          decision_summary?: string | null
          id?: string
          identity_method?: string
          identity_verified_at?: string
          organization_id?: string
          patient_id?: string
          reference?: string
          request_summary?: string
          request_type?: string
          retention_reason?: string | null
          retention_review?: string
          source_channel?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_data_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_data_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_data_requests_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_documents: {
        Row: {
          appointment_id: string | null
          created_at: string
          document_type: string
          encounter_id: string | null
          file_size_bytes: number
          id: string
          mime_type: string
          organization_id: string
          patient_id: string
          storage_bucket: string
          storage_path: string
          title: string
          uploaded_by: string
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string
          document_type?: string
          encounter_id?: string | null
          file_size_bytes: number
          id?: string
          mime_type: string
          organization_id: string
          patient_id: string
          storage_bucket?: string
          storage_path: string
          title: string
          uploaded_by: string
        }
        Update: {
          appointment_id?: string | null
          created_at?: string
          document_type?: string
          encounter_id?: string | null
          file_size_bytes?: number
          id?: string
          mime_type?: string
          organization_id?: string
          patient_id?: string
          storage_bucket?: string
          storage_path?: string
          title?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_documents_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_documents_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "voice_appointments_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_documents_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "patient_encounters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_documents_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_encounters: {
        Row: {
          appointment_id: string | null
          clinical_note: string
          created_at: string
          created_by: string
          diagnosis: string | null
          encounter_type: string
          follow_up_at: string | null
          follow_up_status: string
          id: string
          occurred_at: string
          organization_id: string
          patient_id: string
          treatment_plan: string | null
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          clinical_note: string
          created_at?: string
          created_by: string
          diagnosis?: string | null
          encounter_type?: string
          follow_up_at?: string | null
          follow_up_status?: string
          id?: string
          occurred_at?: string
          organization_id: string
          patient_id: string
          treatment_plan?: string | null
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          clinical_note?: string
          created_at?: string
          created_by?: string
          diagnosis?: string | null
          encounter_type?: string
          follow_up_at?: string | null
          follow_up_status?: string
          id?: string
          occurred_at?: string
          organization_id?: string
          patient_id?: string
          treatment_plan?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_encounters_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_encounters_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "voice_appointments_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_encounters_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_encounters_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_encounters_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_guardian_links: {
        Row: {
          created_at: string
          guardian_name: string
          guardian_phone: string
          id: string
          normalized_phone: string | null
          organization_id: string
          patient_id: string
          relationship: string
          updated_at: string
          verification_status: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          guardian_name: string
          guardian_phone: string
          id?: string
          normalized_phone?: string | null
          organization_id: string
          patient_id: string
          relationship: string
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          guardian_name?: string
          guardian_phone?: string
          id?: string
          normalized_phone?: string | null
          organization_id?: string
          patient_id?: string
          relationship?: string
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_guardian_links_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_guardian_links_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_guardian_links_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_identity_verification_events: {
        Row: {
          conversation_id: string
          id: string
          identity_hash: string
          identity_last4: string
          identity_type: string
          metadata: Json
          organization_id: string
          patient_id: string | null
          session_id: string | null
          source_message_id: string
          verification_method: string
          verified_at: string
        }
        Insert: {
          conversation_id: string
          id?: string
          identity_hash: string
          identity_last4: string
          identity_type: string
          metadata?: Json
          organization_id: string
          patient_id?: string | null
          session_id?: string | null
          source_message_id: string
          verification_method: string
          verified_at?: string
        }
        Update: {
          conversation_id?: string
          id?: string
          identity_hash?: string
          identity_last4?: string
          identity_type?: string
          metadata?: Json
          organization_id?: string
          patient_id?: string | null
          session_id?: string | null
          source_message_id?: string
          verification_method?: string
          verified_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_identity_verification_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_identity_verification_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_identity_verification_events_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_profiles: {
        Row: {
          age: number | null
          avatar_storage_path: string | null
          avatar_updated_at: string | null
          care_communications_consent: boolean
          created_at: string
          date_of_birth: string | null
          email: string | null
          first_seen_at: string
          full_name: string
          health_concern: string | null
          id: string
          identity_status: string
          last_seen_at: string
          locality: string | null
          marketing_consent: boolean
          normalized_phone: string | null
          organization_id: string
          patient_summary: string | null
          phone: string | null
          pincode: string | null
          primary_contact_phone: string | null
          source: string
          updated_at: string
        }
        Insert: {
          age?: number | null
          avatar_storage_path?: string | null
          avatar_updated_at?: string | null
          care_communications_consent?: boolean
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          first_seen_at?: string
          full_name: string
          health_concern?: string | null
          id?: string
          identity_status?: string
          last_seen_at?: string
          locality?: string | null
          marketing_consent?: boolean
          normalized_phone?: string | null
          organization_id: string
          patient_summary?: string | null
          phone?: string | null
          pincode?: string | null
          primary_contact_phone?: string | null
          source?: string
          updated_at?: string
        }
        Update: {
          age?: number | null
          avatar_storage_path?: string | null
          avatar_updated_at?: string | null
          care_communications_consent?: boolean
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          first_seen_at?: string
          full_name?: string
          health_concern?: string | null
          id?: string
          identity_status?: string
          last_seen_at?: string
          locality?: string | null
          marketing_consent?: boolean
          normalized_phone?: string | null
          organization_id?: string
          patient_summary?: string | null
          phone?: string | null
          pincode?: string | null
          primary_contact_phone?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_gateway_connections: {
        Row: {
          account_label: string | null
          created_at: string
          id: string
          last_verified_at: string | null
          organization_id: string
          provider: string
          status: string
          supported_methods: string[]
          updated_at: string
        }
        Insert: {
          account_label?: string | null
          created_at?: string
          id?: string
          last_verified_at?: string | null
          organization_id: string
          provider: string
          status?: string
          supported_methods?: string[]
          updated_at?: string
        }
        Update: {
          account_label?: string | null
          created_at?: string
          id?: string
          last_verified_at?: string | null
          organization_id?: string
          provider?: string
          status?: string
          supported_methods?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_gateway_connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_gateway_connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      prescription_items: {
        Row: {
          catalog_entry_id: number | null
          catalogue_snapshot: Json
          created_at: string
          dosage: string | null
          duration: string | null
          frequency: string
          id: string
          instructions: string | null
          medicine_identifier: string | null
          medicine_name: string
          medicine_source: string
          organization_id: string
          prescription_id: string
          sort_order: number
        }
        Insert: {
          catalog_entry_id?: number | null
          catalogue_snapshot?: Json
          created_at?: string
          dosage?: string | null
          duration?: string | null
          frequency: string
          id?: string
          instructions?: string | null
          medicine_identifier?: string | null
          medicine_name: string
          medicine_source?: string
          organization_id: string
          prescription_id: string
          sort_order?: number
        }
        Update: {
          catalog_entry_id?: number | null
          catalogue_snapshot?: Json
          created_at?: string
          dosage?: string | null
          duration?: string | null
          frequency?: string
          id?: string
          instructions?: string | null
          medicine_identifier?: string | null
          medicine_name?: string
          medicine_source?: string
          organization_id?: string
          prescription_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "prescription_items_catalog_entry_id_fkey"
            columns: ["catalog_entry_id"]
            isOneToOne: false
            referencedRelation: "medicine_catalog_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescription_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescription_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescription_items_prescription_id_fkey"
            columns: ["prescription_id"]
            isOneToOne: false
            referencedRelation: "prescriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      prescriptions: {
        Row: {
          advice: string | null
          appointment_id: string | null
          created_at: string
          created_by: string
          diagnosis: string | null
          encounter_id: string | null
          follow_up_at: string | null
          id: string
          issued_at: string
          organization_id: string
          patient_id: string
          prescription_number: string
          status: string
          supersedes_id: string | null
          tests_requested: string | null
          version: number
        }
        Insert: {
          advice?: string | null
          appointment_id?: string | null
          created_at?: string
          created_by: string
          diagnosis?: string | null
          encounter_id?: string | null
          follow_up_at?: string | null
          id?: string
          issued_at?: string
          organization_id: string
          patient_id: string
          prescription_number: string
          status?: string
          supersedes_id?: string | null
          tests_requested?: string | null
          version?: number
        }
        Update: {
          advice?: string | null
          appointment_id?: string | null
          created_at?: string
          created_by?: string
          diagnosis?: string | null
          encounter_id?: string | null
          follow_up_at?: string | null
          id?: string
          issued_at?: string
          organization_id?: string
          patient_id?: string
          prescription_number?: string
          status?: string
          supersedes_id?: string | null
          tests_requested?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "prescriptions_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "voice_appointments_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "patient_encounters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "prescriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      production_readiness_checks: {
        Row: {
          check_key: string
          created_at: string
          evidence_at: string | null
          id: string
          notes: string | null
          organization_id: string
          status: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          check_key: string
          created_at?: string
          evidence_at?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          status?: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          check_key?: string
          created_at?: string
          evidence_at?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          status?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_readiness_checks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_readiness_checks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_departments: {
        Row: {
          created_at: string
          department_id: string
          organization_id: string
          primary_department: boolean
          resource_id: string
        }
        Insert: {
          created_at?: string
          department_id: string
          organization_id: string
          primary_department?: boolean
          resource_id: string
        }
        Update: {
          created_at?: string
          department_id?: string
          organization_id?: string
          primary_department?: boolean
          resource_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_departments_department_id_organization_id_fkey"
            columns: ["department_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "clinic_departments"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "provider_departments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_departments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_departments_resource_id_organization_id_fkey"
            columns: ["resource_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "booking_resources"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      provider_location_assignments: {
        Row: {
          active: boolean
          booking_window_days: number
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          location_id: string
          organization_id: string
          resource_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          booking_window_days?: number
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          location_id: string
          organization_id: string
          resource_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          booking_window_days?: number
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          location_id?: string
          organization_id?: string
          resource_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_location_assignments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "business_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_location_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_location_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_location_assignments_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "booking_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_location_services: {
        Row: {
          active: boolean
          allowed_payment_modes: string[]
          assignment_id: string
          buffer_minutes: number | null
          created_at: string
          deposit_paise: number | null
          duration_minutes: number | null
          id: string
          organization_id: string
          payment_mode: string
          price_paise: number | null
          service_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          allowed_payment_modes?: string[]
          assignment_id: string
          buffer_minutes?: number | null
          created_at?: string
          deposit_paise?: number | null
          duration_minutes?: number | null
          id?: string
          organization_id: string
          payment_mode?: string
          price_paise?: number | null
          service_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          allowed_payment_modes?: string[]
          assignment_id?: string
          buffer_minutes?: number | null
          created_at?: string
          deposit_paise?: number | null
          duration_minutes?: number | null
          id?: string
          organization_id?: string
          payment_mode?: string
          price_paise?: number | null
          service_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_location_services_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "provider_location_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_location_services_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_location_services_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_location_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "organization_services"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_profiles: {
        Row: {
          biography: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          experience_years: number | null
          languages: string[]
          organization_id: string
          photo_path: string | null
          qualifications: string | null
          queue_notifications_enabled: boolean
          registration_number: string | null
          resource_id: string
          specialization: string | null
          updated_at: string
          whatsapp_queue_consent_at: string | null
          whatsapp_queue_consent_notice_version: string | null
          whatsapp_queue_consent_recorded_by: string | null
        }
        Insert: {
          biography?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          experience_years?: number | null
          languages?: string[]
          organization_id: string
          photo_path?: string | null
          qualifications?: string | null
          queue_notifications_enabled?: boolean
          registration_number?: string | null
          resource_id: string
          specialization?: string | null
          updated_at?: string
          whatsapp_queue_consent_at?: string | null
          whatsapp_queue_consent_notice_version?: string | null
          whatsapp_queue_consent_recorded_by?: string | null
        }
        Update: {
          biography?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          experience_years?: number | null
          languages?: string[]
          organization_id?: string
          photo_path?: string | null
          qualifications?: string | null
          queue_notifications_enabled?: boolean
          registration_number?: string | null
          resource_id?: string
          specialization?: string | null
          updated_at?: string
          whatsapp_queue_consent_at?: string | null
          whatsapp_queue_consent_notice_version?: string | null
          whatsapp_queue_consent_recorded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_profiles_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: true
            referencedRelation: "booking_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      quick_replies: {
        Row: {
          content: string
          created_at: string
          id: string
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quick_replies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quick_replies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      rag_knowledge_items: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          embedding_status: string
          id: string
          language_code: string
          organization_id: string
          source_type: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          embedding_status?: string
          id?: string
          language_code?: string
          organization_id: string
          source_type?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          embedding_status?: string
          id?: string
          language_code?: string
          organization_id?: string
          source_type?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rag_knowledge_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rag_knowledge_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      reminder_events: {
        Row: {
          appointment_id: string
          attempts: number
          channel: string
          connection_id: string | null
          created_at: string
          delivered_at: string | null
          event_type: string
          failure_reason: string | null
          id: string
          last_attempt_at: string | null
          max_attempts: number
          message_id: string | null
          next_attempt_at: string | null
          organization_id: string
          provider_message_id: string | null
          provider_response: Json
          read_at: string | null
          recipient: string
          scheduled_for: string
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          appointment_id: string
          attempts?: number
          channel: string
          connection_id?: string | null
          created_at?: string
          delivered_at?: string | null
          event_type: string
          failure_reason?: string | null
          id?: string
          last_attempt_at?: string | null
          max_attempts?: number
          message_id?: string | null
          next_attempt_at?: string | null
          organization_id: string
          provider_message_id?: string | null
          provider_response?: Json
          read_at?: string | null
          recipient: string
          scheduled_for: string
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          appointment_id?: string
          attempts?: number
          channel?: string
          connection_id?: string | null
          created_at?: string
          delivered_at?: string | null
          event_type?: string
          failure_reason?: string | null
          id?: string
          last_attempt_at?: string | null
          max_attempts?: number
          message_id?: string | null
          next_attempt_at?: string | null
          organization_id?: string
          provider_message_id?: string | null
          provider_response?: Json
          read_at?: string | null
          recipient?: string
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_events_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminder_events_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "voice_appointments_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminder_events_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "channel_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminder_events_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminder_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminder_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      retail_abandoned_carts: {
        Row: {
          cart_items: Json
          cart_value: number
          created_at: string
          customer_name: string | null
          customer_phone: string
          id: string
          organization_id: string
          recovered: boolean
          recovery_sent_at: string | null
          updated_at: string
        }
        Insert: {
          cart_items?: Json
          cart_value?: number
          created_at?: string
          customer_name?: string | null
          customer_phone: string
          id?: string
          organization_id: string
          recovered?: boolean
          recovery_sent_at?: string | null
          updated_at?: string
        }
        Update: {
          cart_items?: Json
          cart_value?: number
          created_at?: string
          customer_name?: string | null
          customer_phone?: string
          id?: string
          organization_id?: string
          recovered?: boolean
          recovery_sent_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "retail_abandoned_carts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retail_abandoned_carts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      retail_categories: {
        Row: {
          created_at: string
          display_order: number
          id: string
          image_url: string | null
          name: string
          organization_id: string
          parent_id: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string | null
          name: string
          organization_id: string
          parent_id?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string | null
          name?: string
          organization_id?: string
          parent_id?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "retail_categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retail_categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retail_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "retail_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      retail_discounts: {
        Row: {
          code: string
          created_at: string
          description: string | null
          discount_type: string
          expires_at: string | null
          id: string
          is_active: boolean
          max_discount_amount: number | null
          min_order_amount: number
          organization_id: string
          times_used: number
          updated_at: string
          usage_limit: number | null
          value: number
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          discount_type: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_discount_amount?: number | null
          min_order_amount?: number
          organization_id: string
          times_used?: number
          updated_at?: string
          usage_limit?: number | null
          value: number
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          discount_type?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_discount_amount?: number | null
          min_order_amount?: number
          organization_id?: string
          times_used?: number
          updated_at?: string
          usage_limit?: number | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "retail_discounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retail_discounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      retail_orders: {
        Row: {
          carrier: string | null
          created_at: string
          customer_address: string | null
          customer_name: string
          customer_phone: string
          discount_amount: number
          discount_code: string | null
          id: string
          notes: string | null
          organization_id: string
          payment_status: string
          status: string
          timeline: Json
          total_amount: number
          tracking_number: string | null
          tracking_url: string | null
          updated_at: string
        }
        Insert: {
          carrier?: string | null
          created_at?: string
          customer_address?: string | null
          customer_name: string
          customer_phone: string
          discount_amount?: number
          discount_code?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          payment_status?: string
          status?: string
          timeline?: Json
          total_amount?: number
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
        }
        Update: {
          carrier?: string | null
          created_at?: string
          customer_address?: string | null
          customer_name?: string
          customer_phone?: string
          discount_amount?: number
          discount_code?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          payment_status?: string
          status?: string
          timeline?: Json
          total_amount?: number
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "retail_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retail_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      retail_products: {
        Row: {
          availability: string | null
          brand: string | null
          category_id: string | null
          condition: string | null
          created_at: string | null
          currency: string | null
          description: string | null
          id: string
          image_link: string
          images: Json
          inventory_count: number | null
          link: string
          low_stock_threshold: number
          organization_id: string
          price: number
          sku: string
          tags: string[] | null
          title: string
          updated_at: string | null
          variants: Json
        }
        Insert: {
          availability?: string | null
          brand?: string | null
          category_id?: string | null
          condition?: string | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          id?: string
          image_link: string
          images?: Json
          inventory_count?: number | null
          link: string
          low_stock_threshold?: number
          organization_id: string
          price: number
          sku: string
          tags?: string[] | null
          title: string
          updated_at?: string | null
          variants?: Json
        }
        Update: {
          availability?: string | null
          brand?: string | null
          category_id?: string | null
          condition?: string | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          id?: string
          image_link?: string
          images?: Json
          inventory_count?: number | null
          link?: string
          low_stock_threshold?: number
          organization_id?: string
          price?: number
          sku?: string
          tags?: string[] | null
          title?: string
          updated_at?: string | null
          variants?: Json
        }
        Relationships: [
          {
            foreignKeyName: "retail_products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "retail_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retail_products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retail_products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          permissions: Json
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          permissions?: Json
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          permissions?: Json
        }
        Relationships: []
      }
      saas_billing_orders: {
        Row: {
          amount_paise: number
          created_at: string
          created_by: string | null
          currency: string
          failure_reason: string | null
          id: string
          metadata: Json
          organization_id: string
          paid_at: string | null
          period_end: string | null
          period_start: string | null
          plan_id: string
          provider: string
          provider_order_id: string | null
          provider_payment_id: string | null
          receipt: string
          status: string
          updated_at: string
        }
        Insert: {
          amount_paise: number
          created_at?: string
          created_by?: string | null
          currency?: string
          failure_reason?: string | null
          id?: string
          metadata?: Json
          organization_id: string
          paid_at?: string | null
          period_end?: string | null
          period_start?: string | null
          plan_id: string
          provider?: string
          provider_order_id?: string | null
          provider_payment_id?: string | null
          receipt: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount_paise?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          failure_reason?: string | null
          id?: string
          metadata?: Json
          organization_id?: string
          paid_at?: string | null
          period_end?: string | null
          period_start?: string | null
          plan_id?: string
          provider?: string
          provider_order_id?: string | null
          provider_payment_id?: string | null
          receipt?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "saas_billing_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saas_billing_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saas_billing_orders_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "saas_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      saas_invoices: {
        Row: {
          billing_order_id: string
          created_at: string
          currency: string
          id: string
          invoice_number: string
          issued_at: string
          metadata: Json
          organization_id: string
          period_end: string
          period_start: string
          plan_id: string
          status: string
          subtotal_paise: number
          tax_paise: number
          total_paise: number
        }
        Insert: {
          billing_order_id: string
          created_at?: string
          currency?: string
          id?: string
          invoice_number: string
          issued_at?: string
          metadata?: Json
          organization_id: string
          period_end: string
          period_start: string
          plan_id: string
          status?: string
          subtotal_paise: number
          tax_paise?: number
          total_paise: number
        }
        Update: {
          billing_order_id?: string
          created_at?: string
          currency?: string
          id?: string
          invoice_number?: string
          issued_at?: string
          metadata?: Json
          organization_id?: string
          period_end?: string
          period_start?: string
          plan_id?: string
          status?: string
          subtotal_paise?: number
          tax_paise?: number
          total_paise?: number
        }
        Relationships: [
          {
            foreignKeyName: "saas_invoices_billing_order_id_fkey"
            columns: ["billing_order_id"]
            isOneToOne: true
            referencedRelation: "saas_billing_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saas_invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saas_invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saas_invoices_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "saas_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      saas_plans: {
        Row: {
          active: boolean
          channels: Json
          conversations_quota: number
          created_at: string
          currency: string
          display_order: number
          features: Json
          id: string
          max_locations: number
          max_seats: number
          monthly_price_paise: number
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          channels?: Json
          conversations_quota: number
          created_at?: string
          currency?: string
          display_order?: number
          features?: Json
          id: string
          max_locations: number
          max_seats: number
          monthly_price_paise: number
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          channels?: Json
          conversations_quota?: number
          created_at?: string
          currency?: string
          display_order?: number
          features?: Json
          id?: string
          max_locations?: number
          max_seats?: number
          monthly_price_paise?: number
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      schedule_exceptions: {
        Row: {
          created_at: string
          created_by: string
          ends_at: string
          exception_type: string
          id: string
          location_id: string | null
          organization_id: string
          reason: string
          resource_id: string | null
          starts_at: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          ends_at: string
          exception_type?: string
          id?: string
          location_id?: string | null
          organization_id: string
          reason: string
          resource_id?: string | null
          starts_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          ends_at?: string
          exception_type?: string
          id?: string
          location_id?: string | null
          organization_id?: string
          reason?: string
          resource_id?: string | null
          starts_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_exceptions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "business_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_exceptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_exceptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_exceptions_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "booking_resources"
            referencedColumns: ["id"]
          },
        ]
      }
      security_incident_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event_type: string
          from_status: string | null
          id: string
          incident_id: string
          organization_id: string
          safe_summary: string
          to_status: string | null
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          from_status?: string | null
          id?: string
          incident_id: string
          organization_id: string
          safe_summary: string
          to_status?: string | null
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          from_status?: string | null
          id?: string
          incident_id?: string
          organization_id?: string
          safe_summary?: string
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "security_incident_events_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "security_incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_incident_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_incident_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      security_incidents: {
        Row: {
          category: string
          closed_at: string | null
          contained_at: string | null
          containment_summary: string | null
          created_at: string
          created_by: string
          id: string
          organization_id: string
          owner_user_id: string | null
          reference: string
          resolution_summary: string | null
          resolved_at: string | null
          safe_summary: string
          severity: string
          status: string
          title: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          category: string
          closed_at?: string | null
          contained_at?: string | null
          containment_summary?: string | null
          created_at?: string
          created_by: string
          id?: string
          organization_id: string
          owner_user_id?: string | null
          reference?: string
          resolution_summary?: string | null
          resolved_at?: string | null
          safe_summary: string
          severity: string
          status?: string
          title: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          category?: string
          closed_at?: string | null
          contained_at?: string | null
          containment_summary?: string | null
          created_at?: string
          created_by?: string
          id?: string
          organization_id?: string
          owner_user_id?: string | null
          reference?: string
          resolution_summary?: string | null
          resolved_at?: string | null
          safe_summary?: string
          severity?: string
          status?: string
          title?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_incidents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_incidents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      service_requests: {
        Row: {
          admin_notes: string | null
          created_at: string
          id: string
          organization_id: string
          payload: Json
          request_type: string
          requested_by: string
          status: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          id?: string
          organization_id: string
          payload?: Json
          request_type: string
          requested_by: string
          status?: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          id?: string
          organization_id?: string
          payload?: Json
          request_type?: string
          requested_by?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      system_runtime_controls: {
        Row: {
          control_key: string
          created_at: string
          expires_at: string | null
          id: string
          is_enabled: boolean
          metadata: Json | null
          organization_id: string | null
          reason: string | null
          scope: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          control_key: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_enabled?: boolean
          metadata?: Json | null
          organization_id?: string | null
          reason?: string | null
          scope?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          control_key?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_enabled?: boolean
          metadata?: Json | null
          organization_id?: string | null
          reason?: string | null
          scope?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "system_runtime_controls_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_runtime_controls_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      team_audit_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event_type: string
          id: string
          metadata: Json
          organization_id: string
          subject_agent_id: string | null
          summary: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          organization_id: string
          subject_agent_id?: string | null
          summary: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          organization_id?: string
          subject_agent_id?: string | null
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_audit_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_audit_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_audit_events_subject_agent_id_fkey"
            columns: ["subject_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_documents: {
        Row: {
          created_at: string
          error_message: string | null
          file_name: string
          file_path: string
          file_type: string
          id: string
          organization_id: string
          processing_status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          file_name: string
          file_path: string
          file_type: string
          id?: string
          organization_id: string
          processing_status?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          file_name?: string
          file_path?: string
          file_type?: string
          id?: string
          organization_id?: string
          processing_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_metering: {
        Row: {
          contact_address: string
          conversation_window_end: string
          conversation_window_start: string
          created_at: string
          id: string
          organization_id: string
          period_date: string
        }
        Insert: {
          contact_address: string
          conversation_window_end: string
          conversation_window_start: string
          created_at?: string
          id?: string
          organization_id: string
          period_date?: string
        }
        Update: {
          contact_address?: string
          conversation_window_end?: string
          conversation_window_start?: string
          created_at?: string
          id?: string
          organization_id?: string
          period_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_metering_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_metering_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_agent_configs: {
        Row: {
          agent_persona: string
          auto_language_switch: boolean
          bot_name: string
          business_category: string | null
          business_vertical: string | null
          clinic_name: string
          created_at: string | null
          emergency_instructions: string | null
          enabled_languages: string[]
          forwarding_carrier: string | null
          forwarding_phone_number: string | null
          greeting_message: string | null
          id: string
          is_active: boolean
          onboarding_completed: boolean
          operating_hours: Json
          org_id: string
          outbound_calling_window: Json | null
          primary_language: string
          receptionist_eq_tone: string | null
          receptionist_phone: string
          sales_agent_active: boolean | null
          sales_agent_name: string | null
          sales_campaign_type: string | null
          sales_eq_style: string | null
          sales_packages: Json | null
          sms_confirmation_enabled: boolean
          telephony_mode: string
          updated_at: string | null
          vertical_settings: Json | null
          virtual_number: string | null
          vmn_number: string | null
          vmn_plan_active: boolean | null
          vmn_status: string | null
          voice_id: string
          whatsapp_confirmation_enabled: boolean
        }
        Insert: {
          agent_persona?: string
          auto_language_switch?: boolean
          bot_name?: string
          business_category?: string | null
          business_vertical?: string | null
          clinic_name: string
          created_at?: string | null
          emergency_instructions?: string | null
          enabled_languages?: string[]
          forwarding_carrier?: string | null
          forwarding_phone_number?: string | null
          greeting_message?: string | null
          id?: string
          is_active?: boolean
          onboarding_completed?: boolean
          operating_hours?: Json
          org_id: string
          outbound_calling_window?: Json | null
          primary_language?: string
          receptionist_eq_tone?: string | null
          receptionist_phone: string
          sales_agent_active?: boolean | null
          sales_agent_name?: string | null
          sales_campaign_type?: string | null
          sales_eq_style?: string | null
          sales_packages?: Json | null
          sms_confirmation_enabled?: boolean
          telephony_mode?: string
          updated_at?: string | null
          vertical_settings?: Json | null
          virtual_number?: string | null
          vmn_number?: string | null
          vmn_plan_active?: boolean | null
          vmn_status?: string | null
          voice_id?: string
          whatsapp_confirmation_enabled?: boolean
        }
        Update: {
          agent_persona?: string
          auto_language_switch?: boolean
          bot_name?: string
          business_category?: string | null
          business_vertical?: string | null
          clinic_name?: string
          created_at?: string | null
          emergency_instructions?: string | null
          enabled_languages?: string[]
          forwarding_carrier?: string | null
          forwarding_phone_number?: string | null
          greeting_message?: string | null
          id?: string
          is_active?: boolean
          onboarding_completed?: boolean
          operating_hours?: Json
          org_id?: string
          outbound_calling_window?: Json | null
          primary_language?: string
          receptionist_eq_tone?: string | null
          receptionist_phone?: string
          sales_agent_active?: boolean | null
          sales_agent_name?: string | null
          sales_campaign_type?: string | null
          sales_eq_style?: string | null
          sales_packages?: Json | null
          sms_confirmation_enabled?: boolean
          telephony_mode?: string
          updated_at?: string | null
          vertical_settings?: Json | null
          virtual_number?: string | null
          vmn_number?: string | null
          vmn_plan_active?: boolean | null
          vmn_status?: string | null
          voice_id?: string
          whatsapp_confirmation_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "voice_agent_configs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_agent_configs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_call_logs: {
        Row: {
          agent_type: string
          billing_deducted: boolean | null
          contact_phone: string
          created_at: string | null
          direction: string
          duration_seconds: number | null
          emergency_flag: boolean | null
          emergency_reason: string | null
          exotel_call_sid: string | null
          id: string
          is_consented_recording: boolean | null
          latency_metrics: Json | null
          org_id: string | null
          outcome: string | null
          retention_expires_at: string | null
          retention_status: string | null
          stream_sid: string | null
          summary: string | null
          transcript: Json | null
          transcript_accessed_at: string | null
          transcript_accessed_by: string | null
          updated_at: string | null
          vertical: string
        }
        Insert: {
          agent_type?: string
          billing_deducted?: boolean | null
          contact_phone: string
          created_at?: string | null
          direction: string
          duration_seconds?: number | null
          emergency_flag?: boolean | null
          emergency_reason?: string | null
          exotel_call_sid?: string | null
          id?: string
          is_consented_recording?: boolean | null
          latency_metrics?: Json | null
          org_id?: string | null
          outcome?: string | null
          retention_expires_at?: string | null
          retention_status?: string | null
          stream_sid?: string | null
          summary?: string | null
          transcript?: Json | null
          transcript_accessed_at?: string | null
          transcript_accessed_by?: string | null
          updated_at?: string | null
          vertical?: string
        }
        Update: {
          agent_type?: string
          billing_deducted?: boolean | null
          contact_phone?: string
          created_at?: string | null
          direction?: string
          duration_seconds?: number | null
          emergency_flag?: boolean | null
          emergency_reason?: string | null
          exotel_call_sid?: string | null
          id?: string
          is_consented_recording?: boolean | null
          latency_metrics?: Json | null
          org_id?: string | null
          outcome?: string | null
          retention_expires_at?: string | null
          retention_status?: string | null
          stream_sid?: string | null
          summary?: string | null
          transcript?: Json | null
          transcript_accessed_at?: string | null
          transcript_accessed_by?: string | null
          updated_at?: string | null
          vertical?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_call_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_call_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_service_nonces: {
        Row: {
          consumed_at: string
          created_at: string
          expires_at: string
          organization_id: string
          request_id: string
        }
        Insert: {
          consumed_at?: string
          created_at?: string
          expires_at: string
          organization_id: string
          request_id: string
        }
        Update: {
          consumed_at?: string
          created_at?: string
          expires_at?: string
          organization_id?: string
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_service_nonces_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_service_nonces_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_sessions: {
        Row: {
          call_sid: string
          caller_phone: string | null
          ended_at: string | null
          id: string
          metadata: Json | null
          started_at: string | null
          status: string
          stream_sid: string | null
        }
        Insert: {
          call_sid: string
          caller_phone?: string | null
          ended_at?: string | null
          id?: string
          metadata?: Json | null
          started_at?: string | null
          status?: string
          stream_sid?: string | null
        }
        Update: {
          call_sid?: string
          caller_phone?: string | null
          ended_at?: string | null
          id?: string
          metadata?: Json | null
          started_at?: string | null
          status?: string
          stream_sid?: string | null
        }
        Relationships: []
      }
      voice_transcript_access_audits: {
        Row: {
          accessed_at: string
          accessed_by: string
          call_log_id: string
          client_ip: string | null
          created_at: string
          id: string
          organization_id: string
          user_agent: string | null
        }
        Insert: {
          accessed_at?: string
          accessed_by: string
          call_log_id: string
          client_ip?: string | null
          created_at?: string
          id?: string
          organization_id: string
          user_agent?: string | null
        }
        Update: {
          accessed_at?: string
          accessed_by?: string
          call_log_id?: string
          client_ip?: string | null
          created_at?: string
          id?: string
          organization_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voice_transcript_access_audits_call_log_id_fkey"
            columns: ["call_log_id"]
            isOneToOne: false
            referencedRelation: "voice_call_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_transcript_access_audits_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_transcript_access_audits_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist_offers: {
        Row: {
          appointment_id: string | null
          created_at: string
          ends_at: string
          expires_at: string
          id: string
          location_id: string
          message_id: string | null
          organization_id: string
          resource_id: string
          responded_at: string | null
          service_id: string
          starts_at: string
          status: string
          updated_at: string
          waitlist_id: string
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string
          ends_at: string
          expires_at: string
          id?: string
          location_id: string
          message_id?: string | null
          organization_id: string
          resource_id: string
          responded_at?: string | null
          service_id: string
          starts_at: string
          status?: string
          updated_at?: string
          waitlist_id: string
        }
        Update: {
          appointment_id?: string | null
          created_at?: string
          ends_at?: string
          expires_at?: string
          id?: string
          location_id?: string
          message_id?: string | null
          organization_id?: string
          resource_id?: string
          responded_at?: string | null
          service_id?: string
          starts_at?: string
          status?: string
          updated_at?: string
          waitlist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_offers_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_offers_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "voice_appointments_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_offers_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "business_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_offers_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_offers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_offers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_offers_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "booking_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_offers_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "organization_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_offers_waitlist_id_fkey"
            columns: ["waitlist_id"]
            isOneToOne: false
            referencedRelation: "appointment_waitlist"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          event_id: string
          organization_id: string | null
          processed_at: string
          provider: string
        }
        Insert: {
          event_id: string
          organization_id?: string | null
          processed_at?: string
          provider: string
        }
        Update: {
          event_id?: string
          organization_id?: string | null
          processed_at?: string
          provider?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      webhooks: {
        Row: {
          created_at: string
          id: string
          operations: Database["public"]["Enums"]["webhook_operation"][]
          organization_id: string
          table_name: Database["public"]["Enums"]["webhook_table"]
          token: string | null
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          operations: Database["public"]["Enums"]["webhook_operation"][]
          organization_id: string
          table_name: Database["public"]["Enums"]["webhook_table"]
          token?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          operations?: Database["public"]["Enums"]["webhook_operation"][]
          organization_id?: string
          table_name?: Database["public"]["Enums"]["webhook_table"]
          token?: string | null
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhooks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhooks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_acceptance_observations: {
        Row: {
          created_at: string
          id: string
          observation_key: string
          organization_id: string
          response_message_id: string
          run_id: string
          safe_summary: string
          source_message_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          observation_key: string
          organization_id: string
          response_message_id: string
          run_id: string
          safe_summary: string
          source_message_id: string
        }
        Update: {
          created_at?: string
          id?: string
          observation_key?: string
          organization_id?: string
          response_message_id?: string
          run_id?: string
          safe_summary?: string
          source_message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_acceptance_observations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_acceptance_observations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_acceptance_observations_response_message_id_fkey"
            columns: ["response_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_acceptance_observations_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_acceptance_test_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_acceptance_observations_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_acceptance_payments: {
        Row: {
          access_token_hash: string
          amount_paise: number
          created_at: string
          currency: string
          expires_at: string
          id: string
          organization_id: string
          paid_at: string | null
          provider_order_id: string | null
          provider_payment_id: string | null
          run_id: string
          status: string
          updated_at: string
        }
        Insert: {
          access_token_hash: string
          amount_paise?: number
          created_at?: string
          currency?: string
          expires_at: string
          id?: string
          organization_id: string
          paid_at?: string | null
          provider_order_id?: string | null
          provider_payment_id?: string | null
          run_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          access_token_hash?: string
          amount_paise?: number
          created_at?: string
          currency?: string
          expires_at?: string
          id?: string
          organization_id?: string
          paid_at?: string | null
          provider_order_id?: string | null
          provider_payment_id?: string | null
          run_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_acceptance_payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_acceptance_payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_acceptance_payments_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: true
            referencedRelation: "whatsapp_acceptance_test_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_acceptance_test_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          organization_id: string
          run_id: string
          safe_summary: string | null
          scenario_key: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          organization_id: string
          run_id: string
          safe_summary?: string | null
          scenario_key: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          organization_id?: string
          run_id?: string
          safe_summary?: string | null
          scenario_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_acceptance_test_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_acceptance_test_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_acceptance_test_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_acceptance_test_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_acceptance_test_runs: {
        Row: {
          checkout_url: string | null
          completed_at: string | null
          created_at: string
          dispatch_message_id: string | null
          evidence_reference: string | null
          expires_at: string | null
          failure_summary: string | null
          id: string
          lease_token: string | null
          max_messages: number
          message_count: number
          organization_id: string
          recipient_hash: string | null
          recipient_last4: string | null
          scenario_key: string
          started_at: string | null
          status: string
          subject_acceptance_payment_id: string | null
          subject_payment_id: string | null
          synthetic_label: string
          updated_at: string
          verified_message_id: string | null
        }
        Insert: {
          checkout_url?: string | null
          completed_at?: string | null
          created_at?: string
          dispatch_message_id?: string | null
          evidence_reference?: string | null
          expires_at?: string | null
          failure_summary?: string | null
          id?: string
          lease_token?: string | null
          max_messages?: number
          message_count?: number
          organization_id: string
          recipient_hash?: string | null
          recipient_last4?: string | null
          scenario_key: string
          started_at?: string | null
          status?: string
          subject_acceptance_payment_id?: string | null
          subject_payment_id?: string | null
          synthetic_label?: string
          updated_at?: string
          verified_message_id?: string | null
        }
        Update: {
          checkout_url?: string | null
          completed_at?: string | null
          created_at?: string
          dispatch_message_id?: string | null
          evidence_reference?: string | null
          expires_at?: string | null
          failure_summary?: string | null
          id?: string
          lease_token?: string | null
          max_messages?: number
          message_count?: number
          organization_id?: string
          recipient_hash?: string | null
          recipient_last4?: string | null
          scenario_key?: string
          started_at?: string | null
          status?: string
          subject_acceptance_payment_id?: string | null
          subject_payment_id?: string | null
          synthetic_label?: string
          updated_at?: string
          verified_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_acceptance_test_runs_dispatch_message_id_fkey"
            columns: ["dispatch_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_acceptance_test_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_acceptance_test_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_acceptance_test_runs_subject_acceptance_payment_i_fkey"
            columns: ["subject_acceptance_payment_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_acceptance_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_acceptance_test_runs_subject_payment_id_fkey"
            columns: ["subject_payment_id"]
            isOneToOne: false
            referencedRelation: "booking_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_acceptance_test_runs_verified_message_id_fkey"
            columns: ["verified_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_booking_acceptance_checks: {
        Row: {
          check_key: string
          created_at: string
          evidence_kind: string
          evidence_reference: string | null
          evidence_summary: string | null
          id: string
          organization_id: string
          recorded_by: string | null
          status: string
          tested_at: string | null
          updated_at: string
        }
        Insert: {
          check_key: string
          created_at?: string
          evidence_kind?: string
          evidence_reference?: string | null
          evidence_summary?: string | null
          id?: string
          organization_id: string
          recorded_by?: string | null
          status?: string
          tested_at?: string | null
          updated_at?: string
        }
        Update: {
          check_key?: string
          created_at?: string
          evidence_kind?: string
          evidence_reference?: string | null
          evidence_summary?: string | null
          id?: string
          organization_id?: string
          recorded_by?: string | null
          status?: string
          tested_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_booking_acceptance_checks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_booking_acceptance_checks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_booking_consent_evidence: {
        Row: {
          action: string
          captured_at: string
          channel: string
          channel_identity_hash: string
          channel_identity_last4: string
          conversation_id: string
          id: string
          identity_verified_by_channel: boolean
          notice_text: string
          notice_version: string
          organization_id: string
          session_id: string | null
          source_message_id: string
        }
        Insert: {
          action: string
          captured_at?: string
          channel?: string
          channel_identity_hash: string
          channel_identity_last4: string
          conversation_id: string
          id?: string
          identity_verified_by_channel?: boolean
          notice_text: string
          notice_version: string
          organization_id: string
          session_id?: string | null
          source_message_id: string
        }
        Update: {
          action?: string
          captured_at?: string
          channel?: string
          channel_identity_hash?: string
          channel_identity_last4?: string
          conversation_id?: string
          id?: string
          identity_verified_by_channel?: boolean
          notice_text?: string
          notice_version?: string
          organization_id?: string
          session_id?: string | null
          source_message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_booking_consent_evidence_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_booking_consent_evidence_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_booking_requests: {
        Row: {
          appointment_id: string | null
          booking_consent_evidence_id: string | null
          conversation_id: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: string
          location_id: string | null
          organization_id: string
          patient_name: string | null
          patient_phone: string | null
          resource_id: string | null
          service_id: string | null
          session_id: string | null
          starts_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          appointment_id?: string | null
          booking_consent_evidence_id?: string | null
          conversation_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          location_id?: string | null
          organization_id: string
          patient_name?: string | null
          patient_phone?: string | null
          resource_id?: string | null
          service_id?: string | null
          session_id?: string | null
          starts_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          appointment_id?: string | null
          booking_consent_evidence_id?: string | null
          conversation_id?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          location_id?: string | null
          organization_id?: string
          patient_name?: string | null
          patient_phone?: string | null
          resource_id?: string | null
          service_id?: string | null
          session_id?: string | null
          starts_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_booking_requests_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_booking_requests_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "voice_appointments_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_booking_requests_booking_consent_evidence_id_fkey"
            columns: ["booking_consent_evidence_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_booking_consent_evidence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_booking_requests_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_booking_requests_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "business_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_booking_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_booking_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_booking_requests_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "booking_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_booking_requests_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "organization_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_booking_requests_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_booking_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_booking_sessions: {
        Row: {
          contact_address: string
          context: Json
          conversation_id: string
          created_at: string
          expires_at: string
          id: string
          last_message_id: string | null
          organization_id: string
          state: string
          updated_at: string
        }
        Insert: {
          contact_address: string
          context?: Json
          conversation_id: string
          created_at?: string
          expires_at?: string
          id?: string
          last_message_id?: string | null
          organization_id: string
          state?: string
          updated_at?: string
        }
        Update: {
          contact_address?: string
          context?: Json
          conversation_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          last_message_id?: string | null
          organization_id?: string
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_booking_sessions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_booking_sessions_last_message_id_fkey"
            columns: ["last_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_booking_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_booking_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_booking_settings: {
        Row: {
          allow_secure_history: boolean
          confirmation_mode: string
          created_at: string
          enabled: boolean
          id: string
          organization_id: string
          patient_portal_base_url: string
          session_timeout_minutes: number
          updated_at: string
          waitlist_offer_minutes: number
          welcome_message: string
        }
        Insert: {
          allow_secure_history?: boolean
          confirmation_mode?: string
          created_at?: string
          enabled?: boolean
          id?: string
          organization_id: string
          patient_portal_base_url?: string
          session_timeout_minutes?: number
          updated_at?: string
          waitlist_offer_minutes?: number
          welcome_message?: string
        }
        Update: {
          allow_secure_history?: boolean
          confirmation_mode?: string
          created_at?: string
          enabled?: boolean
          id?: string
          organization_id?: string
          patient_portal_base_url?: string
          session_timeout_minutes?: number
          updated_at?: string
          waitlist_offer_minutes?: number
          welcome_message?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_booking_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_booking_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_concierge_dispatches: {
        Row: {
          attempts: number
          conversation_id: string
          created_at: string
          id: string
          last_error: string | null
          message_id: string
          next_attempt_at: string
          organization_id: string
          processed_at: string | null
          request_id: number | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          conversation_id: string
          created_at?: string
          id?: string
          last_error?: string | null
          message_id: string
          next_attempt_at?: string
          organization_id: string
          processed_at?: string | null
          request_id?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          conversation_id?: string
          created_at?: string
          id?: string
          last_error?: string | null
          message_id?: string
          next_attempt_at?: string
          organization_id?: string
          processed_at?: string | null
          request_id?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_concierge_dispatches_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_concierge_dispatches_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: true
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_concierge_dispatches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_concierge_dispatches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_inbound_messages: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_type: string
          organization_id: string | null
          payload: Json
          provider_message_id: string
          recipient_phone_id: string
          retry_count: number
          sender_phone: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_type?: string
          organization_id?: string | null
          payload?: Json
          provider_message_id: string
          recipient_phone_id: string
          retry_count?: number
          sender_phone: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_type?: string
          organization_id?: string | null
          payload?: Json
          provider_message_id?: string
          recipient_phone_id?: string
          retry_count?: number
          sender_phone?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_inbound_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_inbound_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_preference_events: {
        Row: {
          action: string
          care_communications_enabled: boolean
          channel: string
          conversation_id: string
          created_at: string
          id: string
          identity_hash: string
          identity_last4: string
          marketing_enabled: boolean
          metadata: Json
          organization_id: string
          patient_id: string | null
          session_id: string
          source_message_id: string
        }
        Insert: {
          action: string
          care_communications_enabled: boolean
          channel?: string
          conversation_id: string
          created_at?: string
          id?: string
          identity_hash: string
          identity_last4: string
          marketing_enabled?: boolean
          metadata?: Json
          organization_id: string
          patient_id?: string | null
          session_id: string
          source_message_id: string
        }
        Update: {
          action?: string
          care_communications_enabled?: boolean
          channel?: string
          conversation_id?: string
          created_at?: string
          id?: string
          identity_hash?: string
          identity_last4?: string
          marketing_enabled?: boolean
          metadata?: Json
          organization_id?: string
          patient_id?: string | null
          session_id?: string
          source_message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_preference_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_preference_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_preference_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_preference_events_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_preference_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_booking_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_preference_events_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_rate_cards: {
        Row: {
          active: boolean
          base_rate_paise: number
          channel: string
          country_code: string
          created_at: string
          created_by: string | null
          currency: string
          effective_at: string
          expires_at: string | null
          id: string
          message_category: string
          platform_fee_paise: number
          source_url: string
          source_version: string
          verification_status: string
        }
        Insert: {
          active?: boolean
          base_rate_paise: number
          channel?: string
          country_code?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          effective_at: string
          expires_at?: string | null
          id?: string
          message_category: string
          platform_fee_paise?: number
          source_url: string
          source_version: string
          verification_status?: string
        }
        Update: {
          active?: boolean
          base_rate_paise?: number
          channel?: string
          country_code?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          effective_at?: string
          expires_at?: string | null
          id?: string
          message_category?: string
          platform_fee_paise?: number
          source_url?: string
          source_version?: string
          verification_status?: string
        }
        Relationships: []
      }
      whatsapp_recovery_acceptance_fixtures: {
        Row: {
          completed_at: string | null
          conversation_id: string
          id: string
          organization_id: string
          prepared_at: string
          previous_expires_at: string
          run_id: string
          session_id: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          conversation_id: string
          id?: string
          organization_id: string
          prepared_at?: string
          previous_expires_at: string
          run_id: string
          session_id: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          conversation_id?: string
          id?: string
          organization_id?: string
          prepared_at?: string
          previous_expires_at?: string
          run_id?: string
          session_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_recovery_acceptance_fixtures_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_recovery_acceptance_fixtures_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_recovery_acceptance_fixtures_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_recovery_acceptance_fixtures_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: true
            referencedRelation: "whatsapp_acceptance_test_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_recovery_acceptance_fixtures_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_booking_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_sales_action_outbox: {
        Row: {
          action_type: string
          attempts: number
          available_at: string
          conversation_id: string
          created_at: string
          dedupe_key: string
          failure_reason: string | null
          id: string
          organization_id: string
          payload: Json
          processed_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          action_type: string
          attempts?: number
          available_at?: string
          conversation_id: string
          created_at?: string
          dedupe_key: string
          failure_reason?: string | null
          id?: string
          organization_id: string
          payload?: Json
          processed_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          action_type?: string
          attempts?: number
          available_at?: string
          conversation_id?: string
          created_at?: string
          dedupe_key?: string
          failure_reason?: string | null
          id?: string
          organization_id?: string
          payload?: Json
          processed_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_sales_action_outbox_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_sales_action_outbox_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_sales_action_outbox_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_sales_lead_handoffs: {
        Row: {
          consented_at: string | null
          conversation_id: string
          created_at: string
          details: Json
          id: string
          lead_category: string
          organization_id: string
          provider_message_id: string | null
          sent_at: string | null
          status: string
          summary: string
          updated_at: string
        }
        Insert: {
          consented_at?: string | null
          conversation_id: string
          created_at?: string
          details?: Json
          id?: string
          lead_category: string
          organization_id: string
          provider_message_id?: string | null
          sent_at?: string | null
          status?: string
          summary: string
          updated_at?: string
        }
        Update: {
          consented_at?: string | null
          conversation_id?: string
          created_at?: string
          details?: Json
          id?: string
          lead_category?: string
          organization_id?: string
          provider_message_id?: string | null
          sent_at?: string | null
          status?: string
          summary?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_sales_lead_handoffs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_sales_lead_handoffs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_sales_lead_handoffs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_sales_lead_qualifications: {
        Row: {
          buying_intent_detected: boolean
          contact_address: string
          conversation_id: string
          created_at: string
          discovery_stage: string
          estimate_offer_status: string
          estimate_offered_at: string | null
          id: string
          interest_score: number
          last_prompt: string
          organization_id: string
          pain_categories: string[]
          selected_pain: string | null
          status: string
          updated_at: string
          vertical: string | null
        }
        Insert: {
          buying_intent_detected?: boolean
          contact_address: string
          conversation_id: string
          created_at?: string
          discovery_stage?: string
          estimate_offer_status?: string
          estimate_offered_at?: string | null
          id?: string
          interest_score?: number
          last_prompt?: string
          organization_id: string
          pain_categories?: string[]
          selected_pain?: string | null
          status?: string
          updated_at?: string
          vertical?: string | null
        }
        Update: {
          buying_intent_detected?: boolean
          contact_address?: string
          conversation_id?: string
          created_at?: string
          discovery_stage?: string
          estimate_offer_status?: string
          estimate_offered_at?: string | null
          id?: string
          interest_score?: number
          last_prompt?: string
          organization_id?: string
          pain_categories?: string[]
          selected_pain?: string | null
          status?: string
          updated_at?: string
          vertical?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_sales_lead_qualifications_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_sales_lead_qualifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_sales_lead_qualifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_sales_rag_dispatches: {
        Row: {
          classification: string
          conversation_id: string
          created_at: string
          failure_reason: string | null
          id: string
          message_id: string
          organization_id: string
          processed_at: string | null
          response_message_id: string | null
          source_document_ids: string[]
          status: string
          updated_at: string
        }
        Insert: {
          classification?: string
          conversation_id: string
          created_at?: string
          failure_reason?: string | null
          id?: string
          message_id: string
          organization_id: string
          processed_at?: string | null
          response_message_id?: string | null
          source_document_ids?: string[]
          status?: string
          updated_at?: string
        }
        Update: {
          classification?: string
          conversation_id?: string
          created_at?: string
          failure_reason?: string | null
          id?: string
          message_id?: string
          organization_id?: string
          processed_at?: string | null
          response_message_id?: string | null
          source_document_ids?: string[]
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_sales_rag_dispatches_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_sales_rag_dispatches_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: true
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_sales_rag_dispatches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_sales_rag_dispatches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_sales_rag_dispatches_response_message_id_fkey"
            columns: ["response_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_sales_value_estimates: {
        Row: {
          completed_at: string | null
          contact_address: string
          conversation_id: string
          created_at: string
          estimate: Json | null
          id: string
          inputs: Json
          next_field: string | null
          organization_id: string
          status: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          contact_address: string
          conversation_id: string
          created_at?: string
          estimate?: Json | null
          id?: string
          inputs?: Json
          next_field?: string | null
          organization_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          contact_address?: string
          conversation_id?: string
          created_at?: string
          estimate?: Json | null
          id?: string
          inputs?: Json
          next_field?: string | null
          organization_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_sales_value_estimates_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_sales_value_estimates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_sales_value_estimates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      patient_medication_adherence: {
        Row: {
          adherence_percent: number | null
          help_requests: number | null
          last_response_at: string | null
          organization_id: string | null
          patient_id: string | null
          skipped_doses: number | null
          snoozed_doses: number | null
          taken_doses: number | null
          total_doses: number | null
        }
        Relationships: [
          {
            foreignKeyName: "care_reminder_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_reminder_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "care_reminder_runs_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patient_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_appointments_readonly: {
        Row: {
          appointment_date: string | null
          doctor_id: string | null
          doctor_name: string | null
          end_time: string | null
          ends_at: string | null
          id: string | null
          location_id: string | null
          organization_id: string | null
          patient_name: string | null
          patient_phone: string | null
          service_id: string | null
          service_name: string | null
          start_time: string | null
          starts_at: string | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "business_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "voice_org_config_readonly"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_resource_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "booking_resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "organization_services"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_org_config_readonly: {
        Row: {
          address: string | null
          emergency_phone: string | null
          id: string | null
          is_active: boolean | null
          name: string | null
          operating_hours: string | null
          phone: string | null
        }
        Insert: {
          address?: never
          emergency_phone?: never
          id?: string | null
          is_active?: never
          name?: string | null
          operating_hours?: never
          phone?: never
        }
        Update: {
          address?: never
          emergency_phone?: never
          id?: string | null
          is_active?: never
          name?: string | null
          operating_hours?: never
          phone?: never
        }
        Relationships: []
      }
    }
    Functions: {
      accept_workspace_invitations: { Args: never; Returns: number }
      acquire_shadow_provider_slot: {
        Args: {
          p_max_requests_per_minute?: number
          p_provider_config_key: string
        }
        Returns: Json
      }
      acquire_whatsapp_inbound_lease: {
        Args: {
          p_lease_timeout_seconds?: number
          p_provider_message_id: string
        }
        Returns: boolean
      }
      activate_medicine_catalog_release: {
        Args: { p_release_id: string }
        Returns: undefined
      }
      activate_saas_subscription: {
        Args: { p_provider_order_id: string; p_provider_payment_id: string }
        Returns: Json
      }
      admin_get_tenant_overview: {
        Args: never
        Returns: {
          business_category: string
          created_at: string
          estimated_revenue_paise: number
          organization_id: string
          organization_name: string
          plan_id: string
          status: string
          total_messages: number
        }[]
      }
      agent_update_by_owner_rules: {
        Args: {
          p_ai: boolean
          p_extra: Json
          p_id: string
          p_organization_id: string
          p_user_id: string
        }
        Returns: boolean
      }
      approve_automation_rollout: {
        Args: { p_organization_id: string; p_workflow_id: string }
        Returns: {
          actor_user_id: string
          created_at: string
          decision: string
          evidence_window_started_at: string
          failure_count: number
          id: string
          observation_count: number
          organization_id: string
          workflow_id: string
        }
        SetofOptions: {
          from: "*"
          to: "automation_rollout_reviews"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      assign_appointment_queue_token: {
        Args: { p_appointment_id: string; p_organization_id: string }
        Returns: Json
      }
      attach_public_booking_identity: {
        Args: {
          p_booking_contact_name: string
          p_booking_contact_phone: string
          p_booking_reference: string
          p_manage_token: string
          p_patient_date_of_birth?: string
          p_patient_relationship: string
        }
        Returns: undefined
      }
      attach_public_payment_order: {
        Args: {
          p_booking_reference: string
          p_manage_token: string
          p_provider_order_id: string
        }
        Returns: undefined
      }
      cancel_customer_booking: {
        Args: { p_booking_reference: string; p_manage_token: string }
        Returns: undefined
      }
      claim_deposit_acceptance_dispatch: {
        Args: { p_organization_id: string }
        Returns: {
          checkout_url: string | null
          completed_at: string | null
          created_at: string
          dispatch_message_id: string | null
          evidence_reference: string | null
          expires_at: string | null
          failure_summary: string | null
          id: string
          lease_token: string | null
          max_messages: number
          message_count: number
          organization_id: string
          recipient_hash: string | null
          recipient_last4: string | null
          scenario_key: string
          started_at: string | null
          status: string
          subject_acceptance_payment_id: string | null
          subject_payment_id: string | null
          synthetic_label: string
          updated_at: string
          verified_message_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "whatsapp_acceptance_test_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_due_appointment_reminders: {
        Args: { p_limit?: number }
        Returns: {
          appointment_id: string
          attempts: number
          channel: string
          connection_id: string | null
          created_at: string
          delivered_at: string | null
          event_type: string
          failure_reason: string | null
          id: string
          last_attempt_at: string | null
          max_attempts: number
          message_id: string | null
          next_attempt_at: string | null
          organization_id: string
          provider_message_id: string | null
          provider_response: Json
          read_at: string | null
          recipient: string
          scheduled_for: string
          sent_at: string | null
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "reminder_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_due_care_reminder_runs: {
        Args: { p_limit?: number }
        Returns: {
          acknowledged_at: string | null
          acknowledgement: string | null
          approved_at: string | null
          approved_by: string | null
          attempt_count: number
          channel: string
          created_at: string
          delivered_at: string | null
          failure_reason: string | null
          id: string
          last_attempt_at: string | null
          max_attempts: number
          next_attempt_at: string | null
          organization_id: string
          patient_id: string
          provider_message_id: string | null
          provider_response: Json
          read_at: string | null
          reminder_id: string
          response_kind: string | null
          response_message_id: string | null
          response_received_at: string | null
          response_text: string | null
          scheduled_for: string
          sent_at: string | null
          snoozed_until: string | null
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "care_reminder_runs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_due_device_push_deliveries: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          auth_key: string
          body: string
          delivery_id: string
          endpoint: string
          href: string
          max_attempts: number
          notification_id: string
          p256dh_key: string
          subscription_id: string
          title: string
        }[]
      }
      claim_due_doctor_queue_dispatches: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          availability_rule_id: string
          booking_count: number
          created_at: string
          delivered_at: string | null
          failure_reason: string | null
          id: string
          max_attempts: number
          message_id: string | null
          next_attempt_at: string | null
          organization_id: string
          provider_message_id: string | null
          provider_response: Json
          read_at: string | null
          recipient_phone: string
          resource_id: string
          scheduled_for: string
          sent_at: string | null
          shift_date: string
          shift_starts_at: string
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "doctor_queue_dispatches"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_managed_automation_runs: {
        Args: { p_limit?: number }
        Returns: {
          attempt_count: number
          completed_at: string | null
          created_at: string
          delivery_status: string | null
          failure_code: string | null
          failure_summary: string | null
          id: string
          idempotency_key: string
          max_attempts: number
          next_attempt_at: string | null
          observed_message_id: string | null
          organization_id: string
          provider_execution_id: string | null
          safe_context: Json
          source_id: string | null
          source_type: string | null
          started_at: string | null
          status: string
          trigger_key: string
          updated_at: string
          workflow_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "automation_runs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      communication_control_enabled: {
        Args: { p_control: string; p_organization_id: string }
        Returns: boolean
      }
      complete_appointment_visit: {
        Args: {
          p_appointment_id: string
          p_clinical_note: string
          p_diagnosis?: string
          p_encounter_type?: string
          p_follow_up_at?: string
          p_follow_up_note?: string
          p_organization_id: string
          p_treatment_plan?: string
        }
        Returns: string
      }
      complete_clinical_consultation: {
        Args: {
          p_appointment_id: string
          p_clinical_note?: string
          p_diagnosis?: string
          p_encounter_type?: string
          p_follow_up_at?: string
          p_organization_id: string
          p_treatment_plan?: string
        }
        Returns: Json
      }
      complete_deposit_acceptance_dispatch: {
        Args: {
          p_evidence_reference: string
          p_failure_summary?: string
          p_lease_token: string
          p_passed: boolean
          p_run_id: string
        }
        Returns: {
          checkout_url: string | null
          completed_at: string | null
          created_at: string
          dispatch_message_id: string | null
          evidence_reference: string | null
          expires_at: string | null
          failure_summary: string | null
          id: string
          lease_token: string | null
          max_messages: number
          message_count: number
          organization_id: string
          recipient_hash: string | null
          recipient_last4: string | null
          scenario_key: string
          started_at: string | null
          status: string
          subject_acceptance_payment_id: string | null
          subject_payment_id: string | null
          synthetic_label: string
          updated_at: string
          verified_message_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "whatsapp_acceptance_test_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_managed_automation_run: {
        Args: {
          p_failure_code?: string
          p_failure_summary?: string
          p_observed_message_id?: string
          p_retryable?: boolean
          p_run_id: string
          p_succeeded: boolean
        }
        Returns: {
          attempt_count: number
          completed_at: string | null
          created_at: string
          delivery_status: string | null
          failure_code: string | null
          failure_summary: string | null
          id: string
          idempotency_key: string
          max_attempts: number
          next_attempt_at: string | null
          observed_message_id: string | null
          organization_id: string
          provider_execution_id: string | null
          safe_context: Json
          source_id: string | null
          source_type: string | null
          started_at: string | null
          status: string
          trigger_key: string
          updated_at: string
          workflow_id: string
        }
        SetofOptions: {
          from: "*"
          to: "automation_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_whatsapp_booking_handoff: {
        Args: {
          p_booking_reference: string
          p_handoff_token: string
          p_manage_token: string
        }
        Returns: boolean
      }
      complete_workspace_onboarding:
        | {
            Args: {
              p_business_category: string
              p_business_name: string
              p_location_count?: number
              p_timezone?: string
            }
            Returns: string
          }
        | {
            Args: {
              p_business_category: string
              p_business_name: string
              p_clinic_mode?: string
              p_location_count?: number
              p_primary_provider_name?: string
              p_timezone?: string
            }
            Returns: string
          }
      confirm_public_payment: {
        Args: {
          p_booking_reference: string
          p_manage_token: string
          p_provider_order_id: string
          p_provider_payment_id: string
        }
        Returns: Json
      }
      consume_api_rate_limit: {
        Args: { p_bucket: string; p_limit: number; p_window_seconds: number }
        Returns: boolean
      }
      consume_booking_phone_verification: {
        Args: {
          p_booking_reference: string
          p_challenge_id: string
          p_manage_token: string
          p_verification_token: string
        }
        Returns: boolean
      }
      consume_durable_rate_limit: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number }
        Returns: boolean
      }
      consume_oauth_nonce: {
        Args: { p_nonce: string; p_org_id: string; p_user_id: string }
        Returns: boolean
      }
      consume_public_server_rate_limit: {
        Args: {
          p_bucket: string
          p_client_signal: string
          p_limit: number
          p_scope: string
          p_window_seconds: number
        }
        Returns: undefined
      }
      consume_voice_request_nonce: {
        Args: { p_expires_at: string; p_org_id: string; p_request_id: string }
        Returns: boolean
      }
      contact_address_update_rules: {
        Args: {
          p_address: string
          p_extra: Json
          p_organization_id: string
          p_service: Database["public"]["Enums"]["service"]
          p_status: string
        }
        Returns: boolean
      }
      control_automation_run: {
        Args: { p_action: string; p_organization_id: string; p_run_id: string }
        Returns: {
          attempt_count: number
          completed_at: string | null
          created_at: string
          delivery_status: string | null
          failure_code: string | null
          failure_summary: string | null
          id: string
          idempotency_key: string
          max_attempts: number
          next_attempt_at: string | null
          observed_message_id: string | null
          organization_id: string
          provider_execution_id: string | null
          safe_context: Json
          source_id: string | null
          source_type: string | null
          started_at: string | null
          status: string
          trigger_key: string
          updated_at: string
          workflow_id: string
        }
        SetofOptions: {
          from: "*"
          to: "automation_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_appointment: {
        Args: {
          p_customer_email: string
          p_customer_name: string
          p_customer_phone: string
          p_location_id: string
          p_notes?: string
          p_organization_id: string
          p_resource_id: string
          p_service_id: string
          p_starts_at: string
        }
        Returns: string
      }
      create_booking_phone_otp_challenge: {
        Args: { p_phone: string; p_slug: string }
        Returns: Json
      }
      create_patient_data_request_from_portal: {
        Args: { p_request_type: string; p_summary: string; p_token: string }
        Returns: Json
      }
      create_patient_portal_session: {
        Args: {
          p_conversation_id?: string
          p_organization_id: string
          p_phone: string
          p_scope?: string
        }
        Returns: Json
      }
      create_public_appointment: {
        Args: {
          p_customer_email: string
          p_customer_name: string
          p_customer_phone: string
          p_location_id: string
          p_notes?: string
          p_resource_id: string
          p_service_id: string
          p_slug: string
          p_starts_at: string
        }
        Returns: Json
      }
      create_public_appointment_v2: {
        Args: {
          p_customer_email: string
          p_customer_name: string
          p_customer_phone: string
          p_intake?: Json
          p_location_id: string
          p_notes?: string
          p_resource_id: string
          p_service_id: string
          p_slug: string
          p_starts_at: string
        }
        Returns: Json
      }
      create_public_payment_intent: {
        Args: {
          p_customer_email: string
          p_customer_name: string
          p_customer_phone: string
          p_location_id: string
          p_notes?: string
          p_resource_id: string
          p_service_id: string
          p_slug: string
          p_starts_at: string
        }
        Returns: Json
      }
      create_public_payment_intent_v2: {
        Args: {
          p_customer_email: string
          p_customer_name: string
          p_customer_phone: string
          p_intake?: Json
          p_location_id: string
          p_notes?: string
          p_resource_id: string
          p_service_id: string
          p_slug: string
          p_starts_at: string
        }
        Returns: Json
      }
      create_public_payment_intent_v3: {
        Args: {
          p_customer_email: string
          p_customer_name: string
          p_customer_phone: string
          p_intake?: Json
          p_location_id: string
          p_notes?: string
          p_resource_id: string
          p_selected_payment_mode: string
          p_service_id: string
          p_slug: string
          p_starts_at: string
        }
        Returns: Json
      }
      create_schedule_exception: {
        Args: {
          p_ends_at: string
          p_exception_type: string
          p_location_id: string
          p_organization_id: string
          p_reason: string
          p_resource_id: string
          p_starts_at: string
        }
        Returns: Json
      }
      create_shadow_evaluation_run: {
        Args: {
          p_model_name: string
          p_provider: string
          p_tenant_id: string
          p_test_set_version: string
        }
        Returns: string
      }
      create_whatsapp_booking_handoff: {
        Args: {
          p_consent_evidence_id: string
          p_context: Json
          p_conversation_id: string
          p_organization_id: string
          p_session_id: string
          p_source_message_id: string
        }
        Returns: Json
      }
      create_whatsapp_handoff_appointment: {
        Args: {
          p_booking_contact_name: string
          p_booking_contact_phone: string
          p_customer_email: string
          p_customer_name: string
          p_customer_phone: string
          p_handoff_token: string
          p_intake?: Json
          p_location_id: string
          p_notes?: string
          p_patient_date_of_birth?: string
          p_patient_relationship: string
          p_resource_id: string
          p_service_id: string
          p_slug: string
          p_starts_at: string
        }
        Returns: Json
      }
      create_whatsapp_handoff_payment_intent: {
        Args: {
          p_booking_contact_name: string
          p_booking_contact_phone: string
          p_customer_email: string
          p_customer_name: string
          p_customer_phone: string
          p_handoff_token: string
          p_intake?: Json
          p_location_id: string
          p_notes?: string
          p_patient_date_of_birth?: string
          p_patient_relationship: string
          p_resource_id: string
          p_selected_payment_mode: string
          p_service_id: string
          p_slug: string
          p_starts_at: string
        }
        Returns: Json
      }
      decide_whatsapp_booking_request: {
        Args: {
          p_decision: string
          p_note?: string
          p_organization_id: string
          p_request_id: string
        }
        Returns: Json
      }
      deploy_due_clinic_actions: {
        Args: { p_organization_id: string }
        Returns: Json
      }
      disable_managed_booking_canary: {
        Args: { p_organization_id: string; p_workflow_id: string }
        Returns: {
          configuration: Json
          created_at: string
          created_by: string | null
          execution_provider: string
          external_workflow_id: string | null
          id: string
          last_failure_at: string | null
          last_run_at: string | null
          last_success_at: string | null
          max_attempts: number
          name: string
          organization_id: string
          status: string
          timeout_seconds: number
          trigger_key: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "automation_workflows"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      enable_managed_booking_canary: {
        Args: { p_organization_id: string; p_workflow_id: string }
        Returns: {
          configuration: Json
          created_at: string
          created_by: string | null
          execution_provider: string
          external_workflow_id: string | null
          id: string
          last_failure_at: string | null
          last_run_at: string | null
          last_success_at: string | null
          max_attempts: number
          name: string
          organization_id: string
          status: string
          timeout_seconds: number
          trigger_key: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "automation_workflows"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      exchange_patient_portal_link: { Args: { p_token: string }; Returns: Json }
      get_arin_learning_dashboard: {
        Args: { p_organization_id: string }
        Returns: Json
      }
      get_authorized_orgs: {
        Args: { role?: Database["public"]["Enums"]["role"] }
        Returns: string[]
      }
      get_automation_rollout_readiness: {
        Args: { p_organization_id: string }
        Returns: {
          failure_count: number
          observation_count: number
          ready: boolean
          required_observations: number
          review_status: string
          trigger_key: string
          workflow_id: string
        }[]
      }
      get_customer_booking: {
        Args: { p_booking_reference: string; p_manage_token: string }
        Returns: Json
      }
      get_existing_booking_confirmation: {
        Args: { p_appointment_id: string; p_organization_id: string }
        Returns: {
          message_id: string
          outcome: string
        }[]
      }
      get_multi_doctor_booking_acceptance: {
        Args: { p_organization_id: string }
        Returns: {
          check_key: string
          evidence_summary: string
          status: string
        }[]
      }
      get_oem_tenant_health: {
        Args: never
        Returns: {
          appointment_count_30d: number
          business_category: string
          channel_attention_count: number
          conversation_count_30d: number
          entitlement_status: string
          failed_delivery_count_7d: number
          last_activity_at: string
          live_channel_count: number
          location_count: number
          organization_id: string
          organization_name: string
          plan_id: string
          seat_count: number
          trial_ends_at: string
        }[]
      }
      get_patient_data_requests_from_portal: {
        Args: { p_token: string }
        Returns: Json
      }
      get_patient_portal: { Args: { p_token: string }; Returns: Json }
      get_public_booking_page: { Args: { p_slug: string }; Returns: Json }
      get_public_booking_slots: {
        Args: {
          p_date: string
          p_location_id: string
          p_resource_id: string
          p_service_id: string
          p_slug: string
        }
        Returns: Json
      }
      get_public_site_url: { Args: never; Returns: string }
      get_whatsapp_booking_acceptance: {
        Args: { p_organization_id: string }
        Returns: {
          check_key: string
          evidence_kind: string
          evidence_summary: string
          status: string
          tested_at: string
        }[]
      }
      get_whatsapp_booking_handoff: { Args: { p_token: string }; Returns: Json }
      has_permission: {
        Args: { _org_id: string; _permission: string; _user_id: string }
        Returns: boolean
      }
      import_doctor_roster: {
        Args: {
          p_commit?: boolean
          p_organization_id: string
          p_rows: Json
          p_source_format?: string
        }
        Returns: Json
      }
      import_doctor_roster_v2: {
        Args: {
          p_commit?: boolean
          p_organization_id: string
          p_rows: Json
          p_source_format?: string
        }
        Returns: Json
      }
      init_data: {
        Args: {
          p_limit?: number
          p_organization_id: string
          p_per_conversation?: number
          p_since?: string
          p_until?: string
        }
        Returns: Json
      }
      is_oem_operator: { Args: never; Returns: boolean }
      issue_clinical_prescription: {
        Args: {
          p_advice?: string
          p_appointment_id?: string
          p_diagnosis?: string
          p_encounter_id?: string
          p_follow_up_at?: string
          p_medicines?: Json
          p_organization_id: string
          p_patient_id: string
          p_tests_requested?: string
        }
        Returns: Json
      }
      link_whatsapp_booking_consent: {
        Args: { p_appointment_id: string; p_consent_evidence_id: string }
        Returns: boolean
      }
      manage_whatsapp_appointment: {
        Args: {
          p_action: string
          p_appointment_id: string
          p_contact_address: string
          p_conversation_id: string
          p_organization_id: string
          p_starts_at?: string
        }
        Returns: Json
      }
      match_documents: {
        Args: {
          match_count: number
          match_threshold: number
          p_organization_id: string
          query_embedding: string
        }
        Returns: {
          content: string
          document_id: string
          id: string
          similarity: number
        }[]
      }
      match_knowledge_chunks: {
        Args: {
          match_count: number
          match_threshold: number
          p_organization_id: string
          query_embedding: string
        }
        Returns: {
          content: string
          id: string
          similarity: number
        }[]
      }
      match_rag_knowledge_chunks: {
        Args: {
          match_count: number
          match_threshold: number
          p_organization_id: string
          query_embedding: string
        }
        Returns: {
          content: string
          document_id: string
          id: string
          similarity: number
          source_type: string
          title: string
          updated_at: string
        }[]
      }
      materialize_due_doctor_queue_dispatches: {
        Args: { p_now?: string }
        Returns: number
      }
      member_self_update_rules: {
        Args: {
          p_ai: boolean
          p_extra: Json
          p_id: string
          p_organization_id: string
          p_user_id: string
        }
        Returns: boolean
      }
      merge_update_jsonb: {
        Args: { object: Json; path: string[]; target: Json }
        Returns: Json
      }
      org_update_by_admin_rules: {
        Args: { p_id: string; p_name: string }
        Returns: boolean
      }
      patient_portal_cancel: {
        Args: { p_appointment_id: string; p_token: string }
        Returns: undefined
      }
      patient_portal_reschedule: {
        Args: { p_appointment_id: string; p_starts_at: string; p_token: string }
        Returns: undefined
      }
      prepare_abandoned_recovery_acceptance: {
        Args: { p_organization_id: string }
        Returns: {
          checkout_url: string | null
          completed_at: string | null
          created_at: string
          dispatch_message_id: string | null
          evidence_reference: string | null
          expires_at: string | null
          failure_summary: string | null
          id: string
          lease_token: string | null
          max_messages: number
          message_count: number
          organization_id: string
          recipient_hash: string | null
          recipient_last4: string | null
          scenario_key: string
          started_at: string | null
          status: string
          subject_acceptance_payment_id: string | null
          subject_payment_id: string | null
          synthetic_label: string
          updated_at: string
          verified_message_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "whatsapp_acceptance_test_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      prepare_deposit_acceptance_test: {
        Args: { p_organization_id: string }
        Returns: {
          checkout_url: string | null
          completed_at: string | null
          created_at: string
          dispatch_message_id: string | null
          evidence_reference: string | null
          expires_at: string | null
          failure_summary: string | null
          id: string
          lease_token: string | null
          max_messages: number
          message_count: number
          organization_id: string
          recipient_hash: string | null
          recipient_last4: string | null
          scenario_key: string
          started_at: string | null
          status: string
          subject_acceptance_payment_id: string | null
          subject_payment_id: string | null
          synthetic_label: string
          updated_at: string
          verified_message_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "whatsapp_acceptance_test_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      prepare_whatsapp_acceptance_scenario: {
        Args: { p_organization_id: string; p_scenario_key: string }
        Returns: {
          checkout_url: string | null
          completed_at: string | null
          created_at: string
          dispatch_message_id: string | null
          evidence_reference: string | null
          expires_at: string | null
          failure_summary: string | null
          id: string
          lease_token: string | null
          max_messages: number
          message_count: number
          organization_id: string
          recipient_hash: string | null
          recipient_last4: string | null
          scenario_key: string
          started_at: string | null
          status: string
          subject_acceptance_payment_id: string | null
          subject_payment_id: string | null
          synthetic_label: string
          updated_at: string
          verified_message_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "whatsapp_acceptance_test_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      purge_expired_voice_recordings: { Args: never; Returns: number }
      reassign_appointment_provider: {
        Args: {
          p_appointment_id: string
          p_organization_id: string
          p_resource_id: string
          p_starts_at: string
        }
        Returns: Json
      }
      record_arin_lead_outcome: {
        Args: {
          p_conversation_id: string
          p_handoff_id: string
          p_organization_id: string
          p_outcome: string
          p_outcome_reason?: string
        }
        Returns: string
      }
      record_shadow_provider_result: {
        Args: { p_provider_config_key: string; p_retryable_failure: boolean }
        Returns: undefined
      }
      record_webhook_event: {
        Args: {
          p_event_id: string
          p_organization_id: string
          p_provider: string
        }
        Returns: boolean
      }
      record_whatsapp_booking_consent: {
        Args: {
          p_action: string
          p_channel_identity: string
          p_conversation_id: string
          p_notice_text: string
          p_notice_version: string
          p_organization_id: string
          p_session_id: string
          p_source_message_id: string
        }
        Returns: string
      }
      record_whatsapp_identity_verification: {
        Args: {
          p_channel_identity: string
          p_conversation_id: string
          p_organization_id: string
          p_session_id: string
          p_source_message_id: string
        }
        Returns: string
      }
      recover_stale_managed_automation_runs: { Args: never; Returns: number }
      refresh_priority_action_alerts: {
        Args: { p_organization_id: string }
        Returns: number
      }
      reschedule_appointment: {
        Args: {
          p_appointment_id: string
          p_organization_id: string
          p_starts_at: string
        }
        Returns: undefined
      }
      reschedule_customer_booking: {
        Args: {
          p_booking_reference: string
          p_manage_token: string
          p_starts_at: string
        }
        Returns: undefined
      }
      respond_waitlist_offer: {
        Args: {
          p_action: string
          p_organization_id: string
          p_patient_phone: string
        }
        Returns: Json
      }
      restore_whatsapp_care_consent: {
        Args: {
          p_channel_identity: string
          p_conversation_id: string
          p_organization_id: string
          p_session_id: string
          p_source_message_id: string
        }
        Returns: Json
      }
      retry_failed_automation_job: {
        Args: {
          p_job_id: string
          p_job_kind: string
          p_organization_id: string
          p_reason: string
        }
        Returns: Json
      }
      revoke_patient_portal_session: {
        Args: { p_token: string }
        Returns: undefined
      }
      save_provider_chamber_schedule: {
        Args: {
          p_active: boolean
          p_booking_window_days: number
          p_effective_from: string
          p_effective_to: string
          p_location_id: string
          p_organization_id: string
          p_resource_id: string
          p_services: Json
          p_sessions: Json
        }
        Returns: string
      }
      schedule_doctor_queue_notification: {
        Args: {
          p_availability_rule_id: string
          p_organization_id: string
          p_shift_date: string
        }
        Returns: Json
      }
      search_active_medicines: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          display_name: string
          dose_form_name: string
          entry_type: string
          generic_name: string
          id: number
          route_names: string[]
          source_identifier: string
          supplier_name: string
        }[]
      }
      service_transition_carrier_recovery_task: {
        Args: {
          p_action: string
          p_actor_id: string
          p_expected_version: number
          p_organization_id: string
          p_reason?: string
          p_task_id: string
        }
        Returns: Json
      }
      set_appointment_follow_up: {
        Args: {
          p_appointment_id: string
          p_follow_up_at: string
          p_note?: string
          p_organization_id: string
        }
        Returns: undefined
      }
      set_doctor_queue_consent: {
        Args: {
          p_enabled: boolean
          p_organization_id: string
          p_resource_id: string
        }
        Returns: Json
      }
      set_patient_consents: {
        Args: {
          p_care_communications: boolean
          p_marketing: boolean
          p_note?: string
          p_patient_id: string
          p_source?: string
        }
        Returns: {
          age: number | null
          avatar_storage_path: string | null
          avatar_updated_at: string | null
          care_communications_consent: boolean
          created_at: string
          date_of_birth: string | null
          email: string | null
          first_seen_at: string
          full_name: string
          health_concern: string | null
          id: string
          identity_status: string
          last_seen_at: string
          locality: string | null
          marketing_consent: boolean
          normalized_phone: string | null
          organization_id: string
          patient_summary: string | null
          phone: string | null
          pincode: string | null
          primary_contact_phone: string | null
          source: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "patient_profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_queue_now_serving: {
        Args: {
          p_location_id: string
          p_organization_id: string
          p_queue_date: string
          p_resource_id: string
          p_token_number: number
        }
        Returns: Json
      }
      set_runtime_control: {
        Args: {
          p_actor_id?: string
          p_control_key: string
          p_expected_version?: number
          p_expires_at?: string
          p_is_emergency?: boolean
          p_is_enabled: boolean
          p_organization_id?: string
          p_reason?: string
          p_scope?: string
        }
        Returns: Json
      }
      track_conversation_usage: {
        Args: { p_contact_address: string; p_organization_id: string }
        Returns: Json
      }
      transition_carrier_recovery_task: {
        Args: {
          p_action: string
          p_actor_id?: string
          p_expected_version: number
          p_organization_id?: string
          p_reason?: string
          p_task_id: string
        }
        Returns: Json
      }
      update_appointment_status: {
        Args: {
          p_appointment_id: string
          p_organization_id: string
          p_status: string
        }
        Returns: undefined
      }
      verify_booking_phone_otp: {
        Args: { p_challenge_id: string; p_code: string }
        Returns: Json
      }
      write_shadow_audit_record: {
        Args: { p_record: Json }
        Returns: undefined
      }
    }
    Enums: {
      ai_patch_status: "pending" | "approved" | "rejected"
      ai_risk_level: "low" | "medium" | "high"
      direction: "incoming" | "outgoing" | "internal"
      log_level: "info" | "warning" | "error"
      role: "owner" | "admin" | "member"
      service:
        | "whatsapp"
        | "instagram"
        | "local"
        | "slack"
        | "discord"
        | "teams"
        | "whatsapp-web"
      webhook_operation: "insert" | "update"
      webhook_table:
        | "messages"
        | "conversations"
        | "organizations_addresses"
        | "contacts"
        | "contacts_addresses"
        | "logs"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      ai_patch_status: ["pending", "approved", "rejected"],
      ai_risk_level: ["low", "medium", "high"],
      direction: ["incoming", "outgoing", "internal"],
      log_level: ["info", "warning", "error"],
      role: ["owner", "admin", "member"],
      service: [
        "whatsapp",
        "instagram",
        "local",
        "slack",
        "discord",
        "teams",
        "whatsapp-web",
      ],
      webhook_operation: ["insert", "update"],
      webhook_table: [
        "messages",
        "conversations",
        "organizations_addresses",
        "contacts",
        "contacts_addresses",
        "logs",
      ],
    },
  },
} as const
