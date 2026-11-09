-- Nguồn bổ sung 09/11/2026: tin từ các công ty AI hàng đầu.
-- Anthropic, xAI, Meta AI không có RSS chính thức, nên dùng feed dựng lại từ trang tin gốc
-- (github.com/Olshansk/rss-feeds), link bài vẫn trỏ về trang gốc.
-- DeepSeek không có RSS: kind = sitemap, keywords = phần đường dẫn cần lấy.

INSERT OR IGNORE INTO sources (id, name, kind, url, channel, weight, keywords) VALUES
('rss-anthropic-news',     'Anthropic · News',                 'rss',     'https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_anthropic_news.xml',     'ai', 18, ''),
('rss-anthropic-research', 'Anthropic · Research',             'rss',     'https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_anthropic_research.xml', 'ai', 16, ''),
('sm-deepseek',            'DeepSeek · News',                  'sitemap', 'https://api-docs.deepseek.com/sitemap.xml',                                                  'ai', 18, '/news/news'),
('rss-meta-ai',            'Meta · AI at Meta Blog',           'rss',     'https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_meta_ai.xml',          'ai', 16, ''),
('rss-meta-eng',           'Meta · Engineering',               'rss',     'https://engineering.fb.com/feed/',                                                          'ai', 10, 'ai,ml,machine learning,llm,llama,model,gpu,inference,training,agent'),
('rss-ms-ai',              'Microsoft · Source AI',            'rss',     'https://news.microsoft.com/source/topics/ai/feed/',                                         'ai', 14, ''),
('rss-ms-research',        'Microsoft · Research Blog',        'rss',     'https://www.microsoft.com/en-us/research/feed/',                                            'ai', 12, 'ai,agent,agents,model,models,llm,language,learning,copilot,reasoning'),
('rss-oracle-ai',          'Oracle · AI & Data Science Blog',  'rss',     'https://blogs.oracle.com/ai-and-datascience/rss',                                           'ai', 10, ''),
('rss-xai',                'xAI · News',                       'rss',     'https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_xainews.xml',          'ai', 16, ''),
('rss-google-ai',          'Google · The Keyword AI',          'rss',     'https://blog.google/technology/ai/rss/',                                                    'ai', 18, ''),
('rss-google-research',    'Google · Research Blog',           'rss',     'https://research.google/blog/rss/',                                                         'ai', 14, '');
