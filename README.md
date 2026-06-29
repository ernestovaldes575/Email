# WhatsApp Login Demo

Prototipo frontend para registrar un correo, asociar un numero telefonico y simular una autorizacion desde WhatsApp.

## Ejecutar

Abre `index.html` directamente en el navegador o usa:

```bash
npm.cmd install
npm.cmd run serve
```

## Pruebas

```bash
npm.cmd test
```

## Integracion real de WhatsApp

Este demo abre WhatsApp con un mensaje de autorizacion y valida el codigo en el navegador. Para validar automaticamente desde WhatsApp se necesita un backend que genere el reto, guarde sesiones, reciba webhooks y envie/reciba mensajes mediante WhatsApp Business Cloud API o un proveedor como Twilio.
