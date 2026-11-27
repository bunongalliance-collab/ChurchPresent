-- churchApp: rename 8 team songs to their hymn book title, so they count as the same song and the
-- hymn book's music sheet shows for them. Only titles change. Hymn 28 is left out (see the Notes page).
-- Run once in the Supabase SQL editor. Safe to run twice: a song renamed since is left alone.

update public.lyric_songs l
set title = v.new_title
from (values
  ('d5827e31-b240-4b35-b23b-618d2593e64a'::uuid, 'SÂM NJUŨN TRONG MA GÂP', 'SÂM NJŬN TRONG MA GÂP'),
  ('909a12a9-0531-4813-af6e-2eb396781e6b'::uuid, 'NTŬK YÊ-SU GŨ, TA NẼ BON UEH', 'NTŬK YÊ-SU GŬ, TA NĔ ƀON UEH'),
  ('1bff2b1f-4226-4d8b-aac4-25e7d2c68881'::uuid, 'GÂP HAO BA-BŎ', 'GÂP HAO ƀA-ƀƠ'),
  ('d267c6a6-aec9-46f3-8674-bccebd6e5ea3'::uuid, 'Ơ NƠM RKLAIH ƠI, LƠI BẮT GAO GÂP', 'Ơ NƠM RKLAIH ƠI, LƠI ƀÂT GAO GÂP'),
  ('69e5d274-cc5a-4d43-ba6b-de050fdd9a3e'::uuid, 'NUIH N’HÂM GÂP HÂK', 'NUIH N''HÂM GÂP HÂK'),
  ('2754a0bf-1087-4ba8-b1cf-c9ecfc1f9d40'::uuid, 'Ơ Ƀon Bêt-Lê-Hem', 'Ơ ƀON ƀÊT-LÊ-HEM'),
  ('5b4c4783-225f-4ea7-95e4-a3f4a6ef99fa'::uuid, 'Ƀa-Ƀơ Dôl Ăp Nar', 'ƀAƀƠ DÔL ĂP NAR'),
  ('ec1084ef-a457-467a-a9fb-768544f67aac'::uuid, 'Nar Kan-Dŏ Phung He Mra Saơ Hađăch', 'NAR KANDỠ PHUNG HE MRA SAƠ HAĐĂCH')
) as v(id, old_title, new_title)
where l.id = v.id and l.title = v.old_title
returning l.song_number, v.old_title, l.title as new_title;
