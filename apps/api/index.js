const express = require('express');
const cors = require('cors');
const multer = require('multer');
const morgan = require('morgan');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

// Multer in-memory storage to avoid disk I/O
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png'];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Only JPG and PNG images are allowed'));
  },
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'image-enhance-api', time: new Date().toISOString() });
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

async function processWithSharp(inputBuffer, options) {
  const {
    operation = 'auto',
    format = 'png',
    quality = 90,
    // advanced adjustments
    brightness, // 0..2 (1 no change)
    contrast, // 0..2 (1 no change)
    saturation, // 0..2 (1 no change)
    gamma, // 0.1..3
    resize, // { width, height, fit }
    crop, // { left, top, width, height }
    backgroundBlur, // radius number
  } = options || {};

  let image = sharp(inputBuffer, { failOn: 'none' });

  // Core operations
  if (operation === 'auto') {
    image = image
      .normalize() // balance levels
      .modulate({ saturation: 1.06, brightness: 1.04 })
      .gamma(0.95)
      .sharpen(1.2, 1, 1.5); // mild clarity
  } else if (operation === 'denoise') {
    image = image.median(3).blur(0.3).sharpen(0.8);
  } else if (operation === 'color') {
    image = image.normalize().modulate({ saturation: 1.08 }).gamma(1.0);
  } else if (operation === 'details') {
    image = image.sharpen(2, 1, 2);
  } else if (operation === 'portrait') {
    // Gentle skin smoothing + subtle clarity and warmth
    image = image
      .modulate({ saturation: 1.02, brightness: 1.06 })
      .gamma(0.9)
      .median(1)
      .sharpen(1.1, 1, 1.5);
  } else if (operation === 'upscale2x') {
    const meta = await image.metadata();
    const newWidth = meta.width ? Math.round(meta.width * 2) : undefined;
    const newHeight = meta.height ? Math.round(meta.height * 2) : undefined;
    image = image
      .resize({ width: newWidth, height: newHeight, kernel: sharp.kernel.lanczos3 })
      .sharpen(1.2, 1, 2);
  }

  // Advanced adjustments
  if (typeof brightness === 'number' || typeof saturation === 'number' || typeof gamma === 'number') {
    image = image.modulate({
      brightness: typeof brightness === 'number' ? clamp(brightness, 0, 2) : undefined,
      saturation: typeof saturation === 'number' ? clamp(saturation, 0, 2) : undefined,
    });
    if (typeof gamma === 'number') {
      image = image.gamma(clamp(gamma, 0.1, 3));
    }
  }

  if (typeof contrast === 'number') {
    // Approximate contrast using linear transform around mid-gray
    const c = clamp(contrast, 0, 2);
    const a = c; // slope
    const b = 128 * (1 - a); // intercept to keep midpoint
    image = image.linear(a, b);
  }

  if (resize && (resize.width || resize.height)) {
    image = image.resize({
      width: resize.width ? Math.round(resize.width) : undefined,
      height: resize.height ? Math.round(resize.height) : undefined,
      fit: resize.fit || 'cover',
      withoutEnlargement: true,
    });
  }

  if (crop && crop.width && crop.height) {
    image = image.extract({
      left: Math.max(0, Math.round(crop.left || 0)),
      top: Math.max(0, Math.round(crop.top || 0)),
      width: Math.round(crop.width),
      height: Math.round(crop.height),
    });
  }

  if (typeof backgroundBlur === 'number' && backgroundBlur > 0) {
    // Placeholder: global blur to simulate background blur without segmentation
    image = image.blur(clamp(backgroundBlur, 0.3, 20));
  }

  // Output
  if (format === 'jpeg' || format === 'jpg') {
    image = image.jpeg({ quality: clamp(quality, 50, 100), mozjpeg: true });
  } else {
    image = image.png({ quality: clamp(quality, 50, 100), compressionLevel: 9 });
  }

  return await image.toBuffer();
}

app.post('/api/enhance', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
    const { operation = 'auto', format = 'png' } = req.body || {};
    const out = await processWithSharp(req.file.buffer, { operation, format });
    const filename = `${uuidv4()}.${format === 'jpeg' ? 'jpg' : 'png'}`;
    res.setHeader('Content-Type', format === 'jpeg' ? 'image/jpeg' : 'image/png');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    return res.send(out);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Processing failed' });
  }
});

app.post('/api/adjust', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
    const params = req.body || {};

    // Parse numeric fields if they come as strings
    const parseNum = (v) => (v === undefined ? undefined : Number(v));

    const options = {
      operation: params.operation || 'auto',
      format: params.format || 'png',
      brightness: parseNum(params.brightness),
      contrast: parseNum(params.contrast),
      saturation: parseNum(params.saturation),
      gamma: parseNum(params.gamma),
      backgroundBlur: parseNum(params.backgroundBlur),
    };

    if (params.resizeWidth || params.resizeHeight) {
      options.resize = {
        width: parseNum(params.resizeWidth),
        height: parseNum(params.resizeHeight),
        fit: params.resizeFit || 'cover',
      };
    }

    if (params.cropLeft || params.cropTop || params.cropWidth || params.cropHeight) {
      options.crop = {
        left: parseNum(params.cropLeft) || 0,
        top: parseNum(params.cropTop) || 0,
        width: parseNum(params.cropWidth),
        height: parseNum(params.cropHeight),
      };
    }

    const out = await processWithSharp(req.file.buffer, options);
    const filename = `${uuidv4()}.${(options.format === 'jpeg' || options.format === 'jpg') ? 'jpg' : 'png'}`;
    res.setHeader('Content-Type', (options.format === 'jpeg' || options.format === 'jpg') ? 'image/jpeg' : 'image/png');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    return res.send(out);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Processing failed' });
  }
});

app.post('/api/batch/enhance', upload.array('images', 16), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No images uploaded' });
    const { operation = 'auto', format = 'png' } = req.body || {};

    const results = await Promise.all(
      req.files.map(async (file) => {
        const buffer = await processWithSharp(file.buffer, { operation, format });
        const base64 = buffer.toString('base64');
        const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
        return {
          id: uuidv4(),
          name: file.originalname,
          mime,
          dataUrl: `data:${mime};base64,${base64}`,
        };
      })
    );

    return res.json({ results });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Batch processing failed' });
  }
});

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File too large (max 20MB)' });
    return res.status(400).json({ error: err.message });
  }
  return res.status(400).json({ error: err.message || 'Unknown error' });
});

app.listen(PORT, () => {
  console.log(`Image Enhance API listening on http://localhost:${PORT}`);
});
