import { createClient } from '@supabase/supabase-js'

export const supabaseUrl = 'https://rtmdvzavbatzjqaoltfd.supabase.co'
export const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0bWR2emF2YmF0empxYW9sdGZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NzAzNTUsImV4cCI6MjA4ODQ0NjM1NX0.2Gc47-TXKehGRurqLJHUhHKVNirhHc2D-0C6ByKMBoA'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Admin client (계정 생성 전용 — service_role)
export const supabaseAdmin = createClient(supabaseUrl,
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0bWR2emF2YmF0empxYW9sdGZkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjg3MDM1NSwiZXhwIjoyMDg4NDQ2MzU1fQ.69LqRgGFgI8FuVtggojVuyAABESNUyi-Fykeok2y1nA',
  { auth: { autoRefreshToken: false, persistSession: false } }
)
