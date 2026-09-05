import express from 'express';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import path from 'path';
import { grade } from './lib/prompt.mjs';
import { rewrite } from './lib/prompt.mjs';
import { validateGrade, validateRewrite } from './lib/validate.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a moment and try again.' },
});

const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Hourly limit reached. Try again in an hour.' },
});

app.use('/api/', globalLimiter);

app.post('/api/grade', aiLimiter, async (req, res) => {
  const err = validateGrade(req.body);
  if (err) return res.status(400).json({ error: err });
  try {
    const result = await grade(req.body);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Grading failed. Try again.' });
  }
});

app.post('/api/rewrite', aiLimiter, async (req, res) => {
  const err = validateRewrite(req.body);
  if (err) return res.status(400).json({ error: err });
  try {
    const result = await rewrite(req.body);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Rewrite failed. Try again.' });
  }
});

app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Outreach Grader running at http://localhost:${PORT}`);
});
