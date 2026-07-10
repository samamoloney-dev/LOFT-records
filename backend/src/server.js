require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const traineeRoutes = require('./routes/trainees');
const syllabusRoutes = require('./routes/syllabus');
const flightRoutes = require('./routes/flights');
const ctlRoutes = require('./routes/ctl');
const checkRoutes = require('./routes/checks');
const phase4Routes = require('./routes/phase4');
const groundSchoolRoutes = require('./routes/ground-school');
const crewRoutes = require('./routes/crew');
const landingAssessmentRoutes = require('./routes/landing-assessment');
const fstdPresetRoutes = require('./routes/fstd-presets');
const surveyRoutes = require('./routes/survey');
const competencyTypeRoutes = require('./routes/competency-types');
const checkFormItemRoutes = require('./routes/check-form-items');
const instructorCheckRoutes = require('./routes/instructor-checks');
const personnelCheckRoutes = require('./routes/personnel-checks');
const planningRoutes = require('./routes/planning');
const signatureRoutes = require('./routes/signatures');
const dashboardRoutes = require('./routes/dashboard');

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173', credentials: true }));
// Default 100kb is too small for the IPC licence-photo capture (a
// compressed base64 JPEG, see checks.js PATCH /:id/licence-photo).
app.use(express.json({ limit: '8mb' }));
app.use(cookieParser());

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/trainees', traineeRoutes);
app.use('/api/syllabus', syllabusRoutes);
app.use('/api/flights', flightRoutes);
app.use('/api/ctl', ctlRoutes);
app.use('/api/checks', checkRoutes);
app.use('/api/phase4', phase4Routes);
app.use('/api/ground-school', groundSchoolRoutes);
app.use('/api/crew', crewRoutes);
app.use('/api/landing-assessment', landingAssessmentRoutes);
app.use('/api/fstd-presets', fstdPresetRoutes);
app.use('/api/survey', surveyRoutes);
app.use('/api/competency-types', competencyTypeRoutes);
app.use('/api/check-form-items', checkFormItemRoutes);
app.use('/api/instructor-checks', instructorCheckRoutes);
app.use('/api/personnel-checks', personnelCheckRoutes);
app.use('/api/planning', planningRoutes);
app.use('/api/signatures', signatureRoutes);
app.use('/api/dashboard', dashboardRoutes);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`LOFT Records API listening on :${PORT}`));
}

module.exports = app;
