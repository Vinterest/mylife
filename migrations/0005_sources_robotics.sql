-- Nguồn bổ sung 09/11/2026: tin từ 10 công ty robot hàng đầu (kênh Robotics).
-- kind: rss = có RSS; sitemap = đọc sitemap của trang (keywords = phần đường dẫn);
-- html = đọc trang danh sách tin (keywords = phần đường dẫn của link bài).

INSERT OR IGNORE INTO sources (id, name, kind, url, channel, weight, keywords) VALUES
('sm-bd-news',      'Boston Dynamics · News',             'sitemap', 'https://bostondynamics.com/news-sitemap.xml',                                   'robotics', 16, '/news/'),
('sm-bd-blog',      'Boston Dynamics · Blog',             'sitemap', 'https://bostondynamics.com/blog-sitemap.xml',                                   'robotics', 12, '/blog/'),
('sm-figure',       'Figure AI · News',                   'sitemap', 'https://www.figure.ai/sitemap.xml',                                             'robotics', 16, '/news/'),
('sm-agility',      'Agility Robotics · News',            'sitemap', 'https://www.agilityrobotics.com/sitemap.xml',                                   'robotics', 14, '/content/'),
('html-1x',         '1X · Discover',                      'html',    'https://www.1x.tech/discover',                                                  'robotics', 14, '/discover/'),
('html-unitree',    'Unitree · News',                     'html',    'https://www.unitree.com/news',                                                  'robotics', 14, '/news/'),
('rss-sanctuary',   'Sanctuary AI · News',                'rss',     'https://www.sanctuary.ai/feed/',                                                'robotics', 12, ''),
('sm-pi',           'Physical Intelligence · Blog',       'sitemap', 'https://www.pi.website/sitemap.xml',                                            'robotics', 16, '/blog/'),
('html-ur',         'Universal Robots · News',            'html',    'https://www.universal-robots.com/news-and-media/news-center/',                  'robotics', 12, '/news-center/'),
('sm-fanuc',        'FANUC America · Press',              'sitemap', 'https://www.fanucamerica.com/sitemaps-1-section-pressReleases-1-sitemap.xml',   'robotics', 12, '/press-releases/'),
('rss-intuitive',   'Intuitive Surgical · News',          'rss',     'https://isrg.intuitive.com/rss/news-releases.xml',                              'robotics', 10, ''),
('rss-amazon-ops',  'Amazon · Robotics & Operations',     'rss',     'https://www.aboutamazon.com/news/operations/rss',                               'robotics', 10, 'robot,robots,robotics,proteus,sparrow,vulcan,automation,physical ai');
