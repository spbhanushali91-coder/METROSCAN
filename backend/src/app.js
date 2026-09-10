const express = require('express');
const cors = require('cors');
const path = require('path');


const productsRouter = require('./routes/products');
const dashboardRouter = require('./routes/dashboard');
const authRoutes = require('./routes/auth');
const manufacturerRouter = require('./routes/manufacturer');

const app = express();

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.use('/api/auth', authRoutes);

app.use('/api', productsRouter);
app.use('/api', dashboardRouter);
app.use('/api', manufacturerRouter);
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

module.exports = app;
