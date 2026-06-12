const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const db = require('../database/db');
const { requireRole } = require('../middleware/auth');

// Create payment intent when customer submits project
router.post('/create-payment-intent', requireRole('customer'), async (req, res) => {
  try {
    const { projectId } = req.body;
    const amount = parseInt(process.env.PRICE_PER_PROJECT) || 19900;

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      metadata: { projectId: String(projectId), userId: String(req.session.userId) }
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
      amount
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Payment error.' });
  }
});

// Confirm payment and mark project as paid
router.post('/confirm-payment', requireRole('customer'), async (req, res) => {
  try {
    const { paymentIntentId, projectId } = req.body;
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (intent.status === 'succeeded') {
      db.prepare('UPDATE projects SET paid = 1, payment_intent_id = ? WHERE id = ? AND customer_id = ?')
        .run(paymentIntentId, projectId, req.session.userId);
      res.json({ success: true });
    } else {
      res.status(400).json({ error: 'Payment not completed.' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Payment verification error.' });
  }
});

module.exports = router;