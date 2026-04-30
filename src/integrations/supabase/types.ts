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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agent_instances: {
        Row: {
          agent_name: string | null
          container_name: string | null
          created_at: string
          id: string
          last_health_check_at: string | null
          managed_bot_pending: boolean
          managed_bot_suggested_username: string | null
          model_config: Json
          onboarding_completed: boolean
          provisioned_at: string | null
          railway_service_id: string | null
          status: string
          telegram_bot_token_vault_id: string | null
          telegram_bot_username: string | null
          telegram_connected_at: string | null
          telegram_first_message_received_at: string | null
          telegram_onboarding_completed: boolean
          telegram_token_invalid: boolean
          telegram_user_chat_id: number | null
          telegram_webhook_configured: boolean
          telegram_webhook_secret: string | null
          updated_at: string
          user_id: string
          uuid_tenant: string
          vps_host: string | null
          vps_pool_id: string | null
          welcome_message_sent_at: string | null
        }
        Insert: {
          agent_name?: string | null
          container_name?: string | null
          created_at?: string
          id?: string
          last_health_check_at?: string | null
          managed_bot_pending?: boolean
          managed_bot_suggested_username?: string | null
          model_config?: Json
          onboarding_completed?: boolean
          provisioned_at?: string | null
          railway_service_id?: string | null
          status?: string
          telegram_bot_token_vault_id?: string | null
          telegram_bot_username?: string | null
          telegram_connected_at?: string | null
          telegram_first_message_received_at?: string | null
          telegram_onboarding_completed?: boolean
          telegram_token_invalid?: boolean
          telegram_user_chat_id?: number | null
          telegram_webhook_configured?: boolean
          telegram_webhook_secret?: string | null
          updated_at?: string
          user_id: string
          uuid_tenant?: string
          vps_host?: string | null
          vps_pool_id?: string | null
          welcome_message_sent_at?: string | null
        }
        Update: {
          agent_name?: string | null
          container_name?: string | null
          created_at?: string
          id?: string
          last_health_check_at?: string | null
          managed_bot_pending?: boolean
          managed_bot_suggested_username?: string | null
          model_config?: Json
          onboarding_completed?: boolean
          provisioned_at?: string | null
          railway_service_id?: string | null
          status?: string
          telegram_bot_token_vault_id?: string | null
          telegram_bot_username?: string | null
          telegram_connected_at?: string | null
          telegram_first_message_received_at?: string | null
          telegram_onboarding_completed?: boolean
          telegram_token_invalid?: boolean
          telegram_user_chat_id?: number | null
          telegram_webhook_configured?: boolean
          telegram_webhook_secret?: string | null
          updated_at?: string
          user_id?: string
          uuid_tenant?: string
          vps_host?: string | null
          vps_pool_id?: string | null
          welcome_message_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_instances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_instances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_integration_limits"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_instances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_jobs_limits"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_instances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_skill_limits"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "agent_instances_vps_pool_id_fkey"
            columns: ["vps_pool_id"]
            isOneToOne: false
            referencedRelation: "vps_pool"
            referencedColumns: ["id"]
          },
        ]
      }
      available_mcps: {
        Row: {
          available_in_plans: Json
          created_at: string
          description: string
          display_order: number
          icon_url: string
          id: string
          is_active: boolean
          name: string
          oauth_authorize_url: string
          oauth_revoke_url: string | null
          oauth_token_url: string
          provider: string
          required_scopes: Json
          slug: string
          supports_refresh_token: boolean
          updated_at: string
        }
        Insert: {
          available_in_plans?: Json
          created_at?: string
          description: string
          display_order?: number
          icon_url: string
          id?: string
          is_active?: boolean
          name: string
          oauth_authorize_url: string
          oauth_revoke_url?: string | null
          oauth_token_url: string
          provider: string
          required_scopes?: Json
          slug: string
          supports_refresh_token?: boolean
          updated_at?: string
        }
        Update: {
          available_in_plans?: Json
          created_at?: string
          description?: string
          display_order?: number
          icon_url?: string
          id?: string
          is_active?: boolean
          name?: string
          oauth_authorize_url?: string
          oauth_revoke_url?: string | null
          oauth_token_url?: string
          provider?: string
          required_scopes?: Json
          slug?: string
          supports_refresh_token?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      enterprise_leads: {
        Row: {
          company_name: string
          contact_name: string
          created_at: string
          email: string
          id: string
          message: string | null
          phone: string | null
          status: string
          team_size: string
        }
        Insert: {
          company_name: string
          contact_name: string
          created_at?: string
          email: string
          id?: string
          message?: string | null
          phone?: string | null
          status?: string
          team_size: string
        }
        Update: {
          company_name?: string
          contact_name?: string
          created_at?: string
          email?: string
          id?: string
          message?: string | null
          phone?: string | null
          status?: string
          team_size?: string
        }
        Relationships: []
      }
      oauth_state_tokens: {
        Row: {
          consumed: boolean
          created_at: string
          expires_at: string
          id: string
          mcp_id: string
          state_token: string
          user_id: string
        }
        Insert: {
          consumed?: boolean
          created_at?: string
          expires_at?: string
          id?: string
          mcp_id: string
          state_token: string
          user_id: string
        }
        Update: {
          consumed?: boolean
          created_at?: string
          expires_at?: string
          id?: string
          mcp_id?: string
          state_token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oauth_state_tokens_mcp_id_fkey"
            columns: ["mcp_id"]
            isOneToOne: false
            referencedRelation: "available_mcps"
            referencedColumns: ["id"]
          },
        ]
      }
      paddle_webhook_events: {
        Row: {
          environment: string
          event_type: string
          id: string
          paddle_event_id: string
          payload: Json | null
          processed_at: string
        }
        Insert: {
          environment: string
          event_type: string
          id?: string
          paddle_event_id: string
          payload?: Json | null
          processed_at?: string
        }
        Update: {
          environment?: string
          event_type?: string
          id?: string
          paddle_event_id?: string
          payload?: Json | null
          processed_at?: string
        }
        Relationships: []
      }
      plans: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          features: Json
          highlighted: boolean
          id: string
          is_enterprise: boolean
          name: string
          price_monthly_brl: number | null
          price_yearly_brl: number | null
          slug: string
          stripe_price_id_monthly: string | null
          stripe_price_id_yearly: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          features?: Json
          highlighted?: boolean
          id?: string
          is_enterprise?: boolean
          name: string
          price_monthly_brl?: number | null
          price_yearly_brl?: number | null
          slug: string
          stripe_price_id_monthly?: string | null
          stripe_price_id_yearly?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          features?: Json
          highlighted?: boolean
          id?: string
          is_enterprise?: boolean
          name?: string
          price_monthly_brl?: number | null
          price_yearly_brl?: number | null
          slug?: string
          stripe_price_id_monthly?: string | null
          stripe_price_id_yearly?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company_name: string | null
          cpf_cnpj: string | null
          created_at: string
          full_name: string
          id: string
          onboarding_completed: boolean
          paddle_customer_id: string | null
          phone: string | null
          stripe_customer_id: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          company_name?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          full_name?: string
          id: string
          onboarding_completed?: boolean
          paddle_customer_id?: string | null
          phone?: string | null
          stripe_customer_id?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          company_name?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          full_name?: string
          id?: string
          onboarding_completed?: boolean
          paddle_customer_id?: string | null
          phone?: string | null
          stripe_customer_id?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      provisioning_jobs: {
        Row: {
          agent_instance_id: string
          attempt: number
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          max_attempts: number
          next_retry_at: string | null
          payload: Json | null
          railway_service_id: string | null
          started_at: string | null
          status: string
          updated_at: string
          user_id: string
          vps_pool_id: string | null
        }
        Insert: {
          agent_instance_id: string
          attempt?: number
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          max_attempts?: number
          next_retry_at?: string | null
          payload?: Json | null
          railway_service_id?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
          vps_pool_id?: string | null
        }
        Update: {
          agent_instance_id?: string
          attempt?: number
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          max_attempts?: number
          next_retry_at?: string | null
          payload?: Json | null
          railway_service_id?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          vps_pool_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provisioning_jobs_agent_instance_id_fkey"
            columns: ["agent_instance_id"]
            isOneToOne: false
            referencedRelation: "agent_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provisioning_jobs_vps_pool_id_fkey"
            columns: ["vps_pool_id"]
            isOneToOne: false
            referencedRelation: "vps_pool"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_jobs: {
        Row: {
          action_prompt: string
          agent_instance_id: string
          auto_paused_reason: string | null
          created_at: string
          cron_expression: string
          description: string | null
          human_readable: string
          id: string
          last_run_at: string | null
          name: string
          natural_language_input: string
          next_run_at: string | null
          required_mcp_slugs: Json
          runtime_last_delivery_error: string | null
          runtime_last_error: string | null
          runtime_last_status: string | null
          runtime_state: string | null
          runtime_synced_at: string | null
          status: string
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          action_prompt: string
          agent_instance_id: string
          auto_paused_reason?: string | null
          created_at?: string
          cron_expression: string
          description?: string | null
          human_readable: string
          id?: string
          last_run_at?: string | null
          name: string
          natural_language_input: string
          next_run_at?: string | null
          required_mcp_slugs?: Json
          runtime_last_delivery_error?: string | null
          runtime_last_error?: string | null
          runtime_last_status?: string | null
          runtime_state?: string | null
          runtime_synced_at?: string | null
          status?: string
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          action_prompt?: string
          agent_instance_id?: string
          auto_paused_reason?: string | null
          created_at?: string
          cron_expression?: string
          description?: string | null
          human_readable?: string
          id?: string
          last_run_at?: string | null
          name?: string
          natural_language_input?: string
          next_run_at?: string | null
          required_mcp_slugs?: Json
          runtime_last_delivery_error?: string | null
          runtime_last_error?: string | null
          runtime_last_status?: string | null
          runtime_state?: string | null
          runtime_synced_at?: string | null
          status?: string
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_jobs_agent_instance_id_fkey"
            columns: ["agent_instance_id"]
            isOneToOne: false
            referencedRelation: "agent_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      skill_test_runs: {
        Row: {
          created_at: string
          duration_ms: number | null
          error_message: string | null
          id: string
          skill_version_id: string
          status: string
          test_input: string
          test_output: string | null
          test_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          skill_version_id: string
          status: string
          test_input: string
          test_output?: string | null
          test_type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          skill_version_id?: string
          status?: string
          test_input?: string
          test_output?: string | null
          test_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "skill_test_runs_skill_version_id_fkey"
            columns: ["skill_version_id"]
            isOneToOne: false
            referencedRelation: "skill_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "skill_test_runs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "skill_test_runs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_integration_limits"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "skill_test_runs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_jobs_limits"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "skill_test_runs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_skill_limits"
            referencedColumns: ["user_id"]
          },
        ]
      }
      skill_versions: {
        Row: {
          created_at: string
          created_by: string
          form_inputs: Json
          id: string
          is_live: boolean
          markdown_content: string
          skill_id: string
          version_number: number
        }
        Insert: {
          created_at?: string
          created_by: string
          form_inputs: Json
          id?: string
          is_live?: boolean
          markdown_content: string
          skill_id: string
          version_number: number
        }
        Update: {
          created_at?: string
          created_by?: string
          form_inputs?: Json
          id?: string
          is_live?: boolean
          markdown_content?: string
          skill_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "skill_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "skill_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_integration_limits"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "skill_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_jobs_limits"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "skill_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_skill_limits"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "skill_versions_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      skills: {
        Row: {
          agent_instance_id: string
          created_at: string
          current_version_id: string | null
          description: string
          id: string
          name: string
          status: string
          trigger_keywords: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_instance_id: string
          created_at?: string
          current_version_id?: string | null
          description: string
          id?: string
          name: string
          status?: string
          trigger_keywords: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_instance_id?: string
          created_at?: string
          current_version_id?: string | null
          description?: string
          id?: string
          name?: string
          status?: string
          trigger_keywords?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "skills_agent_instance_id_fkey"
            columns: ["agent_instance_id"]
            isOneToOne: false
            referencedRelation: "agent_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "skills_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "skills_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_integration_limits"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "skills_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_jobs_limits"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "skills_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_skill_limits"
            referencedColumns: ["user_id"]
          },
        ]
      }
      stripe_webhook_events: {
        Row: {
          event_type: string
          id: string
          payload: Json | null
          processed_at: string
          stripe_event_id: string
        }
        Insert: {
          event_type: string
          id?: string
          payload?: Json | null
          processed_at?: string
          stripe_event_id: string
        }
        Update: {
          event_type?: string
          id?: string
          payload?: Json | null
          processed_at?: string
          stripe_event_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          billing_cycle: string
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          environment: string
          id: string
          paddle_customer_id: string | null
          paddle_subscription_id: string | null
          plan_id: string | null
          price_id: string | null
          product_id: string | null
          status: string
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          billing_cycle: string
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          paddle_customer_id?: string | null
          paddle_subscription_id?: string | null
          plan_id?: string | null
          price_id?: string | null
          product_id?: string | null
          status: string
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          billing_cycle?: string
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          paddle_customer_id?: string | null
          paddle_subscription_id?: string | null
          plan_id?: string | null
          price_id?: string | null
          product_id?: string | null
          status?: string
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_integration_limits"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_jobs_limits"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_skill_limits"
            referencedColumns: ["user_id"]
          },
        ]
      }
      telegram_messages_log: {
        Row: {
          agent_instance_id: string
          created_at: string
          direction: string
          id: string
          is_first_message: boolean
          message_text: string | null
          message_type: string
          raw_payload: Json | null
          telegram_chat_id: number
          telegram_user_id: number | null
          telegram_username: string | null
          user_id: string
        }
        Insert: {
          agent_instance_id: string
          created_at?: string
          direction: string
          id?: string
          is_first_message?: boolean
          message_text?: string | null
          message_type?: string
          raw_payload?: Json | null
          telegram_chat_id: number
          telegram_user_id?: number | null
          telegram_username?: string | null
          user_id: string
        }
        Update: {
          agent_instance_id?: string
          created_at?: string
          direction?: string
          id?: string
          is_first_message?: boolean
          message_text?: string | null
          message_type?: string
          raw_payload?: Json | null
          telegram_chat_id?: number
          telegram_user_id?: number | null
          telegram_username?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_messages_log_agent_instance_id_fkey"
            columns: ["agent_instance_id"]
            isOneToOne: false
            referencedRelation: "agent_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_messages_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_messages_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_integration_limits"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "telegram_messages_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_jobs_limits"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "telegram_messages_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_skill_limits"
            referencedColumns: ["user_id"]
          },
        ]
      }
      telegram_rate_limit_bucket: {
        Row: {
          agent_instance_id: string
          request_count: number
          updated_at: string
          window_start: string
        }
        Insert: {
          agent_instance_id: string
          request_count?: number
          updated_at?: string
          window_start?: string
        }
        Update: {
          agent_instance_id?: string
          request_count?: number
          updated_at?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_rate_limit_bucket_agent_instance_id_fkey"
            columns: ["agent_instance_id"]
            isOneToOne: true
            referencedRelation: "agent_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      user_integrations: {
        Row: {
          access_token_vault_id: string | null
          connected_account_email: string | null
          connected_account_name: string | null
          created_at: string
          error_message: string | null
          granted_scopes: Json
          id: string
          last_refreshed_at: string | null
          mcp_id: string
          refresh_token_vault_id: string | null
          status: string
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_vault_id?: string | null
          connected_account_email?: string | null
          connected_account_name?: string | null
          created_at?: string
          error_message?: string | null
          granted_scopes?: Json
          id?: string
          last_refreshed_at?: string | null
          mcp_id: string
          refresh_token_vault_id?: string | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_vault_id?: string | null
          connected_account_email?: string | null
          connected_account_name?: string | null
          created_at?: string
          error_message?: string | null
          granted_scopes?: Json
          id?: string
          last_refreshed_at?: string | null
          mcp_id?: string
          refresh_token_vault_id?: string | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_integrations_mcp_id_fkey"
            columns: ["mcp_id"]
            isOneToOne: false
            referencedRelation: "available_mcps"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vps_pool: {
        Row: {
          capacity_current: number
          capacity_max: number
          created_at: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          railway_environment_id: string | null
          railway_project_id: string | null
          region: string
          updated_at: string
        }
        Insert: {
          capacity_current?: number
          capacity_max?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          railway_environment_id?: string | null
          railway_project_id?: string | null
          region?: string
          updated_at?: string
        }
        Update: {
          capacity_current?: number
          capacity_max?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          railway_environment_id?: string | null
          railway_project_id?: string | null
          region?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      user_integration_limits: {
        Row: {
          current_integrations_count: number | null
          max_integrations: number | null
          plan_slug: string | null
          user_id: string | null
        }
        Relationships: []
      }
      user_jobs_limits: {
        Row: {
          current_jobs_count: number | null
          max_jobs: number | null
          plan_slug: string | null
          user_id: string | null
        }
        Relationships: []
      }
      user_skill_limits: {
        Row: {
          current_skills_count: number | null
          max_skills: number | null
          plan_slug: string | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      has_active_subscription: {
        Args: { check_env?: string; user_uuid: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      vault_create_secret: {
        Args: {
          secret_description?: string
          secret_name: string
          secret_value: string
        }
        Returns: {
          secret_id: string
        }[]
      }
      vault_decrypt_secret: {
        Args: { secret_id: string }
        Returns: {
          decrypted_secret: string
        }[]
      }
      vault_delete_secret: { Args: { secret_id: string }; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "support" | "user"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["admin", "support", "user"],
    },
  },
} as const
