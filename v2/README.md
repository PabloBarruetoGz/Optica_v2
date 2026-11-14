# Óptica Duhalde · v2

Frontend React + TypeScript con Vite; backend Express + TypeScript; base de datos PostgreSQL 17. Ambas aplicaciones tienen sus propios directorios, dependencias y compilación, coordinados con npm workspaces.

```text
v2/
  frontend/src/components/   Secciones React, formulario y carrusel
  frontend/public/assets/    Estilos, fuentes e imágenes locales
  backend/src/               API, validación y conexión PostgreSQL
  backend/migrations/        Esquema SQL
  scripts/prepare.mjs         Preparación del entorno local
  compose.yaml               PostgreSQL con volumen persistente
```

## Inicio

Node.js >=22.12 y Docker Desktop iniciado. Desde la raíz del repositorio ejecutar `npm install` y `npm run dev`. También se puede ejecutar `npm install` y `npm run dev` directamente desde `v2/`.

- Frontend: http://127.0.0.1:5186
- Backend: http://127.0.0.1:3186/api/health
- PostgreSQL local: `127.0.0.1:5486`

El primer inicio crea `v2/.env` desde `.env.example`, arranca PostgreSQL y ejecuta la migración idempotente antes de iniciar ambos servidores con recarga automática. Ctrl+C detiene ambos servidores; PostgreSQL sigue disponible. Para detener la base: `npm run db:down` desde `v2/`. Su volumen conserva los datos.

Para usar PostgreSQL existente, configurar `DATABASE_URL` y `SKIP_DOCKER=true` en `v2/.env`. La conexión debe tener permiso para crear la tabla `inquiries`. La configuración predeterminada es exclusiva para desarrollo local.

## Formulario y API

`POST /api/inquiries` recibe JSON con `kind`, `name`, `email`, `phone`, `service` y `message` opcional. Para `kind: "Operativo empresarial"` exige además `company`, `employees` (entero positivo), `appointmentDate` (YYYY-MM-DD) y `appointmentTime` (HH:mm); `address` es opcional.

Respuestas: 201 con identificador y confirmación, 400 con errores de validación, 429 al exceder 10 envíos por 15 minutos por IP y 503 si no puede persistir. Las consultas se guardan mediante parámetros SQL. No hay una ruta pública para leer los datos personales.

El formulario confirma éxito únicamente después de guardar en PostgreSQL. Esta versión no envía correos. Las solicitudes se pueden consultar desde Mi cuenta con el perfil Administrador.

## Desarrollo y compilación

Desde `v2/`:

```sh
npm run check
npm test
npm run build
npm run db:migrate
```

La raíz también permite ejecutar `npm run check`, `npm test` y `npm run build`.

La compilación genera `frontend/dist` y `backend/dist`. Para ejecutar la API compilada: `npm run start -w backend`. En producción hay que servir `frontend/dist` y configurar un proxy `/api` hacia la API; el proxy automático de Vite solo aplica en desarrollo.

Se migraron las secciones de v1 a TSX conservando clases y estilos del diseño. El formulario y los carruseles funcionan con React; no se ejecutan scripts de WordPress, Elementor o WPForms. Mapas, enlaces de WhatsApp, redes, y fuentes remotas conservan dependencias externas.

## Fidelidad visual

Se restauraron los contenedores originales, los carruseles de una imagen, las hojas de estilo del formulario, el menú móvil, el botón flotante de WhatsApp y la sección de ubicación con fotografía. Las capturas y mediciones de escritorio (1440 px) y móvil (390 px) están en `validation/`. El formulario conserva el diseño original y persiste mediante la API propia.

## Perfiles y acceso

Solo existen dos perfiles en PostgreSQL:

| Perfil | Permisos actuales |
| --- | --- |
| Administrador | Editar sus datos, consultar los últimos 100 usuarios y solicitudes, asignar perfiles a otros usuarios y reemplazar fotos de los carruseles. |
| Cliente | Registrarse, iniciar/cerrar sesión y editar su propio nombre. |

La pantalla está en `/cuenta` y se abre desde **Mi cuenta** en el menú. El registro público siempre asigna Cliente. El rol se valida en el backend y en la base de datos; no se acepta desde el registro o la edición personal. Los cambios de rol revocan las sesiones del usuario afectado. Un administrador no puede cambiar su propio rol y el último administrador queda protegido.

La autenticación usa Better Auth con contraseñas hash y sesiones en PostgreSQL mediante cookies HttpOnly. El inicio de desarrollo genera una clave `BETTER_AUTH_SECRET` persistente y local si todavía no existe. `BETTER_AUTH_URL` debe ser la dirección pública del frontend; en producción se debe usar HTTPS. El proxy `/api` debe conservar las cookies.

### Crear el primer administrador

Después de preparar la base con `npm run dev`, abre otra terminal en la raíz y ejecuta:

```sh
npm run admin:create
```

El comando solicita nombre, correo y una contraseña de entre 12 y 128 caracteres que no muestra en pantalla. No hay cuentas ni contraseñas predeterminadas. No se promueven automáticamente cuentas existentes; debe usarse un correo nuevo o solicitar el cambio a otro administrador.

### Verificación de permisos

```sh
npm run test:integration
```

Requiere PostgreSQL preparado y `.env`. Comprueba registro, inicio/cierre de sesión, almacenamiento de contraseñas hash, rechazo de escalamiento de permisos, separación entre perfiles y revocación de sesiones. Crea únicamente usuarios de prueba y los elimina al terminar.

La recuperación de contraseña y verificación por correo quedan pendientes de configurar un proveedor de email. Esta primera pantalla de cliente incluye sus datos personales; no incluye historial de compras ni órdenes.

## Acceso con Google

El botón **Continuar con Google** inicia OAuth desde `/cuenta`. El backend valida la identidad con Google y guarda el usuario y su cuenta vinculada en las tablas `user` y `account` de PostgreSQL. Al volver a ingresar reutiliza la cuenta. Un usuario nuevo recibe Cliente; un usuario existente conserva su perfil. Solo se solicitan identidad básica, nombre y correo (`openid`, `profile`, `email`).

Configuración exclusivamente en `v2/.env`:

```dotenv
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
BETTER_AUTH_URL=http://127.0.0.1:5186
```

El cliente en Google Cloud debe ser de tipo **Aplicación web**. En desarrollo debe autorizar:

- Origen JavaScript: `http://127.0.0.1:5186`
- URI de redirección: `http://127.0.0.1:5186/api/auth/callback/google`

El callback usa el puerto del frontend porque Vite redirige `/api` al backend. Accede con el mismo host configurado en `BETTER_AUTH_URL`; `localhost` y `127.0.0.1` son distintos para las cookies de OAuth. Al publicar, configura el dominio HTTPS definitivo tanto en `BETTER_AUTH_URL` como en las URI autorizadas de Google. Después de cambiar las credenciales, reinicia `npm run dev`.

El secreto de Google no se expone en React ni en `/api/auth-options`. Si faltan las credenciales, el botón queda deshabilitado y sigue disponible el acceso con correo. Las credenciales deben pertenecer a un proyecto propio de Óptica Duhalde, sin reutilizar las de otras aplicaciones.

Las pruebas `npm run test:integration` también recorren el flujo OAuth con respuestas de Google simuladas: autorización con PKCE, callback, persistencia, reingreso sin duplicados, conservación del rol y rechazo de un estado inválido. La prueba real requiere el cliente OAuth configurado y la autorización del titular de una cuenta Google.

### Configuración local creada

Se creó el proyecto Google Cloud `optica-duhalde-20261022` con un cliente OAuth de Aplicación web independiente. Las credenciales están en `v2/.env`, excluido del control de versiones. El proyecto está en modo **Prueba** y la cuenta del propietario está habilitada como usuario de prueba. Para que accedan otras cuentas debe agregarse cada usuario de prueba o completar la configuración y publicación en Google Cloud. El consentimiento de cada cuenta se solicita directamente en Google.

## Administración de fotos de los carruseles

En **Mi cuenta → Administración → Carruseles**, un Administrador puede cambiar entre las pestañas Examen visual completo, Venta de lentes ópticos, Entrega en la empresa y Asesoría de imagen. Cada foto permite seleccionar un archivo, ver la vista previa, escribir su descripción y guardar. La tarjeta **Agregar foto** permite subir una imagen nueva, con vista previa y descripción, al final del carrusel seleccionado. Todas las fotos incluyen **Descargar imagen** y **Eliminar imagen**. La eliminación solicita confirmación y permite cancelar antes de borrar. Cada carrusel debe conservar al menos **7 imágenes**: al alcanzar ese mínimo se desactiva eliminar y el backend rechaza la operación con HTTP 409, incluso ante solicitudes simultáneas. Agregar, reemplazar y descargar siguen disponibles. Al eliminar, se actualizan el contador y la numeración consecutiva, conservando el orden de las restantes. El botón **Restaurar original** revierte una foto original reemplazada.

Se admiten JPG, PNG y WebP de hasta 8 MB y 40 megapíxeles. El backend valida y vuelve a codificar cada imagen a WebP, con un tamaño máximo de 2048 × 2048 px, y guarda los bytes en PostgreSQL (`carousel_images`). `carousel_slides` conserva el orden, la descripción y la foto original. No se requiere almacenamiento externo ni guardar archivos subidos dentro del frontend. Las migraciones conservan los reemplazos existentes.

La página pública usa `GET /api/carousels` y `GET /api/carousel-images/:id`. Las rutas de administración exigen sesión de Administrador y validan el origen de la solicitud. Los Clientes no pueden cambiar imágenes. La página pública actualiza las fotos al cargarse o recuperar el foco; si la API no está disponible conserva las imágenes locales originales.

Las pruebas de integración cubren permisos, formatos inválidos, tamaño máximo, nuevas fotos, subidas simultáneas sin conflictos de orden, lectura pública, descarga, restauración y eliminación de fotos originales y agregadas con renumeración. El registro `app_migrations` aplica cada migración una sola vez, evitando que las fotos eliminadas se vuelvan a crear al reiniciar.

### Texto de Servicios corporativos

Las pestañas Examen visual completo, Venta de lentes ópticos y Entrega en la empresa incluyen un editor de título y descripción. Se guardan juntos en el mismo registro del carrusel y se muestran junto a sus fotos en Servicios corporativos. Los textos se renderizan como texto plano. Solo un Administrador puede editarlos; se validan título de 2 a 100 caracteres y descripción de 10 a 1500 caracteres. Cada foto también permite guardar su descripción accesible sin reemplazar el archivo.

### Reglas de los momentos corporativos

- Servicio corporativo contiene tres momentos: examen visual, venta de lentes y entrega en la empresa.
- Cada momento tiene un único título y descripción común, asociados a varias fotos (relación uno a muchos). La rotación cambia la foto, no el texto del momento.
- Cada foto pertenece a un solo momento mediante `carousel_slides.carousel_key`, con clave foránea a `carousels.key`. Las rutas comprueban el identificador de foto y de momento juntos.
- El mínimo de siete fotos y la numeración consecutiva se aplican por momento, nunca sobre el total de fotos de los tres momentos.
- Reemplazar o eliminar una foto no modifica el texto común ni otra galería. El texto alternativo de cada foto es independiente de la descripción visible del momento.
- Asesoría de imagen es una galería independiente de estos tres momentos.

El mantenedor agrupa los tres momentos bajo un único ítem **Servicio corporativo**. Al seleccionarlo aparecen las pestañas de Examen visual, Venta de lentes y Entrega. Asesoría de imagen permanece como un ítem independiente. La selección del momento corporativo se conserva al alternar entre ambos ítems.

## Instagram en el home

**Administración → Instagram** permite activar u ocultar la sección, agregar hasta 12 enlaces públicos de fotos o reels, ordenarlos y quitarlos antes de guardar. Los enlaces se normalizan y se rechazan duplicados, perfiles completos y dominios ajenos a Instagram. Los cambios se guardan en PostgreSQL (`instagram_section`) y se publican juntos al guardar. Se configuraron tres reels reales de `@opduhalde` para la prueba.

Esta modalidad usa reproductores oficiales incrustados y no requiere claves, contraseñas, cuenta profesional ni sincronización por API. Las publicaciones nuevas se agregan manualmente. Que un perfil sea público no garantiza que todas sus publicaciones permitan inserción; su disponibilidad y reproducción dependen de Instagram, de sus ajustes y del navegador. Cada publicación conserva un enlace directo como alternativa. Los reproductores se cargan cuando se acercan al área visible. La API de edición exige Administrador y un origen autorizado; la API pública no revela publicaciones de una sección desactivada.

## Órdenes, agenda y reservas

- Administrador: en `/cuenta`, abre **Órdenes de compra**, busca un cliente registrado, ingresa los datos, el teléfono destinatario y el consentimiento. Abre el detalle para cambiar el estado o consultar el historial y el resultado del aviso. La lista admite búsqueda y filtros. Los códigos, etiquetas y transiciones se definen en tablas; los cambios de flujo se gestionan por migración.
- Cliente: en **Mis lentes** consulta exclusivamente sus órdenes y el progreso registrado. Las observaciones internas se reservan al administrador. No pongas información clínica en la descripción pública de la orden.
- Administrador: en **Agenda**, elige una semana, agrega uno o más bloques y publica los borradores. Las citas confirmadas solo cambian con las acciones **Cancelar cita** o **Reprogramar**. Estas acciones no generan avisos externos.
- Visitante: en el home, elige **Agenda tu asesoría de imagen**, selecciona un cupo y confirma. No necesita crear una cuenta. Los horarios se interpretan en America/Santiago; la base de datos evita que se superpongan los cupos o se confirme dos veces la misma hora.

### WhatsApp Cloud API

El remitente debe ser **+56 9 5363 9502**, registrado y habilitado en Meta. El servidor contrasta ese número con el devuelto por Meta para el identificador configurado. El destino es el teléfono chileno introducido por el administrador en cada orden, con consentimiento del cliente.

Configura en `v2/.env` las variables `WHATSAPP_*` documentadas en `.env.example`. Son necesarios el identificador del número remitente, token autorizado, versión de Graph API y nombre e idioma de una plantilla aprobada. El cuerpo de la plantilla debe usar un solo parámetro posicional de texto: el número de orden. Texto sugerido: «Hola. Tus lentes de Óptica Duhalde de la orden {{1}} ya están listos para retiro. ¡Te esperamos!». El mensaje no incluye datos clínicos, notas internas ni nombre del cliente.

Para registrar entregas, suscribe el evento `messages` de Meta a una URL HTTPS que alcance `/api/webhooks/whatsapp` y configura `WHATSAPP_APP_SECRET` y `WHATSAPP_VERIFY_TOKEN`. No hace falta exponer el servidor local para ejecutar las pruebas simuladas. Deja `WHATSAPP_ENABLED=false` hasta completar la configuración y revisar los avisos pendientes: al activarlo, se procesan las órdenes listas vigentes que tengan consentimiento.

Meta puede aceptar una solicitud sin haber entregado aún el mensaje. El panel diferencia esos resultados. El trabajador reintenta respuestas de límite de frecuencia; ante una respuesta incierta no reenvía automáticamente para evitar duplicados. Las órdenes siguen disponibles si Meta falla. Guía de Meta: https://developers.facebook.com/documentation/business-messaging/whatsapp/overview/

Migraciones aditivas: `011_orders.sql` y `012_advisory_agenda.sql`. Se aplican con `npm run dev` o `npm --prefix v2 run db:migrate`. Verifica con `npm run build`, `npm test` y `npm run test:integration`. Las pruebas de WhatsApp usan un proveedor simulado; no envían mensajes reales.
