import { createClient } from '@supabase/supabase-js';

// Το Vite απαιτεί το πρόθεμα VITE_ για να αναγνωρίσει τις μεταβλητές
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;

// Έλεγχος αν οι μεταβλητές φορτώθηκαν (θα το δεις στο console αν λείπουν)
if (!supabaseUrl || !supabaseKey) {
    console.error("Σφάλμα: Οι μεταβλητές περιβάλλοντος δεν βρέθηκαν στο .env!");
}

// Δημιουργία του client και ανάθεση στο window για να είναι global
window.supabase = createClient(supabaseUrl, supabaseKey);