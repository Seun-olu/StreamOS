-- Demo catalogue. Every video is openly licensed or public domain; the licence,
-- attribution and source page are stored per asset and shown on the site.
-- Videos are streamed from the Internet Archive, not copied into this repo.
-- Runs as the table owner on an empty database (see src/server/db.ts).

insert into public.media_assets (id, label, video_url, duration_s, license, license_url, attribution, source_url) values
 ('a0000000-0000-4000-8000-000000000001', 'Sintel (2010)',
  'https://archive.org/download/Sintel/sintel-2048-stereo_512kb.mp4', 888.06,
  'CC BY 3.0', 'https://creativecommons.org/licenses/by/3.0/',
  '© copyright Blender Foundation | durian.blender.org', 'https://archive.org/details/Sintel'),
 ('a0000000-0000-4000-8000-000000000002', 'Big Buck Bunny (2008)',
  'https://archive.org/download/BigBuckBunnyFULLHD60FPS/Big%20Buck%20Bunny%20-%20FULL%20HD%2060FPS.mp4', 634.58,
  'CC BY 3.0', 'https://creativecommons.org/licenses/by/3.0/',
  '(c) copyright 2008, Blender Foundation | www.bigbuckbunny.org', 'https://archive.org/details/BigBuckBunnyFULLHD60FPS'),
 ('a0000000-0000-4000-8000-000000000003', 'Tears of Steel (2012)',
  'https://archive.org/download/tears-of-steel_202604/Tears%20of%20Steel.mp4', 734.22,
  'CC BY 3.0', 'https://creativecommons.org/licenses/by/3.0/',
  '(CC) Blender Foundation | mango.blender.org', 'https://archive.org/details/tears-of-steel_202604'),
 ('a0000000-0000-4000-8000-000000000004', 'Superman: The Mechanical Monsters (1941)',
  'https://archive.org/download/superman_the_mechanical_monsters/superman_the_mechanical_monsters_512kb.mp4', 614.88,
  'Public domain (US)', null, 'Fleischer Studios, 1941. US copyright not renewed.',
  'https://archive.org/details/superman_the_mechanical_monsters'),
 ('a0000000-0000-4000-8000-000000000005', 'Superman: Electric Earthquake (1942)',
  'https://archive.org/download/superman_electric_earthquake/superman_electric_earthquake_512kb.mp4', 522.62,
  'Public domain (US)', null, 'Fleischer Studios, 1942. US copyright not renewed.',
  'https://archive.org/details/superman_electric_earthquake'),
 ('a0000000-0000-4000-8000-000000000006', 'Superman: Eleventh Hour (1942)',
  'https://archive.org/download/superman_eleventh_hour/superman_eleventh_hour_512kb.mp4', 478.94,
  'Public domain (US)', null, 'Famous Studios, 1942. US copyright not renewed.',
  'https://archive.org/details/superman_eleventh_hour'),
 ('a0000000-0000-4000-8000-000000000007', 'StreamOS test pattern (20 s)',
  '/media/test-pattern.mp4', 20,
  'CC0 1.0', 'https://creativecommons.org/publicdomain/zero/1.0/',
  'Generated for StreamOS with ffmpeg testsrc2', '/media/test-pattern.mp4');

insert into public.titles (id, slug, kind, name, synopsis, year, genres, rating, accent, featured, asset_id) values
 ('b0000000-0000-4000-8000-000000000001', 'sintel', 'movie', 'Sintel',
  'A lonely young woman searches a hostile world for the baby dragon she once rescued and raised, and finds a truth she was not ready for.',
  2010, '{Fantasy,Animation,Adventure}', '12', '#b45309', true, 'a0000000-0000-4000-8000-000000000001'),
 ('b0000000-0000-4000-8000-000000000002', 'big-buck-bunny', 'movie', 'Big Buck Bunny',
  'A gentle giant of a rabbit has his peaceful day ruined by three bullying rodents, and decides it is time for some carefully planned payback.',
  2008, '{Comedy,Animation,Family}', 'U', '#15803d', false, 'a0000000-0000-4000-8000-000000000002'),
 ('b0000000-0000-4000-8000-000000000003', 'tears-of-steel', 'movie', 'Tears of Steel',
  'In a future Amsterdam overrun by robots, a group of scientists stage a last stand built on one old memory and one broken relationship.',
  2012, '{Sci-Fi,Action}', '12', '#0e7490', false, 'a0000000-0000-4000-8000-000000000003'),
 ('b0000000-0000-4000-8000-000000000004', 'superman-1941', 'series', 'Superman (1941)',
  'The Fleischer Studios theatrical shorts: lavish, art-deco animated adventures of the Man of Steel, now in the US public domain.',
  1941, '{Animation,Action,Classic}', 'U', '#b91c1c', false, null),
 ('b0000000-0000-4000-8000-000000000005', 'spring', 'movie', 'Spring',
  'A shepherd girl and her dog face ancient spirits to continue the cycle of life.',
  2019, '{Fantasy,Animation}', 'U', '#7c3aed', false, null);

insert into public.episodes (title_id, season, number, name, synopsis, asset_id) values
 ('b0000000-0000-4000-8000-000000000004', 1, 1, 'The Mechanical Monsters',
  'A mad inventor sends giant flying robots to loot the city''s banks and jewellery stores.', 'a0000000-0000-4000-8000-000000000004'),
 ('b0000000-0000-4000-8000-000000000004', 1, 2, 'Electric Earthquake',
  'A scientist demands Manhattan be handed over, or he will shake it into the sea.', 'a0000000-0000-4000-8000-000000000005'),
 ('b0000000-0000-4000-8000-000000000004', 1, 3, 'Eleventh Hour',
  'Held in wartime Japan, Clark Kent sabotages the enemy every night at eleven.', 'a0000000-0000-4000-8000-000000000006');

select private.do_publish(id, null) from public.titles where slug in ('sintel', 'big-buck-bunny', 'tears-of-steel', 'superman-1941');
