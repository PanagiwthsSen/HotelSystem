-- Drop the text overload of book_room_atomic so only the integer overload remains
-- Run this once in Supabase SQL editor
DROP FUNCTION IF EXISTS book_room_atomic(p_customer_id integer, p_check_in date, p_check_out date, p_total_cost numeric, p_status text, p_room_number text);
