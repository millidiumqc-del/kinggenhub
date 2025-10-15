const express = require('express');
const serverless = require('serverless-http');

const app = express();
const router = express.Router();

// On crée uniquement la route qui pose problème
router.get('/auth/callback', (req, res) => {
  // Si on arrive ici, le routage fonctionne.
  res.status(200).send('<h1>Test de la route callback réussi !</h1><p>Cela prouve que le problème vient d\'une dépendance (probablement la base de données).</p>');
});

app.use('/api/', router);

module.exports.handler = serverless(app);
