# Sitio Web Laguna Los Corrales

Sitio web estático oficial del proyecto de macroparcelas **Laguna Los Corrales** (Lago Ranco, Región de Los Ríos).

Este proyecto es 100% estático (HTML, CSS y JavaScript nativo), sin dependencias ni backend local, optimizado para despliegue directo en cualquier plataforma (Vercel, Netlify, cPanel, GitHub Pages, etc.).

## Integraciones Externas

* **Master Plan 360:** [https://masterplan.astra360.cl/projects/Laguna-los-corrales/index.html](https://masterplan.astra360.cl/projects/Laguna-los-corrales/index.html)
* **Panel de Administración:** [https://masterplan.astra360.cl/admin](https://masterplan.astra360.cl/admin)
* **Recepción de Leads (Formulario):** `https://masterplan.astra360.cl/api/leads`

## Estructura de Archivos

```
├── index.html            # Página de inicio del sitio web
├── 404.html              # Página de error 404 personalizada
├── loginForm.html        # Redirección automática a masterplan.astra360.cl/admin
├── admin/                # Redirecciones automáticas para rutas /admin
│   ├── index.html
│   ├── loginForm.html
│   └── adminForm.html
├── css/                  # Estilos visuales del sitio
├── js/                   # Scripts del sitio e integración del formulario
├── img/                  # Imágenes y logotipos
├── assets/               # Recursos multimedia adicionales
├── modal/                # Modales del sitio
├── styles.css
└── whatsappbutton.css    # Botón flotante de WhatsApp
```
