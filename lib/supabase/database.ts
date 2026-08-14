export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          user_id: string;
          name: string;
          email: string;
          provider: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          name?: string;
          email?: string;
          provider?: string;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          name?: string;
          email?: string;
          provider?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      watchlist: {
        Row: {
          id: string;
          user_id: string;
          slug: string;
          title: string;
          poster_path: string;
          release_date: string;
          quality: string;
          country: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          slug: string;
          title: string;
          poster_path?: string;
          release_date?: string;
          quality?: string;
          country?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          slug?: string;
          title?: string;
          poster_path?: string;
          release_date?: string;
          quality?: string;
          country?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      history: {
        Row: {
          id: string;
          user_id: string;
          slug: string;
          title: string;
          poster_path: string;
          release_date: string;
          quality: string;
          country: string;
          watched_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          slug: string;
          title: string;
          poster_path?: string;
          release_date?: string;
          quality?: string;
          country?: string;
          watched_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          slug?: string;
          title?: string;
          poster_path?: string;
          release_date?: string;
          quality?: string;
          country?: string;
          watched_at?: string;
        };
        Relationships: [];
      };
      progress: {
        Row: {
          user_id: string;
          slug: string;
          time: number;
          duration: number;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          slug: string;
          time: number;
          duration: number;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          slug?: string;
          time?: number;
          duration?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}