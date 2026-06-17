const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const MOCK = {
  vision: 'This space has incredible potential for a warm modern Mediterranean transformation. Think terracotta tones, warm whites, linen textures, and rich wood accents. The result: a space that feels like a high-end boutique hotel mixed with a Tuscan villa.',
  style: 'Modern Mediterranean',
  colors: ['Warm White #F5F0E8', 'Terracotta #C4673A', 'Sage Green #8A9E85', 'Honey Oak #C49A3C'],
  products: [
    { name: 'Arch Rattan Full-Length Mirror', category: 'Mirrors', price: '$189', store: 'Wayfair', url: 'https://www.wayfair.com/keyword.php?keyword=arch+rattan+mirror', reason: 'Creates visual height and brings in natural texture' },
    { name: 'Linen Sheer Curtain Panels', category: 'Window Treatments', price: '$64', store: 'Amazon', url: 'https://www.amazon.com/s?k=linen+sheer+curtain+panels+ivory', reason: 'Softens the light and adds an effortless airy quality' },
    { name: 'Hand-Knotted Wool Area Rug', category: 'Rugs', price: '$349', store: 'Wayfair', url: 'https://www.wayfair.com/keyword.php?keyword=hand+knotted+wool+area+rug', reason: 'Anchors the room and introduces the warm color palette' },
    { name: 'Solid Mango Wood Coffee Table', category: 'Tables', price: '$299', store: 'IKEA', url: 'https://www.ikea.com/us/en/search/?q=wood+coffee+table', reason: 'Warm honey tones tie together the Mediterranean feel' },
    { name: 'Terracotta Ceramic Table Lamp', category: 'Lighting', price: '$78', store: 'Amazon', url: 'https://www.amazon.com/s?k=terracotta+ceramic+table+lamp', reason: 'Adds warmth and personality' },
    { name: 'Linen Throw Pillow Set', category: 'Accessories', price: '$54', store: 'Amazon', url: 'https://www.amazon.com/s?k=linen+throw+pillow+covers+sage', reason: 'Pulls the color story together instantly' }
  ]
};

router.get('/ai-flip', (req, res) => {
  res.sendFile('ai-flip.html', { root: './views' });
});

router.post('/api/ai-flip', upload.single('room_photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Please upload a photo.' });
    const imageUrl = 'data:' + req.file.mimetype + ';base64,' + req.file.buffer.toString('base64');
    res.json({ success: true, imageUrl, result: MOCK });
  } catch (err) {
    console.error('ERROR:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;