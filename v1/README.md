# Óptica Duhalde · v1

Copia estática del diseño de https://opticaduhalde.cl/, con HTML dividido en secciones y CSS, JavaScript, fuentes e imágenes separados. `Base del Proyecto` permanece intacta.

## Abrir

Desde esta carpeta:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Visitar http://127.0.0.1:8765/. El servidor HTTP permite ejecutar también los módulos y cargas dinámicas de los plugins.

## Organización

```text
v1/
├── index.html                     # Resultado compilado
├── src/
│   ├── index.html                 # Composición de plantillas
│   └── templates/
│       ├── document-start.html    # Metadatos, estilos y apertura
│       ├── main.html              # Composición de las secciones
│       ├── sections/              # 11 secciones independientes
│       └── document-end.html      # Scripts y cierre
├── assets/
│   ├── css/
│   │   ├── project/               # Estilos del proyecto extraídos del HTML
│   │   ├── recovered/             # post-9, base-desktop y base-mobile originales
│   │   └── vendor/                # Estilos de librerías
│   ├── js/
│   │   ├── project/               # Inicialización y configuración
│   │   └── vendor/                # Librerías y plugins
│   ├── media/                     # Imágenes y fuentes
│   └── manifest.json              # Procedencia, recuperación y hash del original
├── tools/
│   ├── build.py                   # Compilación sin dependencias externas
│   ├── import_reference.py        # Importación de la referencia guardada
│   ├── prepare.py                 # Reimportación y compilación
│   └── live-reference.html        # HTML servido por el sitio de referencia
└── validation/                    # Capturas y mediciones de escritorio y móvil
```

## Editar y compilar

Editar `src/templates/sections/`, `assets/css/project/` o `assets/js/project/` según corresponda. Después:

```sh
python3 tools/build.py
```

`index.html` es generado. El contenido llega renderizado sin necesitar JavaScript para ensamblar plantillas. Se conservan las clases, atributos, estilos de elementos y librerías de Elementor para respetar el diseño original.

`python3 tools/prepare.py` vuelve a importar la referencia guardada y reemplaza las plantillas y los estilos/scripts extraídos. Usar únicamente para repetir la importación, no después de hacer cambios manuales que se quieran conservar. Las tres hojas recuperadas se mantienen locales.

## Corrección y validación visual

La primera importación carecía de tres hojas esenciales: el servidor devolvía 404 al descargarlas. Se recuperaron las reglas de `post-9.css`, `base-desktop.css` y `base-mobile.css` de la página original ya cargada en Chrome. También se recuperaron las imágenes exactas observadas en ese navegador y se corrigieron las rutas de imágenes del selector telefónico.

Se sustituyó la captura del DOM ya inicializado por el HTML limpio servido por el sitio para evitar duplicar carruseles y controles. La configuración de WPForms se carga antes del plugin para que separarla en archivos no introduzca una carrera de inicialización. El enlace Inicio apunta a la raíz local.

La comparación geométrica de los 136 elementos de Elementor no presentó diferencias mayores a 1 px en escritorio ni a 390 px de ancho. Se verificaron la portada, el menú móvil, la navegación por anclas, los carruseles y la aparición de campos al elegir Operativo empresarial. La carga HTTP validada no presentó errores JavaScript. Las capturas están en `validation/`.

## Funciones externas

Esta versión reproduce el frontend y conserva integraciones originales; no incluye el backend de WordPress. El formulario requiere el servidor original, tokens y políticas de acceso válidos para enviar datos. No se enviaron consultas durante las pruebas. Mapas, reseñas, WhatsApp y algunas cargas dinámicas de los plugins siguen utilizando servicios externos. No es una versión completamente sin conexión.
