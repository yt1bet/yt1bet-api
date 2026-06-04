const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const app = express();
app.use(cors());
app.use(express.json());

function run(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: 60000 }, (err, stdout, stderr) => {
      if (err) return reject(stderr || err.message);
      resolve(stdout.trim());
    });
  });
}

app.get('/', (req, res) => res.json({ status: 'ok' }));

app.post('/info', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });
  try {
    const out = await run(`yt-dlp --dump-json --no-playlist --no-warnings "${url}"`);
    const data = JSON.parse(out);
    res.json({ title: data.title, thumbnail: data.thumbnail });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch info' });
  }
});

app.post('/download', async (req, res) => {
  const { url, quality, type } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });
  try {
    let fmt;
    if (type === 'mp3') {
      fmt = 'bestaudio[ext=m4a]/bestaudio/best';
    } else {
      const q = quality || '720';
      fmt = `best[height<=${q}][ext=mp4]/best[height<=${q}]/best`;
    }
    const out = await run(`yt-dlp --get-url --format "${fmt}" --no-playlist --no-warnings "${url}"`);
    const downloadUrl = out.split('\n').filter(Boolean)[0];
    if (!downloadUrl) return res.status(400).json({ error: 'No URL found' });
    res.json({ downloadUrl });
  } catch (e) {
    res.status(500).json({ error: 'Download failed' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running on ${PORT}`));
