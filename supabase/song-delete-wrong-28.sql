-- churchApp: delete the team song "TƠ LAH GÂP UĂNH TA SI TÂM RKĂNG" that is numbered 28.
-- It is hymn 24 under the wrong number, with the words of hymn 28 (PĂNG RÊH) pasted inside it.
-- The hymn book's 24 and both copies of 28 PĂNG RÊH stay. Deleting cannot be undone.
-- Run once in the Supabase SQL editor. It should return 1 row. Safe to run twice.

delete from public.lyric_songs
where id = 'b53fe161-5aea-4765-a20a-f5fd5629bf24'
  and song_number = '28'
  and title = 'TƠ LAH GÂP UĂNH TA SI TÂM RKĂNG'
  and local_id is null
returning id, song_number, title;
