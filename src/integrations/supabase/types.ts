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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      available_colors: {
        Row: {
          created_at: string
          hex_value: string
          id: string
          is_active: boolean | null
          name: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string
          hex_value: string
          id?: string
          is_active?: boolean | null
          name: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string
          hex_value?: string
          id?: string
          is_active?: boolean | null
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      bank_details: {
        Row: {
          account_name: string
          account_number: string
          bank_name: string
          branch: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean | null
          updated_at: string
        }
        Insert: {
          account_name: string
          account_number: string
          bank_name: string
          branch?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          updated_at?: string
        }
        Update: {
          account_name?: string
          account_number?: string
          bank_name?: string
          branch?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          updated_at?: string
        }
        Relationships: []
      }
      coupons: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          current_uses: number | null
          discount_type: string
          discount_value: number
          id: string
          is_active: boolean | null
          is_public: boolean | null
          max_uses: number | null
          min_order_value: number | null
          uses_per_user: number | null
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          current_uses?: number | null
          discount_type: string
          discount_value: number
          id?: string
          is_active?: boolean | null
          is_public?: boolean | null
          max_uses?: number | null
          min_order_value?: number | null
          uses_per_user?: number | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          current_uses?: number | null
          discount_type?: string
          discount_value?: number
          id?: string
          is_active?: boolean | null
          is_public?: boolean | null
          max_uses?: number | null
          min_order_value?: number | null
          uses_per_user?: number | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: []
      }
      files: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string
          id: string
          is_payment_slip: boolean | null
          order_item_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number | null
          file_type: string
          id?: string
          is_payment_slip?: boolean | null
          order_item_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string
          id?: string
          is_payment_slip?: boolean | null
          order_item_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "files_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      gallery_posts: {
        Row: {
          created_at: string
          created_by: string | null
          customer_name: string
          description: string | null
          id: string
          image_path: string
          is_published: boolean | null
          order_id: string | null
          title: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_name: string
          description?: string | null
          id?: string
          image_path: string
          is_published?: boolean | null
          order_id?: string | null
          title?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_name?: string
          description?: string | null
          id?: string
          image_path?: string
          is_published?: boolean | null
          order_id?: string | null
          title?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gallery_posts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          id: string
          message: string
          order_id: string | null
          phone: string
          provider_response: string | null
          sent_at: string
          status: string | null
          user_id: string
        }
        Insert: {
          id?: string
          message: string
          order_id?: string | null
          phone: string
          provider_response?: string | null
          sent_at?: string
          status?: string | null
          user_id: string
        }
        Update: {
          id?: string
          message?: string
          order_id?: string | null
          phone?: string
          provider_response?: string | null
          sent_at?: string
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          color: string
          created_at: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          infill_percentage: number
          material: Database["public"]["Enums"]["print_material"]
          notes: string | null
          order_id: string
          price: number | null
          quality: Database["public"]["Enums"]["print_quality"]
          quantity: number
          weight_grams: number | null
        }
        Insert: {
          color?: string
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          infill_percentage?: number
          material?: Database["public"]["Enums"]["print_material"]
          notes?: string | null
          order_id: string
          price?: number | null
          quality?: Database["public"]["Enums"]["print_quality"]
          quantity?: number
          weight_grams?: number | null
        }
        Update: {
          color?: string
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          infill_percentage?: number
          material?: Database["public"]["Enums"]["print_material"]
          notes?: string | null
          order_id?: string
          price?: number | null
          quality?: Database["public"]["Enums"]["print_quality"]
          quantity?: number
          weight_grams?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          admin_discount_type: string
          admin_discount_value: number
          created_at: string
          delivery_charge: number | null
          id: string
          notes: string | null
          paid_at: string | null
          payment_rejection_reason: string | null
          priced_at: string | null
          rejection_reason: string | null
          status: Database["public"]["Enums"]["order_status"]
          total_price: number | null
          tracking_number: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_discount_type?: string
          admin_discount_value?: number
          created_at?: string
          delivery_charge?: number | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_rejection_reason?: string | null
          priced_at?: string | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          total_price?: number | null
          tracking_number?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_discount_type?: string
          admin_discount_value?: number
          created_at?: string
          delivery_charge?: number | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_rejection_reason?: string | null
          priced_at?: string | null
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          total_price?: number | null
          tracking_number?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      otp_sessions: {
        Row: {
          attempts: number | null
          created_at: string
          expires_at: string
          id: string
          otp_code: string
          phone: string
          verified: boolean | null
        }
        Insert: {
          attempts?: number | null
          created_at?: string
          expires_at: string
          id?: string
          otp_code: string
          phone: string
          verified?: boolean | null
        }
        Update: {
          attempts?: number | null
          created_at?: string
          expires_at?: string
          id?: string
          otp_code?: string
          phone?: string
          verified?: boolean | null
        }
        Relationships: []
      }
      payment_slips: {
        Row: {
          file_name: string
          file_path: string
          id: string
          order_id: string
          uploaded_at: string
          user_id: string
          verified: boolean | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          file_name: string
          file_path: string
          id?: string
          order_id: string
          uploaded_at?: string
          user_id: string
          verified?: boolean | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          file_name?: string
          file_path?: string
          id?: string
          order_id?: string
          uploaded_at?: string
          user_id?: string
          verified?: boolean | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_slips_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          name: string
          slug: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          name: string
          slug: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          name?: string
          slug?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          phone: string | null
          phone_verified: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          phone_verified?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          phone_verified?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          comment: string | null
          created_at: string
          gallery_post_id: string
          id: string
          rating: number
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          gallery_post_id: string
          id?: string
          rating: number
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          gallery_post_id?: string
          id?: string
          rating?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_gallery_post_id_fkey"
            columns: ["gallery_post_id"]
            isOneToOne: false
            referencedRelation: "gallery_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_cart_items: {
        Row: {
          created_at: string | null
          id: string
          product_id: string
          quantity: number
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          product_id: string
          quantity?: number
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          product_id?: string
          quantity?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "shop_products"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_order_items: {
        Row: {
          created_at: string | null
          id: string
          order_id: string
          price_at_purchase: number
          product_id: string
          product_name: string
          quantity: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          order_id: string
          price_at_purchase: number
          product_id: string
          product_name: string
          quantity: number
        }
        Update: {
          created_at?: string | null
          id?: string
          order_id?: string
          price_at_purchase?: number
          product_id?: string
          product_name?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "shop_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "shop_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "shop_products"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_orders: {
        Row: {
          created_at: string | null
          id: string
          notes: string | null
          paid_at: string | null
          phone: string
          shipping_address: string
          shipping_cost: number | null
          status: Database["public"]["Enums"]["shop_order_status"] | null
          subtotal: number
          total_price: number
          tracking_number: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          phone: string
          shipping_address: string
          shipping_cost?: number | null
          status?: Database["public"]["Enums"]["shop_order_status"] | null
          subtotal: number
          total_price: number
          tracking_number?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          phone?: string
          shipping_address?: string
          shipping_cost?: number | null
          status?: Database["public"]["Enums"]["shop_order_status"] | null
          subtotal?: number
          total_price?: number
          tracking_number?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      shop_payment_slips: {
        Row: {
          file_name: string
          file_path: string
          id: string
          order_id: string
          uploaded_at: string | null
          user_id: string
          verified: boolean | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          file_name: string
          file_path: string
          id?: string
          order_id: string
          uploaded_at?: string | null
          user_id: string
          verified?: boolean | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          file_name?: string
          file_path?: string
          id?: string
          order_id?: string
          uploaded_at?: string | null
          user_id?: string
          verified?: boolean | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shop_payment_slips_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "shop_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_product_images: {
        Row: {
          created_at: string | null
          id: string
          image_path: string
          product_id: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          image_path: string
          product_id: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          image_path?: string
          product_id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "shop_product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "shop_products"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_products: {
        Row: {
          category_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          main_image: string
          name: string
          price: number
          stock: number | null
          updated_at: string | null
        }
        Insert: {
          category_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          main_image: string
          name: string
          price: number
          stock?: number | null
          updated_at?: string | null
        }
        Update: {
          category_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          main_image?: string
          name?: string
          price?: number
          stock?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shop_products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_campaign_recipients: {
        Row: {
          campaign_id: string
          id: string
          phone: string
          provider_response: string | null
          sent_at: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          campaign_id: string
          id?: string
          phone: string
          provider_response?: string | null
          sent_at?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          campaign_id?: string
          id?: string
          phone?: string
          provider_response?: string | null
          sent_at?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "sms_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_campaigns: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          message: string
          name: string
          recipient_count: number | null
          recipient_filter: Json | null
          scheduled_at: string | null
          sent_at: string | null
          sent_count: number | null
          status: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          message: string
          name: string
          recipient_count?: number | null
          recipient_filter?: Json | null
          scheduled_at?: string | null
          sent_at?: string | null
          sent_count?: number | null
          status?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          message?: string
          name?: string
          recipient_count?: number | null
          recipient_filter?: Json | null
          scheduled_at?: string | null
          sent_at?: string | null
          sent_count?: number | null
          status?: string | null
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      user_coupons: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          coupon_id: string
          id: string
          is_used: boolean | null
          use_count: number | null
          used_at: string | null
          used_on_order_id: string | null
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          coupon_id: string
          id?: string
          is_used?: boolean | null
          use_count?: number | null
          used_at?: string | null
          used_on_order_id?: string | null
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          coupon_id?: string
          id?: string
          is_used?: boolean | null
          use_count?: number | null
          used_at?: string | null
          used_on_order_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_coupons_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_coupons_used_on_order_id_fkey"
            columns: ["used_on_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
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
          role?: Database["public"]["Enums"]["app_role"]
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
      filaments: {
        Row: {
          brand: string | null
          color: string
          cost: number
          created_at: string
          id: string
          is_over: boolean
          low_threshold: number
          material: string
          name: string
          weight_remaining: number
          weight_total: number
          supplier: string | null
          purchase_date: string
        }
        Insert: {
          brand?: string | null
          color: string
          cost?: number
          created_at?: string
          id?: string
          is_over?: boolean
          low_threshold?: number
          material: string
          name: string
          weight_remaining?: number
          weight_total?: number
          supplier?: string | null
          purchase_date?: string
        }
        Update: {
          brand?: string | null
          color?: string
          cost?: number
          created_at?: string
          id?: string
          is_over?: boolean
          low_threshold?: number
          material?: string
          name?: string
          weight_remaining?: number
          weight_total?: number
          supplier?: string | null
          purchase_date?: string
        }
        Relationships: []
      }
      printers: {
        Row: {
          created_at: string
          hourly_cost: number
          id: string
          monthly_premium: number
          name: string
          status: string
          terms_count: number
        }
        Insert: {
          created_at?: string
          hourly_cost?: number
          id?: string
          monthly_premium?: number
          name: string
          status?: string
          terms_count?: number
        }
        Update: {
          created_at?: string
          hourly_cost?: number
          id?: string
          monthly_premium?: number
          name?: string
          status?: string
          terms_count?: number
        }
        Relationships: []
      }
      filament_usages: {
        Row: {
          created_at: string
          filament_id: string | null
          id: string
          notes: string | null
          order_item_id: string | null
          print_hours: number
          printer_id: string | null
          weight_used: number
        }
        Insert: {
          created_at?: string
          filament_id?: string | null
          id?: string
          notes?: string | null
          order_item_id?: string | null
          print_hours?: number
          printer_id?: string | null
          weight_used: number
        }
        Update: {
          created_at?: string
          filament_id?: string | null
          id?: string
          notes?: string | null
          order_item_id?: string | null
          print_hours?: number
          printer_id?: string | null
          weight_used?: number
        }
        Relationships: [
          {
            foreignKeyName: "filament_usages_filament_id_fkey"
            columns: ["filament_id"]
            isOneToOne: false
            referencedRelation: "filaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filament_usages_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filament_usages_printer_id_fkey"
            columns: ["printer_id"]
            isOneToOne: false
            referencedRelation: "printers"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin_or_moderator: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      order_status:
        | "pending_review"
        | "priced_awaiting_payment"
        | "payment_submitted"
        | "payment_approved"
        | "in_production"
        | "ready_to_ship"
        | "shipped"
        | "completed"
        | "rejected"
        | "payment_rejected"
      print_material: "pla" | "petg" | "abs"
      print_quality: "draft" | "normal" | "high"
      shop_order_status:
        | "pending_payment"
        | "payment_submitted"
        | "payment_approved"
        | "processing"
        | "shipped"
        | "delivered"
        | "cancelled"
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
      app_role: ["admin", "moderator", "user"],
      order_status: [
        "pending_review",
        "priced_awaiting_payment",
        "payment_submitted",
        "payment_approved",
        "in_production",
        "ready_to_ship",
        "shipped",
        "completed",
        "rejected",
        "payment_rejected",
      ],
      print_material: ["pla", "petg", "abs"],
      print_quality: ["draft", "normal", "high"],
      shop_order_status: [
        "pending_payment",
        "payment_submitted",
        "payment_approved",
        "processing",
        "shipped",
        "delivered",
        "cancelled",
      ],
    },
  },
} as const
