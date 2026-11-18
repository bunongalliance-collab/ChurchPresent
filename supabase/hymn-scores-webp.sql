-- Nau Mpro scores: point each song at the smaller .webp copies of its score scans.
-- Run this AFTER app/scripts/convert-scores-webp.mjs has finished with no failures.
-- The PNG files stay in the bucket. To go back, run the same update with '.webp' and '.png' swapped.

update public.lyric_songs
set score_images = array(
  select regexp_replace(f, '\.png$', '.webp', 'i')
  from unnest(score_images) with ordinality as t(f, n)
  order by n
)
where exists (select 1 from unnest(score_images) f where f ~* '\.png$');
