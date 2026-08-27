const express = require('express');
const { pool } = require('../db');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM email_recipients ORDER BY email ASC');
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const email = (req.body && req.body.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'A valid email address is required' });

    const result = await pool.query('INSERT INTO email_recipients (email) VALUES ($1) RETURNING *', [email]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'That email is already on the list' });
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await pool.query('DELETE FROM email_recipients WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Recipient not found' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
