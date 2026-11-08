-- Nguồn khởi đầu (đề xuất). Bật/tắt và thêm nguồn trong bảng này.
-- arXiv: url = danh sách chuyên mục, keywords = lọc theo tóm tắt (để trống = lấy cả chuyên mục).
-- RSS: keywords = chỉ giữ bài có từ khóa trong tiêu đề/mô tả (để trống = lấy hết).

INSERT OR IGNORE INTO sources (id, name, kind, url, channel, weight, keywords) VALUES
-- arXiv (trụ cột)
('arxiv-ai',       'arXiv · cs.AI, cs.LG, cs.CL',        'arxiv', 'cs.AI,cs.LG,cs.CL',                 'ai',       10, 'agent,agentic,reasoning,large language model,foundation model,multimodal'),
('arxiv-embodied', 'arXiv · cs.RO, cs.CV (Embodied)',    'arxiv', 'cs.RO,cs.CV,cs.AI',                 'embodied', 12, 'embodied,vision-language-action,humanoid,world model,manipulation'),
('arxiv-robotics', 'arXiv · cs.RO',                      'arxiv', 'cs.RO',                             'robotics', 10, ''),
('arxiv-tcnh',     'arXiv · q-fin + cs.AI (Ngân hàng)',  'arxiv', 'q-fin.CP,q-fin.RM,q-fin.ST,q-fin.GN,cs.AI', 'tcnh', 12, 'bank,banking,credit risk,fraud,customer,financial institution'),
-- AI thế giới
('rss-openai',     'OpenAI · News',                      'rss', 'https://openai.com/news/rss.xml',       'ai', 18, ''),
('rss-deepmind',   'Google DeepMind · Blog',             'rss', 'https://deepmind.google/blog/rss.xml',  'ai', 18, ''),
('rss-hf-blog',    'Hugging Face · Blog',                'rss', 'https://huggingface.co/blog/feed.xml',  'ai', 14, ''),
('yt-2minpapers',  'Two Minute Papers · YouTube',        'rss', 'https://www.youtube.com/feeds/videos.xml?channel_id=UCbfYPyITQ-7l4upoX8nvctg', 'ai', 8, ''),
-- Embodied AI
('rss-nvidia',     'NVIDIA Technical Blog · Robotics',   'rss', 'https://developer.nvidia.com/blog/feed', 'embodied', 12, 'robot,robotics,humanoid,embodied,isaac,physical ai'),
-- Robotics
('rss-ieee-robo',  'IEEE Spectrum · Robotics',           'rss', 'https://spectrum.ieee.org/feeds/topic/robotics.rss', 'robotics', 14, ''),
('rss-robotreport','The Robot Report',                   'rss', 'https://www.therobotreport.com/feed/',  'robotics', 12, ''),
-- Tài chính – Ngân hàng
('rss-finextra',   'Finextra',                           'rss', 'https://www.finextra.com/rss/headlines.aspx', 'tcnh', 14, 'ai,artificial intelligence,genai,generative,machine learning,llm,agent,chatbot,data'),
('rss-finbrand',   'The Financial Brand',                'rss', 'https://thefinancialbrand.com/feed/',   'tcnh', 12, 'ai,artificial intelligence,genai,generative,machine learning,llm,agent,data,personalization'),
('rss-vnx-sohoa',  'VnExpress · Số hóa',                 'rss', 'https://vnexpress.net/rss/so-hoa.rss',   'tcnh', 10, 'ngân hàng,trí tuệ nhân tạo,AI,fintech');
