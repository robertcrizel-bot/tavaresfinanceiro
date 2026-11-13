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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          account_digit: string | null
          account_number: string | null
          agency: string | null
          bank: string
          color: string
          created_at: string
          holder_cpf: string | null
          holder_name: string | null
          id: string
          initial_balance: number
          name: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_digit?: string | null
          account_number?: string | null
          agency?: string | null
          bank: string
          color?: string
          created_at?: string
          holder_cpf?: string | null
          holder_name?: string | null
          id?: string
          initial_balance?: number
          name: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_digit?: string | null
          account_number?: string | null
          agency?: string | null
          bank?: string
          color?: string
          created_at?: string
          holder_cpf?: string | null
          holder_name?: string | null
          id?: string
          initial_balance?: number
          name?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      asaas_prod_contracts: {
        Row: {
          billing_anchor_day: number
          cancelled: boolean
          checkout_id: string | null
          checkout_url: string | null
          created_at: string
          creation_token: string
          customer_id: string | null
          expires_at: string | null
          id: string
          method: string
          plan_id: string
          provider_billing_type: string | null
          state: string
          subscription_id: string | null
          user_id: string
        }
        Insert: {
          billing_anchor_day?: number
          cancelled?: boolean
          checkout_id?: string | null
          checkout_url?: string | null
          created_at?: string
          creation_token?: string
          customer_id?: string | null
          expires_at?: string | null
          id?: string
          method: string
          plan_id?: string
          provider_billing_type?: string | null
          state?: string
          subscription_id?: string | null
          user_id: string
        }
        Update: {
          billing_anchor_day?: number
          cancelled?: boolean
          checkout_id?: string | null
          checkout_url?: string | null
          created_at?: string
          creation_token?: string
          customer_id?: string | null
          expires_at?: string | null
          id?: string
          method?: string
          plan_id?: string
          provider_billing_type?: string | null
          state?: string
          subscription_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asaas_prod_contracts_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "asaas_prod_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      asaas_prod_events: {
        Row: {
          attempts: number
          created_at: string
          error_code: string | null
          event_id: string
          event_type: string
          resource_id: string
          resource_kind: string
          state: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          error_code?: string | null
          event_id: string
          event_type: string
          resource_id: string
          resource_kind: string
          state?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          error_code?: string | null
          event_id?: string
          event_type?: string
          resource_id?: string
          resource_kind?: string
          state?: string
        }
        Relationships: []
      }
      asaas_prod_payments: {
        Row: {
          anchor_day: number
          contract_id: string
          payment_id: string
          period_end: string
          period_start: string
          status: string
          value_cents: number
        }
        Insert: {
          anchor_day: number
          contract_id: string
          payment_id: string
          period_end: string
          period_start: string
          status: string
          value_cents: number
        }
        Update: {
          anchor_day?: number
          contract_id?: string
          payment_id?: string
          period_end?: string
          period_start?: string
          status?: string
          value_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "asaas_prod_payments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "asaas_prod_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      asaas_prod_plans: {
        Row: {
          currency: string
          cycle: string
          id: string
          name: string
          price_cents: number
        }
        Insert: {
          currency: string
          cycle: string
          id: string
          name: string
          price_cents: number
        }
        Update: {
          currency?: string
          cycle?: string
          id?: string
          name?: string
          price_cents?: number
        }
        Relationships: []
      }
      asaas_prod_settings: {
        Row: {
          enabled: boolean
          singleton: boolean
          worker_token: string | null
          worker_until: string | null
        }
        Insert: {
          enabled?: boolean
          singleton?: boolean
          worker_token?: string | null
          worker_until?: string | null
        }
        Update: {
          enabled?: boolean
          singleton?: boolean
          worker_token?: string | null
          worker_until?: string | null
        }
        Relationships: []
      }
      asaas_prod_testers: {
        Row: {
          user_id: string
        }
        Insert: {
          user_id: string
        }
        Update: {
          user_id?: string
        }
        Relationships: []
      }
      beta_access_requests: {
        Row: {
          created_at: string
          id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      beta_access_switch: {
        Row: {
          enabled: boolean
          singleton: boolean
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          singleton?: boolean
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          singleton?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      beta_entitlements: {
        Row: {
          created_at: string
          expires_at: string
          payment_provider: string
          reference: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          payment_provider?: string
          reference?: string | null
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          payment_provider?: string
          reference?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      beta_notification_deliveries: {
        Row: {
          attempts: number
          channel: string
          claimed_at: string | null
          delivered_at: string | null
          last_error: string | null
          request_id: string
        }
        Insert: {
          attempts?: number
          channel: string
          claimed_at?: string | null
          delivered_at?: string | null
          last_error?: string | null
          request_id: string
        }
        Update: {
          attempts?: number
          channel?: string
          claimed_at?: string | null
          delivered_at?: string | null
          last_error?: string | null
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "beta_notification_deliveries_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "beta_access_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      beta_push_subscriptions: {
        Row: {
          auth_secret: string
          created_at: string
          endpoint: string
          p256dh: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auth_secret: string
          created_at?: string
          endpoint: string
          p256dh: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auth_secret?: string
          created_at?: string
          endpoint?: string
          p256dh?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      bill_payments: {
        Row: {
          created_at: string
          id: string
          paid_at: string
          recurring_bill_id: string
          reference_month: string
          transaction_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          paid_at?: string
          recurring_bill_id: string
          reference_month: string
          transaction_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          paid_at?: string
          recurring_bill_id?: string
          reference_month?: string
          transaction_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bill_payments_recurring_bill_id_fkey"
            columns: ["recurring_bill_id"]
            isOneToOne: false
            referencedRelation: "recurring_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_payments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          id: string
          monthly_budget: number | null
          name: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          monthly_budget?: number | null
          name: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          monthly_budget?: number | null
          name?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      credit_card_invoices: {
        Row: {
          actual_closed_at: string | null
          closed_at: string | null
          closed_total: number | null
          competence: string
          created_at: string
          credit_card_id: string
          cycle_end: string
          cycle_start: string
          due_date: string
          id: string
          obligation_transaction_id: string | null
          operation_version: number
          paid_at: string | null
          payment_account_id: string | null
          payment_transaction_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          actual_closed_at?: string | null
          closed_at?: string | null
          closed_total?: number | null
          competence: string
          created_at?: string
          credit_card_id: string
          cycle_end: string
          cycle_start: string
          due_date: string
          id?: string
          obligation_transaction_id?: string | null
          operation_version?: number
          paid_at?: string | null
          payment_account_id?: string | null
          payment_transaction_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          actual_closed_at?: string | null
          closed_at?: string | null
          closed_total?: number | null
          competence?: string
          created_at?: string
          credit_card_id?: string
          cycle_end?: string
          cycle_start?: string
          due_date?: string
          id?: string
          obligation_transaction_id?: string | null
          operation_version?: number
          paid_at?: string | null
          payment_account_id?: string | null
          payment_transaction_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_card_invoices_credit_card_id_fkey"
            columns: ["credit_card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_card_invoices_obligation_transaction_id_fkey"
            columns: ["obligation_transaction_id"]
            isOneToOne: true
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_card_invoices_payment_account_id_fkey"
            columns: ["payment_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_card_invoices_payment_transaction_id_fkey"
            columns: ["payment_transaction_id"]
            isOneToOne: true
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_cards: {
        Row: {
          bank: string
          card_brand: string | null
          card_last_four: string | null
          closing_day: number
          color: string
          created_at: string
          credit_limit: number
          due_day: number
          holder_name: string | null
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bank: string
          card_brand?: string | null
          card_last_four?: string | null
          closing_day?: number
          color?: string
          created_at?: string
          credit_limit?: number
          due_day?: number
          holder_name?: string | null
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bank?: string
          card_brand?: string | null
          card_last_four?: string | null
          closing_day?: number
          color?: string
          created_at?: string
          credit_limit?: number
          due_day?: number
          holder_name?: string | null
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      finvision_beta_email_queue: {
        Row: {
          http_id: number
          queued_at: string
          request_id: string
        }
        Insert: {
          http_id: number
          queued_at?: string
          request_id: string
        }
        Update: {
          http_id?: number
          queued_at?: string
          request_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      recurring_bills: {
        Row: {
          account_id: string | null
          amount: number
          category: string
          created_at: string
          description: string | null
          due_day: number
          duration_months: number | null
          id: string
          name: string
          scoped_edits: Json
          start_date: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          category: string
          created_at?: string
          description?: string | null
          due_day?: number
          duration_months?: number | null
          id?: string
          name: string
          scoped_edits?: Json
          start_date?: string
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          category?: string
          created_at?: string
          description?: string | null
          due_day?: number
          duration_months?: number | null
          id?: string
          name?: string
          scoped_edits?: Json
          start_date?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_bills_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          id: string
          mime_type: string | null
          size: number | null
          transaction_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          id?: string
          mime_type?: string | null
          size?: number | null
          transaction_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          id?: string
          mime_type?: string | null
          size?: number | null
          transaction_id?: string
          user_id?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          account_id: string | null
          amount: number
          category: string
          created_at: string
          credit_card_id: string | null
          credit_card_invoice_id: string | null
          date: string
          description: string | null
          financial_kind: string
          id: string
          installment_number: number | null
          installments: number | null
          is_paid: boolean
          parent_transaction_id: string | null
          payment_method: string | null
          receipt_details: Json | null
          receipt_ref: string | null
          title: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          category: string
          created_at?: string
          credit_card_id?: string | null
          credit_card_invoice_id?: string | null
          date?: string
          description?: string | null
          financial_kind?: string
          id?: string
          installment_number?: number | null
          installments?: number | null
          is_paid?: boolean
          parent_transaction_id?: string | null
          payment_method?: string | null
          receipt_details?: Json | null
          receipt_ref?: string | null
          title: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          category?: string
          created_at?: string
          credit_card_id?: string | null
          credit_card_invoice_id?: string | null
          date?: string
          description?: string | null
          financial_kind?: string
          id?: string
          installment_number?: number | null
          installments?: number | null
          is_paid?: boolean
          parent_transaction_id?: string | null
          payment_method?: string | null
          receipt_details?: Json | null
          receipt_ref?: string | null
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_credit_card_id_fkey"
            columns: ["credit_card_id"]
            isOneToOne: false
            referencedRelation: "credit_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_credit_card_invoice_id_fkey"
            columns: ["credit_card_invoice_id"]
            isOneToOne: false
            referencedRelation: "credit_card_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      transfers: {
        Row: {
          amount: number
          created_at: string
          date: string
          description: string | null
          from_account_id: string
          id: string
          to_account_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          date?: string
          description?: string | null
          from_account_id: string
          id?: string
          to_account_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          date?: string
          description?: string | null
          from_account_id?: string
          id?: string
          to_account_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      asaas_prod_apply: {
        Args: {
          p_contract: string
          p_event: string
          p_ignored?: boolean
          p_snapshot: Json
          p_token: string
        }
        Returns: undefined
      }
      asaas_prod_assert_user: { Args: { p_user: string }; Returns: undefined }
      asaas_prod_cancel: { Args: { p_user: string }; Returns: undefined }
      asaas_prod_claim: {
        Args: { p_method: string; p_user: string }
        Returns: Json
      }
      asaas_prod_creation_uncertain: {
        Args: { p_id: string; p_token: string }
        Returns: undefined
      }
      asaas_prod_enqueue: {
        Args: {
          p_id: string
          p_kind: string
          p_resource: string
          p_type: string
        }
        Returns: boolean
      }
      asaas_prod_period_end: {
        Args: { p_anchor: number; p_start: string }
        Returns: string
      }
      asaas_prod_progress: {
        Args: {
          p_checkout?: string
          p_customer: string
          p_id: string
          p_subscription?: string
          p_token: string
          p_url?: string
        }
        Returns: undefined
      }
      asaas_prod_project_access: {
        Args: { p_contract: string }
        Returns: undefined
      }
      asaas_prod_refresh: { Args: { p_token: string }; Returns: undefined }
      asaas_prod_worker_lease: {
        Args: { p_release?: boolean; p_token: string }
        Returns: boolean
      }
      beta_claim_notification: {
        Args: { p_channel: string; p_request: string }
        Returns: boolean
      }
      beta_has_access: { Args: never; Returns: boolean }
      close_credit_card_invoice:
        | { Args: { p_invoice_id: string }; Returns: string }
        | {
            Args: { p_actual_closed_date?: string; p_invoice_id: string }
            Returns: string
          }
        | {
            Args: {
              p_actual_closed_date?: string
              p_due_date?: string
              p_exclude_transaction_ids?: string[]
              p_invoice_id: string
            }
            Returns: string
          }
      close_credit_card_invoice_atomic: {
        Args: {
          p_actual_closed_date?: string
          p_due_date?: string
          p_exclude_transaction_ids?: string[]
          p_expected_version: number
          p_invoice_id: string
          p_operation_id: string
          p_restore_transaction_ids?: string[]
        }
        Returns: Json
      }
      convert_existing_card_purchase_to_installments: {
        Args: {
          p_amount: number
          p_category: string
          p_credit_card_id: string
          p_date: string
          p_description: string
          p_installments: number
          p_title: string
          p_transaction_id: string
        }
        Returns: undefined
      }
      credit_card_cycle_dates: {
        Args: {
          p_closing_day: number
          p_due_day: number
          p_reference_date: string
        }
        Returns: {
          competence: string
          cycle_end: string
          cycle_start: string
          due_date: string
        }[]
      }
      delete_category_with_replacement: {
        Args: { p_id: string; p_replacement_id?: string }
        Returns: undefined
      }
      ensure_credit_card_invoice: {
        Args: { p_credit_card_id: string; p_reference_date?: string }
        Returns: string
      }
      finvision_asaas_production_worker_tick: { Args: never; Returns: number }
      finvision_notify_beta: { Args: never; Returns: number }
      finvision_send_beta_email: {
        Args: { p_api_key: string; p_request_id: string }
        Returns: number
      }
      mark_forecast_payment: {
        Args: {
          p_bill_id: string
          p_operation_id: string
          p_overrides?: Json
          p_reference_month: string
        }
        Returns: Json
      }
      pay_credit_card_invoice: {
        Args: {
          p_account_id: string
          p_invoice_id: string
          p_payment_date?: string
          p_payment_method?: string
        }
        Returns: string
      }
      reopen_credit_card_invoice: {
        Args: { p_invoice_id: string }
        Returns: string
      }
      reverse_credit_card_invoice_payment: {
        Args: { p_invoice_id: string }
        Returns: string
      }
      unmark_forecast_payment: {
        Args: {
          p_bill_id: string
          p_operation_id: string
          p_payment_id: string
          p_reference_month: string
        }
        Returns: Json
      }
      update_category_with_references: {
        Args: {
          p_id: string
          p_monthly_budget?: number
          p_name: string
          p_type: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin"
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
      app_role: ["admin"],
    },
  },
} as const
