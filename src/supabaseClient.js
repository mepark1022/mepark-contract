import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://rtmdvzavbatzjqaoltfd.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0bWR2emF2YmF0empxYW9sdGZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NzAzNTUsImV4cCI6MjA4ODQ0NjM1NX0.2Gc47-TXKehGRurqLJHUhHKVNirhHc2D-0C6ByKMBoA'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
