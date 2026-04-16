const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const env = require('./config/env');
const healthRoutes = require('./routes/healthRoutes');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const providerRoutes = require('./routes/providerRoutes');
const recordRoutes = require('./routes/recordRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || env.corsOrigin.length === 0 || env.corsOrigin.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`Origem não permitida por CORS: ${origin}`));
  }
}));
app.use(express.json({ limit: '10mb' }));

app.get('/', (_req, res) => {
  res.json({ ok: true, message: 'MedSenior backend online' });
});

app.use('/health', healthRoutes);
app.use('/auth', authRoutes);
app.use('/users', userRoutes);
app.use('/providers', providerRoutes);
app.use('/records', recordRoutes);
app.use('/dashboard', dashboardRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
