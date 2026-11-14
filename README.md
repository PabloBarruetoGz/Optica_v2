# Óptica Duhalde

- `v1/`: versión estática original.
- `v2/`: React + TypeScript, API Express + TypeScript y PostgreSQL.

## Ejecutar v2

Requisitos: Node.js 22.12 o superior y Docker Desktop iniciado.

Desde la raíz del proyecto:

```sh
npm install
npm run dev
```

Abrir http://127.0.0.1:5186. El comando prepara PostgreSQL en Docker, crea el esquema e inicia frontend y backend. La primera ejecución descarga la imagen de PostgreSQL. Los datos permanecen en un volumen al detener el proceso.

Detalles en [v2/README.md](v2/README.md).

## Cuentas

En `/cuenta` se puede registrar e iniciar sesión como Cliente. Solo existen los perfiles Administrador y Cliente. Para crear el primer Administrador ejecutar `npm run admin:create` desde la raíz; solicita los datos de forma interactiva.
