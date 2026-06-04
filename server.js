const express = require('express');
const cors = require('cors');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const https = require('https');

const app = express();
app.use(cors());
app.use(express.json());

const YT_DLP_PATH = path.join(__dirname, 'yt-dlp');

// Download yt-dlp binary on startup if not present
async function ensureYtDlp() {
  if (fs.existsSync(YT_DLP_PATH)) return;
  console.log('Downloading yt-dlp...');
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(YT_DLP_PATH);
    https.get('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp', res => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        https.get(res.headers.location, res2 => {
          res2.pipe(file);
          file.on('finish', () => {
            file.close();
            fs.chmodSync(YT_DLP_PATH, '755');
            console.log('yt-dlp ready!');
            resolve();
          });
        }).on('error', reject);
      } else {
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          fs.chmodSync(YT_DLP_PATH, '755');
          console.log('yt-dlp ready!');
          resolve();
        });
      }
    }).on('error', reject);
  });
}

function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    execFile(YT_DLP_PATH, args, { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) return reject(stderr || err.message);
      resolve(stdout.trim());
    });
  });
}

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'yt1bet-api' });
});

// GET video info
app.post('/info', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });

  try {
    const output = await runYtDlp([
      '--dump-json',
      '--no-playlist',
      '--no-warnings',
      url
    ]);

    const data = JSON.parse(output);

    const formats = (data.formats || [])
      .filter(f => f.vcodec !== 'none' && f.acodec !== 'none' && f.ext === 'mp4')
      .map(f => ({ quality: f.height, format_id: f.format_id }))
      .filter((f, i, arr) => arr.findIndex(x => x.quality === f.quality) === i)
      .sort((a, b) => (b.quality || 0) - (a.quality || 0));

    return res.json({
      title: data.title,
      thumbnail: data.thumbnail,
      duration: data.duration,
      formats,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch video info' });
  }
});

// GET download URL
app.post('/download', async (req, res) => {
  const { url, quality, type } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });

  try {
    let formatArg;

    if (type === 'mp3') {
      // For audio, get best audio format URL
      const output = await runYtDlp([
        '--get-url',
        '--format', 'bestaudio[ext=m4a]/bestaudio',
        '--no-playlist',
        '--no-warnings',
        url
      ]);
      return res.json({ downloadUrl: output.split('\n')[0] });
    } else {
      const q = quality || '720';
      formatArg = `bestvideo[height<=${q}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${q}][ext=mp4]/best[height<=${q}]`;

      const output = await runYtDlp([
        '--get-url',
        '--format', formatArg,
        '--no-playlist',
        '--no-warnings',
        url
      ]);

      // yt-dlp may return 2 URLs (video + audio) - return first
      const urls = output.split('\n').filter(Boolean);
      return res.json({ downloadUrl: urls[0] });
    }
  } catch (err) {
    return res.status(500).json({ error: 'Failed to get download URL' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await ensureYtDlp();
});
