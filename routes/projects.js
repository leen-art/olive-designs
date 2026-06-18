const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const db = require('../database/db');
const { requireRole } = require('../middleware/auth');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'olive-designs',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ quality: 'auto' }]
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

router.post('/projects', requireRole('customer'), (req, res) => {
  upload.fields([
    { name: 'room_photos', maxCount: 20 },
    { name: 'inspiration_photos', maxCount: 20 }
  ])(req, res, (uploadErr) => {
    if (uploadErr) console.log('Upload error (non-fatal):', uploadErr.message);
    try {
      const { room_type, dimensions, budget, feeling, color_preferences, items_to_keep, items_wanted, style_preferences } = req.body;
      if (!room_type) return res.status(400).json({ error: 'Room type is required.' });
      const result = db.prepare(`
        INSERT INTO projects (customer_id, room_type, dimensions, budget, feeling, color_preferences, items_to_keep, items_wanted, style_preferences)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(req.session.userId, room_type, dimensions, budget || null, feeling, color_preferences, items_to_keep, items_wanted, style_preferences);
      const projectId = result.lastInsertRowid;
      if (req.files && req.files['room_photos']) {
        req.files['room_photos'].forEach(file => {
          const url = file.secure_url || file.path || '';
          db.prepare('INSERT INTO project_images (project_id, image_path, image_type) VALUES (?, ?, ?)').run(projectId, url, 'room');
        });
      }
      if (req.files && req.files['inspiration_photos']) {
        req.files['inspiration_photos'].forEach(file => {
          const url = file.secure_url || file.path || '';
          db.prepare('INSERT INTO project_images (project_id, image_path, image_type) VALUES (?, ?, ?)').run(projectId, url, 'inspiration');
        });
      }
      res.json({ success: true, projectId });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error.' });
    }
  });
});

router.get('/projects', requireRole('customer'), (req, res) => {
  const projects = db.prepare(`
    SELECT p.*, u.full_name as designer_name
    FROM projects p
    LEFT JOIN users u ON p.designer_id = u.id
    WHERE p.customer_id = ?
    ORDER BY p.created_at DESC
  `).all(req.session.userId);
  res.json(projects);
});

router.get('/projects/:id', (req, res) => {
  const project = db.prepare(`
    SELECT p.*, u.full_name as designer_name, u.email as designer_email
    FROM projects p
    LEFT JOIN users u ON p.designer_id = u.id
    WHERE p.id = ? AND (p.customer_id = ? OR p.designer_id = ?)
  `).get(req.params.id, req.session.userId, req.session.userId);
  if (!project) return res.status(404).json({ error: 'Project not found.' });
  const images = db.prepare('SELECT * FROM project_images WHERE project_id = ?').all(project.id);
  const furniture = db.prepare('SELECT * FROM furniture_items WHERE project_id = ? ORDER BY created_at ASC').all(project.id);
  const messages = db.prepare(`
    SELECT m.*, u.full_name as sender_name, u.role as sender_role
    FROM messages m
    JOIN users u ON m.sender_id = u.id
    WHERE m.project_id = ?
    ORDER BY m.created_at ASC
  `).all(project.id);
  res.json({ project, images, furniture, messages });
});

router.get('/available-projects', requireRole('designer'), (req, res) => {
  try {
    const projects = db.prepare(`
      SELECT p.*, u.full_name as customer_name
      FROM projects p
      JOIN users u ON p.customer_id = u.id
      WHERE p.status = 'submitted' AND p.designer_id IS NULL
      ORDER BY p.created_at DESC
    `).all();
    const projectsWithImages = projects.map(p => {
      const images = db.prepare(`SELECT * FROM project_images WHERE project_id = ? AND image_type = 'room' LIMIT 1`).all(p.id);
      return { ...p, preview_image: images[0] ? images[0].image_path : null };
    });
    res.json(projectsWithImages);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/projects/:id/claim', requireRole('designer'), (req, res) => {
  try {
    const project = db.prepare(`SELECT * FROM projects WHERE id = ? AND status = 'submitted'`).get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not available.' });
    db.prepare('UPDATE projects SET designer_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.session.userId, 'assigned', req.params.id);
    db.prepare('INSERT INTO notifications (user_id, type, message, project_id) VALUES (?, ?, ?, ?)').run(project.customer_id, 'assigned', 'A designer has claimed your project!', project.id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/projects/:id/furniture', requireRole('designer'), (req, res) => {
  try {
    const { item_name, category, store_name, price, product_url, note } = req.body;
    if (!item_name) return res.status(400).json({ error: 'Item name is required.' });
    const result = db.prepare(`
      INSERT INTO furniture_items (project_id, item_name, category, store_name, price, product_url, note)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(req.params.id, item_name, category, store_name, price || null, product_url, note);
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.delete('/furniture/:id', requireRole('designer'), (req, res) => {
  try {
    db.prepare('DELETE FROM furniture_items WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/projects/:id/submit', requireRole('designer'), upload.single('concept_image'), (req, res) => {
  try {
    const { concept_description } = req.body;
    const concept_image_path = req.file ? (req.file.secure_url || req.file.path) : null;
    db.prepare(`UPDATE projects SET status = 'review', concept_description = ?, concept_image_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND designer_id = ?`).run(concept_description, concept_image_path, req.params.id, req.session.userId);
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    db.prepare('INSERT INTO notifications (user_id, type, message, project_id) VALUES (?, ?, ?, ?)').run(project.customer_id, 'review', 'Your design is ready for review!', project.id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/projects/:id/approve', requireRole('customer'), (req, res) => {
  try {
    const project = db.prepare('SELECT * FROM projects WHERE id = ? AND customer_id = ?').get(req.params.id, req.session.userId);
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    db.prepare(`UPDATE projects SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(req.params.id);
    db.prepare('INSERT INTO notifications (user_id, type, message, project_id) VALUES (?, ?, ?, ?)').run(project.designer_id, 'approved', 'Your design was approved!', project.id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/projects/:id/revision', requireRole('customer'), (req, res) => {
  try {
    const { feedback } = req.body;
    const project = db.prepare('SELECT * FROM projects WHERE id = ? AND customer_id = ?').get(req.params.id, req.session.userId);
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    if (project.revision_used) return res.status(400).json({ error: 'Revision already used.' });
    db.prepare(`UPDATE projects SET status = 'in_progress', revision_feedback = ?, revision_used = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(feedback, req.params.id);
    db.prepare('INSERT INTO notifications (user_id, type, message, project_id) VALUES (?, ?, ?, ?)').run(project.designer_id, 'revision', 'Customer requested a revision.', project.id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/projects/:id/messages', (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'Message cannot be empty.' });
    const project = db.prepare('SELECT * FROM projects WHERE id = ? AND (customer_id = ? OR designer_id = ?)').get(req.params.id, req.session.userId, req.session.userId);
    if (!project) return res.status(403).json({ error: 'Access denied.' });
    const result = db.prepare('INSERT INTO messages (project_id, sender_id, content) VALUES (?, ?, ?)').run(req.params.id, req.session.userId, content);
    const message = db.prepare('SELECT m.*, u.full_name as sender_name, u.role as sender_role FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.id = ?').get(result.lastInsertRowid);
    const notifyUserId = req.session.userId === project.customer_id ? project.designer_id : project.customer_id;
    if (notifyUserId) db.prepare('INSERT INTO notifications (user_id, type, message, project_id) VALUES (?, ?, ?, ?)').run(notifyUserId, 'message', 'New message on your project.', project.id);
    res.json({ success: true, message });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.get('/my-projects', requireRole('designer'), (req, res) => {
  try {
    const projects = db.prepare(`
      SELECT p.*, u.full_name as customer_name
      FROM projects p
      JOIN users u ON p.customer_id = u.id
      WHERE p.designer_id = ?
      ORDER BY p.updated_at DESC
    `).all(req.session.userId);
    res.json(projects);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/projects/:id/start', requireRole('designer'), (req, res) => {
  try {
    db.prepare(`UPDATE projects SET status = 'in_progress', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND designer_id = ?`).run(req.params.id, req.session.userId);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/projects/:id/review', requireRole('customer'), (req, res) => {
  try {
    const { rating, review_text } = req.body;
    const project = db.prepare(`SELECT * FROM projects WHERE id = ? AND customer_id = ? AND status = 'completed'`).get(req.params.id, req.session.userId);
    if (!project) return res.status(404).json({ error: 'Project not found or not completed.' });
    db.prepare('INSERT OR IGNORE INTO reviews (project_id, customer_id, designer_id, rating, review_text) VALUES (?, ?, ?, ?, ?)').run(project.id, req.session.userId, project.designer_id, rating, review_text);
    const avg = db.prepare('SELECT AVG(rating) as avg_rating, COUNT(*) as total FROM reviews WHERE designer_id = ?').get(project.designer_id);
    db.prepare('UPDATE designer_profiles SET rating = ?, completed_projects = ? WHERE user_id = ?').run(avg.avg_rating, avg.total, project.designer_id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.get('/designers', (req, res) => {
  try {
    const designers = db.prepare(`
      SELECT u.id, u.full_name, dp.bio, dp.style_specialties, dp.years_experience, dp.avatar_path, dp.rating, dp.completed_projects
      FROM users u
      JOIN designer_profiles dp ON u.id = dp.user_id
      WHERE u.role = 'designer'
      ORDER BY dp.rating DESC
    `).all();
    res.json(designers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.get('/notifications', (req, res) => {
  try {
    const notifications = db.prepare(`
      SELECT * FROM notifications
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `).all(req.session.userId);
    res.json(notifications);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
