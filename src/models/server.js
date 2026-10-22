const express = require('express');
const cors = require('cors');
const path = require('path');

// Rutas base del proyecto (relativas a src/models/)
const PROJECT_ROOT = path.join(__dirname, '..', '..');
const PUBLIC_DIR = path.join(PROJECT_ROOT, 'public');
const ADMIN_DIR = path.join(PUBLIC_DIR, 'admin');
const MASTERPLAN_DIR = path.join(PUBLIC_DIR, 'masterplan');
const SITE_DIR = path.join(PUBLIC_DIR, 'website');

class Server {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 8080;
    this.usersPath = '/api/users';
    this.loginPath = '/api/login';
    this.adminPath = '/api/admin';
    this.aiPath = '/api/ai';
    this.leadsPath = '/api/leads';

    this.connectDB();
    this.middlewares();
    this.routes();
    this.handle404();
  }

  async connectDB() {
    // Synchronize lot configuration from Supabase to local XML on startup
    const { syncLotsOnStartup } = require('../helpers/modifyXML');
    try {
      await syncLotsOnStartup();
    } catch (err) {
      console.warn('Non-fatal startup sync warning (usually read-only filesystem):', err.message);
    }
    console.log('Database online [Supabase + Auth]');
  }

  middlewares() {
    const corsOptions = {
      origin: '*', // Ajusta según sea necesario
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization']
    };

    this.app.use(cors(corsOptions));
    this.app.use(express.json());

    // Serve pano.xml dynamically from Supabase before static mapping
    const { generateDynamicXML } = require('../helpers/modifyXML');
    this.app.get('/masterplan/pano.xml', async (req, res) => {
      try {
        const xml = await generateDynamicXML();
        res.type('application/xml');
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
        res.send(xml);
      } catch (err) {
        console.error('Error serving dynamic pano.xml:', err);
        res.status(500).send('Error loading pano.xml');
      }
    });

    // 1. Dashboard (loginForm.html, adminForm.html, js/)
    this.app.get(['/admin', '/admin/', '/admin/login'], (req, res) => {
      res.redirect('/admin/loginForm.html');
    });
    this.app.get('/admin/dashboard', (req, res) => {
      res.redirect('/admin/adminForm.html');
    });
    this.app.get(['/loginForm.html', '/loginform.html'], (req, res) => {
      res.redirect('/admin/loginForm.html');
    });
    this.app.get(['/adminForm.html', '/adminform.html', '/adminform.hrml'], (req, res) => {
      res.redirect('/admin/adminForm.html');
    });
    this.app.use('/admin', express.static(ADMIN_DIR));

    // 2. Master Plan 360 — servido bajo /masterplan/
    this.app.use('/masterplan', express.static(MASTERPLAN_DIR));

    // 3. Sitio web del proyecto — servido en la raíz
    this.app.use(express.static(SITE_DIR));
  }

  routes() {
    this.app.use(this.usersPath, require('../routes/user.routes'));
    this.app.use(this.loginPath, require('../routes/login.routes'));
    this.app.use(this.adminPath, require('../routes/admin.routes'));
    this.app.use(this.aiPath, require('../routes/ai'));
    this.app.use(this.leadsPath, require('../routes/lead.routes'));
  }

  handle404() {
    this.app.use((req, res) => {
      if (req.accepts('html')) {
        res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html'));
      } else if (req.accepts('json')) {
        res.status(404).json({ error: '404 - Not Found' });
      } else {
        res.status(404).type('txt').send('404 Not Found');
      }
    });
  }

  listen() {
    this.app.listen(this.port, () => {
      console.log(`Server running at http://localhost:${this.port}/`);
    });
  }
}

module.exports = Server;
